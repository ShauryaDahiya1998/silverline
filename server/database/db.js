const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { formatMemberNumber } = require('../utils/memberNumber');
const { formatHelpId, HELP_ID_RE } = require('../utils/helpId');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
throw new Error('DATABASE_URL is not set. Check server/.env');
}

// Parse the connection string ourselves (Node's URL parser) instead of
// letting pg's internal parser handle it alongside an explicit ssl option —
// that combination was resolving to the wrong host.
const dbUrl = new URL(process.env.DATABASE_URL);

const pool = new Pool({
host: dbUrl.hostname,
port: dbUrl.port ? Number(dbUrl.port) : 5432,
user: decodeURIComponent(dbUrl.username),
password: decodeURIComponent(dbUrl.password),
database: dbUrl.pathname.replace(/^\//, ''),
ssl: { rejectUnauthorized: false },
});

// Auto-approval rule 1's exact wording — module-scope (not just inside the
// seed block below) so routes/assignments.js's evaluator can match against
// it by exact text rather than duplicating the string, since there's still
// no free-text rule-parsing engine (see routes/autoMatch.js) — only this one
// specific rule is actually evaluated/enforced.
const DEFAULT_AUTO_MATCH_RULE =
'If the same combination of creator and consumer have been approved by Admin for the same item twice in the last 6 months and the consumer is first in order of request, auto-approve the match.';

// Without this, an idle connection dropped by Neon (its free-tier compute
// auto-suspends after inactivity, then resets the connection on wake) fires
// an 'error' event on the pool with no listener attached — Node treats that
// as an uncaught exception and kills the entire server process. This was the
// most likely cause of the server crashing/502ing at random, unrelated to
// any particular request or the app's size. Logging it here instead keeps
// the pool (and the rest of the server) alive; pg reconnects a fresh client
// for the next query on its own.
pool.on('error', (err) => {
console.error('Unexpected error on idle PG client (connection recovered automatically):', err.message);
});

async function initDB() {
// One-time rename: tasks -> helps, assignments.task_id -> help_row_id (kept
// distinct from helps.help_id — the human-readable code like XAAA0001 — to
// avoid two very differently-meaning columns sharing a name). Must run
// before schema.sql's CREATE TABLE IF NOT EXISTS helps below, otherwise an
// existing "tasks" table would be left behind alongside a second, empty
// "helps" table instead of being renamed in place.
try {
const tasksExists = await pool.query(`SELECT to_regclass('public.tasks') AS reg`);
const helpsExists = await pool.query(`SELECT to_regclass('public.helps') AS reg`);
if (tasksExists.rows[0].reg && !helpsExists.rows[0].reg) {
await pool.query('ALTER TABLE tasks RENAME TO helps');
console.log('Renamed tasks table to helps');
}
const colCheck = await pool.query(
`SELECT column_name FROM information_schema.columns WHERE table_name = 'assignments' AND column_name = 'task_id'`
);
if (colCheck.rows.length > 0) {
await pool.query('ALTER TABLE assignments RENAME COLUMN task_id TO help_row_id');
console.log('Renamed assignments.task_id to help_row_id');
}
} catch (err) {
console.error('tasks->helps rename error:', err.message);
}

// One-time rename: volunteers -> helpers, matching the tasks->helps rename
// above — the DB table (and this file, routes/volunteers.js -> helpers.js)
// predated the app-wide Volunteer->Helper terminology change and were left
// behind. Must run before schema.sql's CREATE TABLE IF NOT EXISTS helpers
// below, otherwise an existing "volunteers" table would be left in place
// alongside a second, empty "helpers" table instead of being renamed in
// place. Foreign keys (e.g. assignments.volunteer_id) keep pointing at the
// same table automatically across a RENAME — no separate fix-up needed.
try {
const volunteersExists = await pool.query(`SELECT to_regclass('public.volunteers') AS reg`);
const helpersExists = await pool.query(`SELECT to_regclass('public.helpers') AS reg`);
if (volunteersExists.rows[0].reg && !helpersExists.rows[0].reg) {
await pool.query('ALTER TABLE volunteers RENAME TO helpers');
console.log('Renamed volunteers table to helpers');
}
} catch (err) {
console.error('volunteers->helpers rename error:', err.message);
}

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
// Strip SQL line comments before splitting on ';' — this is a naive
// (non-SQL-aware) splitter, so a semicolon anywhere in a comment (e.g. "one
// thing; another thing") used to cut a CREATE TABLE statement in half and
// silently break it. Comments carry no runtime meaning, so removing them
// first makes the split immune to this regardless of what anyone writes in
// a future comment.
const schemaWithoutComments = schema.replace(/--.*$/gm, '');
const statements = schemaWithoutComments.split(';').map(s => s.trim()).filter(s => s.length > 0);
for (const statement of statements) {
try {
await pool.query(statement);
} catch (err) {
if (!err.message.includes('already exists')) {
console.error('DB init error:', err.message);
}
}
}

// Migrations for email authentication columns
const migrations = [
`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE`,
`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)`,
`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255)`,
`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP`,
// Every account now only ever gets created after the OTP step on
// Verify-to-register (see routes/auth.js POST /register), so a second,
// separate email-click verification is redundant — mark any account still
// sitting at is_verified = FALSE (created under the old flow, before that
// change) as verified too, regardless of whether it was ever issued a
// verification_token, so nobody is stuck behind a step that no longer exists.
`UPDATE users SET is_verified = TRUE WHERE is_verified = FALSE`,
// Rename the 'volunteer' role to 'helper' — update existing rows first, then
// swap the CHECK constraint so both old and new data stay valid.
`UPDATE users SET role = 'helper' WHERE role = 'volunteer'`,
`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`,
`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'helper', 'beneficiary'))`,
// New Helper Registration fields: free-text bio and drag-ordered contact preference
`ALTER TABLE helpers ADD COLUMN IF NOT EXISTS about_me TEXT`,
`ALTER TABLE helpers ADD COLUMN IF NOT EXISTS contact_preference JSONB`,
// Phone number on the account itself, so a helper/beneficiary can log in
// with either their email or their phone number (same password either way).
`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`,
`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_unique`,
`ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone)`,
// Same two fields on Beneficiary Registration, now that it mirrors the
// Helper Registration form (About Me + drag-ordered contact preference).
`ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS about_me TEXT`,
`ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS contact_preference JSONB`,
// The Regions preference (either "distance to a centre point" or "5 named
// areas") was being collected and shown in Preview on both registration
// forms but had nowhere to go on submit — add the column on both tables.
`ALTER TABLE helpers ADD COLUMN IF NOT EXISTS preferred_regions JSONB`,
`ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS preferred_regions JSONB`,
// The Address field on both registration forms is entered as separate
// street / house number / city / pincode boxes but was only ever saved as
// one combined string — store the components individually too.
`ALTER TABLE helpers ADD COLUMN IF NOT EXISTS street VARCHAR(255)`,
`ALTER TABLE helpers ADD COLUMN IF NOT EXISTS house_number VARCHAR(20)`,
`ALTER TABLE helpers ADD COLUMN IF NOT EXISTS city VARCHAR(100)`,
`ALTER TABLE helpers ADD COLUMN IF NOT EXISTS pincode VARCHAR(20)`,
`ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS street VARCHAR(255)`,
`ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS house_number VARCHAR(20)`,
`ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS city VARCHAR(100)`,
`ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS pincode VARCHAR(20)`,
// Home page: an organization-assigned member ID shown alongside the account's
// email/phone (e.g. "HAA0001" for helpers, "BAA0001" for beneficiaries).
// Auto-generated sequentially at registration time (see helpers.js /
// beneficiaries.js POST routes) — this migration just adds the column.
`ALTER TABLE helpers ADD COLUMN IF NOT EXISTS member_number VARCHAR(20) UNIQUE`,
`ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS member_number VARCHAR(20) UNIQUE`,
// Home page task history table (Value / Hours / On Time % / Ratings) —
// value lives on the help request itself, the rest are per-assignment
// since they depend on how that particular helper performed on that
// particular help item.
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS value DECIMAL(10,2)`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS on_time BOOLEAN`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS rating_received SMALLINT`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS rating_given SMALLINT`,
// New Help form (Category / Sub-category / Item / quantity+unit), populated
// from the Help.xlsx taxonomy on the client. Item itself is stored as the
// help request's title, and the free-text description field holds the
// "Additional description" box (Brand, new/used, colour, material etc.).
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS category VARCHAR(100)`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS sub_category VARCHAR(100)`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS quantity DECIMAL(10,2)`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS unit VARCHAR(20)`,
// New/Used condition on the requested item, with an age (only meaningful
// when condition = 'Used') recorded as a number + unit pair.
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS condition VARCHAR(10)`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS age_value DECIMAL(10,2)`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS age_unit VARCHAR(10)`,
// Persist a real Help ID per help request instead of computing one on the
// client from list position (which drifted as items moved between lists),
// plus who/what created it — IP address and a lightly-parsed device
// type/brand from the User-Agent header (see server/utils/device.js).
// Recorded at creation time on POST /help; created_at already covers
// date/time.
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS help_id VARCHAR(20) UNIQUE`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS created_ip VARCHAR(64)`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS created_user_agent TEXT`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS device_type VARCHAR(20)`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS device_brand VARCHAR(50)`,
// Up to 3 optional photos for a New Help item — only offered on the client
// for Food/Clothes/Toiletries (see NewHelp.jsx CONDITION_CATEGORIES),
// stored the same way registration photos are (base64 data URLs), so no
// separate file-storage setup was needed.
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS photo_urls TEXT[]`,
// Thread a message chain together (Account > Messages Reply). A message
// starts its own thread (thread_id = its own id) unless it's a reply, in
// which case it inherits the thread_id of the message it replied to — see
// POST /messages/:id/reply.
`ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id UUID`,
`UPDATE messages SET thread_id = id WHERE thread_id IS NULL`,
// A help item can only actually become "Matched" once an admin has signed
// off on it — either manually, or via an auto-approval rule — not merely
// because the other party accepted. See PUT /assignments/:id/respond.
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN NOT NULL DEFAULT FALSE`,
// Settings > My account > Delete account needs DELETE FROM users to cascade
// cleanly through everything that account touched, instead of failing with
// a foreign-key violation the moment the person had ever created a help
// item, been assigned one, or sent a message. These 5 columns predate this
// feature and were created with no ON DELETE behavior (defaulting to
// RESTRICT) — replace each with the one that matches what should actually
// happen to that row once the referenced account is gone: helps they
// created and assignments naming them are their own data, so those cascade
// away too; assignments/honors/messages another user only touched in
// passing (assigned_by / awarded_by / sender_user_id) just lose that
// attribution (SET NULL) rather than disappearing.
// helps was renamed from tasks (see the one-time rename above), and a
// table RENAME doesn't rename the constraints that came with it — this
// column's FK was still named tasks_created_by_fkey with no ON DELETE
// (defaulting to RESTRICT), left in place alongside the newly-added
// helps_created_by_fkey below rather than replaced by it, so deleting a
// user who'd ever created a help item still failed under the old name.
`ALTER TABLE helps DROP CONSTRAINT IF EXISTS tasks_created_by_fkey`,
`ALTER TABLE helps DROP CONSTRAINT IF EXISTS helps_created_by_fkey`,
`ALTER TABLE helps ADD CONSTRAINT helps_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE`,
`ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_beneficiary_id_fkey`,
`ALTER TABLE assignments ADD CONSTRAINT assignments_beneficiary_id_fkey FOREIGN KEY (beneficiary_id) REFERENCES beneficiaries(id) ON DELETE CASCADE`,
`ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_assigned_by_fkey`,
`ALTER TABLE assignments ADD CONSTRAINT assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL`,
`ALTER TABLE honors DROP CONSTRAINT IF EXISTS honors_awarded_by_fkey`,
`ALTER TABLE honors ADD CONSTRAINT honors_awarded_by_fkey FOREIGN KEY (awarded_by) REFERENCES users(id) ON DELETE SET NULL`,
`ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_user_id_fkey`,
`ALTER TABLE messages ADD CONSTRAINT messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL`,
// Remar Store: admin-authored help items broadcast to everyone in a given
// role, rather than tied to one specific helper/beneficiary the way
// on-behalf-of items are. 'request' = admin asking for help (shown to
// helpers to fulfil), 'offer' = admin offering help (shown to
// beneficiaries to claim). NULL for every ordinary helper/beneficiary
// self-created item — direction only has meaning for admin-owned rows.
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS direction VARCHAR(10)`,
// Mutual post-approval confirmation (Help Status page) — once admin has
// approved a match, the item's creator and the other matched party
// ("consumer", same terminology as the admin Requests row) each tick their
// own box for "is the delivery scheduled?" and "is the delivery completed?"
// instead of the old Cancel/Modify/Delete row. Both true for 'scheduled'
// only changes the displayed status label (like the old scheduled_date
// check it replaces); both true for 'completed' actually flips this row's
// status (and the help item's) to 'completed'. See PUT /assignments/:id/ack.
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS creator_scheduled BOOLEAN NOT NULL DEFAULT FALSE`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS consumer_scheduled BOOLEAN NOT NULL DEFAULT FALSE`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS creator_completed BOOLEAN NOT NULL DEFAULT FALSE`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS consumer_completed BOOLEAN NOT NULL DEFAULT FALSE`,
// Starts the 7-day window after which a help item's Chats thread can no
// longer send messages — set when both parties tick "completed" (see PUT
// /assignments/:id/ack), cleared again if either unchecks.
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`,
// Ties a Chats thread to the specific help item it was started from (via
// the Help Status page's Chat button) — NULL for REMAR/support threads
// that aren't about any particular help item. Powers showing the Help ID
// next to the other party's name in Settings > My account > Chats, and the
// 7-day send lock above.
`ALTER TABLE messages ADD COLUMN IF NOT EXISTS help_row_id UUID REFERENCES helps(id) ON DELETE SET NULL`,
// Post-completion feedback + rating (see PUT /assignments/:id/feedback) —
// both sides' values live on the one assignment row so GET
// /help/:id/counterpart can hand back both parties' feedback together,
// letting admin see both at once instead of either party submitting on
// someone else's behalf.
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS creator_feedback TEXT`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS creator_rating SMALLINT`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS consumer_feedback TEXT`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS consumer_rating SMALLINT`,
// New Help (Food/Toiletries/Clothes only) — Delivery preference (shown to a
// helper offering the item) / Collection preference (shown to a beneficiary
// requesting it), checkboxes below Quantity, both selectable. Stored as
// canonical values regardless of which role created the item — 'pickup'
// (the other party can collect it from the creator's own location: a
// helper's "Pick up from my location" or a beneficiary's "I can pick up"
// mean the same real-world thing) and 'dropoff' (the creator will bring it
// to the other party: a helper's "I can drop off" or a beneficiary's "Drop
// off at my location"). The client maps these two canonical values to the
// right label pair for whichever role actually created the item — see
// client/src/pages/DM/NewHelp.jsx's LOGISTICS_OPTIONS.
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS logistics_preference TEXT[]`,
// The consumer's own accepted subset of the creator's logistics_preference
// on the help item (Universe view's Select/Request popup) — e.g. a creator
// offering both 'pickup' and 'dropoff' options, a consumer ticking only
// 'pickup' before requesting means only that one applies to this specific
// match. Lives on the assignment (one request), not the help item itself
// (which can carry more options than any single consumer accepts) — see
// POST /assignments/apply and POST /assignments/request.
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS logistics_preference TEXT[]`,
// When this admin last opened the Donation / Escalations pages — compared
// against the newest donation/support_tickets row to decide whether Admin
// Home > Services should show the "new" highlight (green for Donation, red
// for Escalations). See donations.js's /unseen + /mark-seen and support.js's
// /tickets/unseen + /tickets/mark-seen.
`ALTER TABLE users ADD COLUMN IF NOT EXISTS donations_seen_at TIMESTAMP`,
`ALTER TABLE users ADD COLUMN IF NOT EXISTS escalations_seen_at TIMESTAMP`,
// Same "new" highlight pattern as donations_seen_at/escalations_seen_at
// above, for Admin Home > Services > Certificate — see certificates.js's
// /unseen + /mark-seen.
`ALTER TABLE users ADD COLUMN IF NOT EXISTS certificates_seen_at TIMESTAMP`,
// pincode_geo_cache was originally keyed on pincode alone, which is
// ambiguous across countries and produced wrong Country/Continent results
// in the admin Reports pivot (e.g. Zurich's 8007, Munich's 81243). Re-key
// it on (pincode, city) together — city NOT NULL means old rows (which
// predate this column) can't satisfy the new primary key, so they're
// cleared out here rather than left behind as permanently-unreachable dead
// rows; every pincode gets re-resolved (correctly, this time) the next time
// a report actually needs it. See server/utils/geo.js.
`ALTER TABLE pincode_geo_cache ADD COLUMN IF NOT EXISTS city VARCHAR(100)`,
`DELETE FROM pincode_geo_cache WHERE city IS NULL`,
`ALTER TABLE pincode_geo_cache ALTER COLUMN city SET NOT NULL`,
`ALTER TABLE pincode_geo_cache DROP CONSTRAINT IF EXISTS pincode_geo_cache_pkey`,
`ALTER TABLE pincode_geo_cache ADD CONSTRAINT pincode_geo_cache_pkey PRIMARY KEY (pincode, city)`,
// Cached entries from before geo.js started passing accept-language=en to
// Nominatim came back in the place's own local language(s) — for
// officially multilingual countries like Switzerland that's every one of
// them joined together ("Schweiz/Suisse/Svizzera/Svizra") instead of a
// single clean "Switzerland". Clearing any cached country containing a
// "/" forces those specific entries to re-resolve (now in English); this
// is a no-op on every later restart since accept-language=en never
// produces a "/"-joined name going forward.
`DELETE FROM pincode_geo_cache WHERE country LIKE '%/%'`,
// Settings > App preferences (per-user, cosmetic only) — see
// server/routes/preferences.js and PreferencesContext.jsx.
`ALTER TABLE users ADD COLUMN IF NOT EXISTS currency VARCHAR(5) NOT NULL DEFAULT 'Fr'`,
`ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(10) NOT NULL DEFAULT 'en'`,
`ALTER TABLE users ADD COLUMN IF NOT EXISTS font_size INTEGER NOT NULL DEFAULT 100`,
`ALTER TABLE users ADD COLUMN IF NOT EXISTS color_theme VARCHAR(10) NOT NULL DEFAULT 'standard'`,
// Account deletion used to CASCADE straight through helpers/beneficiaries
// to every assignment/donation/message that ever referenced them, so
// deleting one account silently destroyed OTHER people's completed-match
// history and chat threads too. Re-pointing these three FKs to SET NULL
// (instead of CASCADE) lets server/utils/accountDeletion.js anonymize and
// detach a profile (name -> "Deleted account", user_id -> NULL) without the
// row itself — or anything that references it by id — disappearing. Safe to
// rerun: DROP CONSTRAINT IF EXISTS no-ops once already applied.
`ALTER TABLE helpers DROP CONSTRAINT IF EXISTS helpers_user_id_fkey`,
`ALTER TABLE helpers ADD CONSTRAINT helpers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`,
`ALTER TABLE beneficiaries DROP CONSTRAINT IF EXISTS beneficiaries_user_id_fkey`,
`ALTER TABLE beneficiaries ADD CONSTRAINT beneficiaries_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`,
`ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_recipient_user_id_fkey`,
`ALTER TABLE messages ADD CONSTRAINT messages_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL`,
// Lets an admin switch a rule off (Auto-approval page) without losing its
// applied_count history. Predates the on/off toggle, so existing rows get
// backfilled active (TRUE) rather than silently going dark on upgrade.
`ALTER TABLE auto_match_rules ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`,
// Registration > Preferences: only collected/shown when 'Professional
// services' is one of the helper's selected skills.
`ALTER TABLE helpers ADD COLUMN IF NOT EXISTS professional_license VARCHAR(100)`,
`ALTER TABLE helpers ADD COLUMN IF NOT EXISTS professional_experience VARCHAR(100)`,
// Item 5: online/physical detection (from Help.xlsx's Delivery column, see
// client/src/data/helpTaxonomy.js's getItemDelivery) + a per-Help-ID
// "Confirm location" address, distinct from the creator's own registered
// address (helpers/beneficiaries.street etc.) since it can be a one-off
// current/manual location instead. NULL confirm_* means "fall back to the
// creator's live registered address", same as before this feature existed.
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS confirm_street VARCHAR(255)`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS confirm_house_number VARCHAR(20)`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS confirm_city VARCHAR(100)`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS confirm_pincode VARCHAR(20)`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS confirm_latitude DECIMAL(10,8)`,
`ALTER TABLE helps ADD COLUMN IF NOT EXISTS confirm_longitude DECIMAL(11,8)`,
// Item 12: optional post-match Schedule (Help Status page) — see
// PUT/DELETE /assignments/:id/schedule. calendar_ics_uid + calendar_sequence
// persist across edits so a re-sent invite carries the same UID with a
// bumped SEQUENCE, letting calendar apps treat it as an update to the
// existing event rather than a brand new one.
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS calendar_datetime TIMESTAMP`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS calendar_duration_minutes INTEGER`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS calendar_meeting_link TEXT`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS calendar_venue TEXT`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS calendar_ics_uid VARCHAR(64)`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS calendar_sequence INTEGER NOT NULL DEFAULT 0`,
`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS calendar_sent_at TIMESTAMP`,
];
for (const m of migrations) {
try { await pool.query(m); } catch (err) { console.error('Migration error:', err.message); }
}

// Backfill/reformat member_number for every volunteer/beneficiary row,
// numbered in registration order so earlier members keep lower numbers.
// Renumbers the whole table (not just NULLs/malformed values) on every
// startup — not gated behind a "does anything look wrong" check, because
// a gap from a deleted row looks perfectly valid format-wise (each
// survivor still matches HAA0001-style) while still leaving the sequence
// non-gapless, which is exactly what let POST /helpers and
// POST /beneficiaries hand out an already-used member_number (duplicate
// key error) after any row was ever deleted. The inner per-row check
// keeps this a no-op once everything already matches its expected
// position, so it's cheap on repeat startups.
try {
// excludeMemberNumber lets the Remar Store system account (HRR0000, see
// the bootstrap below) sit outside this renumbering entirely — otherwise
// every server restart would immediately overwrite its fixed number with
// whatever position it falls into by created_at, same reasoning as the
// register route's own exclusion in helpers.js.
const renumber = async (table, prefix, excludeMemberNumber) => {
const { rows } = await pool.query(
`SELECT id, member_number FROM ${table} WHERE member_number IS DISTINCT FROM $1 ORDER BY created_at ASC`,
[excludeMemberNumber || null]
);
for (let i = 0; i < rows.length; i++) {
const next = formatMemberNumber(prefix, i + 1);
if (rows[i].member_number !== next) {
await pool.query(`UPDATE ${table} SET member_number = $1 WHERE id = $2`, [next, rows[i].id]);
}
}
};
await renumber('helpers', 'H', 'HRR0000');
// BRR0000 (see the Remar Store "asks for help" system account below) sits
// outside beneficiary renumbering the same way HRR0000 does for helpers.
await renumber('beneficiaries', 'B', 'BRR0000');
} catch (err) {
console.error('member_number backfill error:', err.message);
}

// Same idea for helps.help_id — assigns one to any row that doesn't have a
// valid one yet, or whose id doesn't match the current X[H/B]AA0001 scheme
// (pre-existing rows from before the role letter was added), in created_at
// order so earlier help requests keep lower IDs within their own role.
// Two independent per-role sequences (H for a helper's own item, B for a
// beneficiary's) — see server/utils/helpId.js.
try {
const { rows } = await pool.query(
`SELECT h.id, h.help_id, u.role AS creator_role
FROM helps h JOIN users u ON u.id = h.created_by
ORDER BY h.created_at ASC`
);
const roleLetter = (role) => role === 'helper' ? 'H' : role === 'admin' ? 'S' : 'B';
const expectedPrefix = (r) => `X${roleLetter(r.creator_role)}`;
const needsBackfill = rows.some(r => !r.help_id || !HELP_ID_RE.test(r.help_id) || !r.help_id.startsWith(expectedPrefix(r)));
if (needsBackfill) {
const seqByRole = { helper: 0, beneficiary: 0, admin: 0 };
for (const row of rows) {
const role = row.creator_role === 'helper' ? 'helper' : row.creator_role === 'admin' ? 'admin' : 'beneficiary';
seqByRole[role] += 1;
const next = formatHelpId(roleLetter(role), seqByRole[role]);
if (row.help_id !== next) {
await pool.query('UPDATE helps SET help_id = $1 WHERE id = $2', [next, row.id]);
}
}
}
} catch (err) {
console.error('help_id backfill error:', err.message);
}

// Admin accounts are never created through the public Register flow (no
// OTP, no self-signup) — they're seeded here directly, straight into the
// database, so they exist before anyone ever needs to log in as one.
// ON CONFLICT (email) DO NOTHING makes this safe to run on every startup:
// once an account exists it's left alone (so a later password change via
// Change Password isn't silently overwritten on the next restart). Kept
// short deliberately — the product only ever needs 2-3 admin accounts.
const ADMIN_SEEDS = [
{ email: 'Admin@remar.org', password: 'Admin@123' },
];
try {
for (const admin of ADMIN_SEEDS) {
const hash = await bcrypt.hash(admin.password, 10);
await pool.query(
`INSERT INTO users (email, password_hash, role, is_verified)
VALUES ($1, $2, 'admin', TRUE)
ON CONFLICT (email) DO NOTHING`,
[admin.email, hash]
);
}
} catch (err) {
console.error('Admin account seed error:', err.message);
}

// Auto-approval (Admin Home > Services > Auto-approval) starts with this
// one rule on record, as requested — repeat-pair fast-tracking: the same
// creator/consumer combination having already been admin-approved twice in
// the last 6 months, with the consumer first in the request order, is
// treated as trusted enough to skip manual review next time. Actually
// evaluated in routes/assignments.js's PUT /:id/respond (evaluateAutoApprovalRule1)
// — matched by this exact logic text, not just "whichever rule is first".
// Matched by exact logic text rather than a unique constraint, so this is
// safe to run on every startup without creating duplicates.
try {
const existing = await pool.query('SELECT id FROM auto_match_rules WHERE logic = $1', [DEFAULT_AUTO_MATCH_RULE]);
if (!existing.rows[0]) {
await pool.query('INSERT INTO auto_match_rules (logic) VALUES ($1)', [DEFAULT_AUTO_MATCH_RULE]);
}
} catch (err) {
console.error('Auto-match rule seed error:', err.message);
}

// Remar Store — a fixed system "helper" account (member_number 'HRR0000',
// never logged into) that lets Store items (POST /help, admin-created) flow
// through the exact same "on behalf of a helper" path as a real helper's
// own offer — same Help ID sequence, same Map View / All Help Available
// pin, same GET /help/:id/counterpart shape — instead of a bespoke parallel
// system. Its address starts out unset; Admin > Settings > Store location
// sets it (see routes/helpers.js GET/PUT /store-location), same address
// fields as helper/beneficiary registration. ON CONFLICT (email) DO NOTHING
// / (member_number) DO NOTHING make this safe to run on every startup.
try {
const hash = await bcrypt.hash('remar-store-system-account-disabled-login', 10);
await pool.query(
`INSERT INTO users (email, password_hash, role, is_verified)
VALUES ($1, $2, 'helper', TRUE)
ON CONFLICT (email) DO NOTHING`,
['store@remar.internal', hash]
);
const storeUser = await pool.query(`SELECT id FROM users WHERE email = $1`, ['store@remar.internal']);
if (storeUser.rows[0]) {
await pool.query(
`INSERT INTO helpers (user_id, name, nickname, member_number)
VALUES ($1, 'Remar Store', 'Remar Store', 'HRR0000')
ON CONFLICT (member_number) DO NOTHING`,
[storeUser.rows[0].id]
);
}
} catch (err) {
console.error('Remar Store account seed error:', err.message);
}

// Remar Store's second system account — this one on the *beneficiary* side
// (member_number 'BRR0000'), used only for "Help Required" Store items
// (helps.direction = 'request', i.e. Remar Store asking helpers to fulfil
// something rather than offering something to beneficiaries). Fronting a
// 'request' item with a real beneficiaries-table row, rather than inventing
// a new party type, means it flows through the exact same beneficiary-asks/
// helper-applies mechanism (POST /assignments/apply, GET
// /help/:id/counterpart, admin approval, scheduling/completion ack) that
// already exists for a real beneficiary's own request — no new matching
// logic needed anywhere. Never logged into, same as HRR0000.
try {
const hash = await bcrypt.hash('remar-store-system-account-disabled-login', 10);
await pool.query(
`INSERT INTO users (email, password_hash, role, is_verified)
VALUES ($1, $2, 'beneficiary', TRUE)
ON CONFLICT (email) DO NOTHING`,
['store-request@remar.internal', hash]
);
const storeUser = await pool.query(`SELECT id FROM users WHERE email = $1`, ['store-request@remar.internal']);
if (storeUser.rows[0]) {
await pool.query(
`INSERT INTO beneficiaries (user_id, name, nickname, member_number)
VALUES ($1, 'Remar Store', 'Remar Store', 'BRR0000')
ON CONFLICT (member_number) DO NOTHING`,
[storeUser.rows[0].id]
);
}
} catch (err) {
console.error('Remar Store request-side account seed error:', err.message);
}

// One-time backfill — a couple of Store items (XHAA0009, XHAA0010) were
// created before the offer/request split above existed, so they slipped
// through with direction still NULL. That's harmless everywhere they're
// created by a real person (direction is only ever set for Store items),
// but for a genuine Store item it makes GET /help/store's per-role
// scoping (helper: direction='request', beneficiary: direction='offer')
// treat it as belonging to neither — invisible on the Helper/Beneficiary
// Store pages and on admin's Help Available/Help Required sub-filters,
// even though it still shows under admin's "All". Idempotent (only ever
// touches rows still NULL), so safe to run on every startup rather than
// as a one-off manual fix.
try {
await pool.query(
`UPDATE helps h SET direction = 'offer'
FROM helpers v WHERE v.user_id = h.created_by AND v.member_number = 'HRR0000' AND h.direction IS NULL`
);
await pool.query(
`UPDATE helps h SET direction = 'request'
FROM beneficiaries b WHERE b.user_id = h.created_by AND b.member_number = 'BRR0000' AND h.direction IS NULL`
);
} catch (err) {
console.error('Store item direction backfill error:', err.message);
}

// One-time backfill — PUT /store-location (routes/helpers.js) mirrors the
// admin-set Store address from HRR0000 (helper-side) onto BRR0000
// (beneficiary-side, fronts "Help Required" Store items) so both system
// accounts always share one address — but that mirroring only runs on a
// fresh save. If the Store address was last saved before BRR0000/that
// mirror existed, BRR0000 was left with no address/lat/lon at all, which
// made every 'request'-direction Store item invisible on Map View/Help
// Universe (no coordinates to place a marker at) even though its
// counterpart HRR0000 items showed up fine — see item 6. Copies HRR0000's
// current address onto BRR0000 whenever they've drifted apart; idempotent
// (a no-op once they match), so safe on every startup, and stays in sync
// going forward regardless since PUT /store-location mirrors both ways
// from here on.
try {
await pool.query(
`UPDATE beneficiaries b SET street=h.street, house_number=h.house_number, city=h.city, pincode=h.pincode,
latitude=h.latitude, longitude=h.longitude, address=h.address
FROM helpers h WHERE h.member_number = 'HRR0000' AND b.member_number = 'BRR0000'
AND h.pincode IS NOT NULL AND b.pincode IS DISTINCT FROM h.pincode`
);
} catch (err) {
console.error('BRR0000 store-location backfill error:', err.message);
}

console.log('Database tables ready');
}

initDB();

module.exports = pool;
module.exports.DEFAULT_AUTO_MATCH_RULE = DEFAULT_AUTO_MATCH_RULE;
