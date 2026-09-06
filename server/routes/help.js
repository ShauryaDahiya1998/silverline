const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { formatHelpId, parseHelpIdSequence } = require('../utils/helpId');
const { parseDevice } = require('../utils/device');
const { notifyHelpSubscribers } = require('../utils/helpSubscriptions');
const router = express.Router();

// Get all help requests/offers — used by the admin-facing pages
// (AdminHome, AdminHelpOngoingList, AdminHelpHistoryList, AdminReports).
// Also folds in each item's latest assignment (status + admin_approved),
// same LATERAL-join shape GET /mine already uses, so a help item's status
// reads the same way here as it does on its own creator's Home — without
// this, a request that's been accepted by its creator but not yet
// admin-approved still showed h.status='open' ("Initiated") here even
// though the creator/requester's own views already correctly showed
// "Requested", since helps.status itself only ever changes once an admin
// actually approves the match.
router.get('/', authenticate, async (req, res) => {
try {
const result = await db.query(
`SELECT h.*, la.status AS assignment_status, la.admin_approved, la.creator_scheduled, la.consumer_scheduled, la.updated_at AS assignment_updated_at
FROM helps h
LEFT JOIN LATERAL (
-- Same confirmed/completed-takes-priority ordering as the two LATERAL/
-- ROW_NUMBER fixes in GET /mine below — otherwise a still-pending request
-- from a second/third applicant, created after the first applicant was
-- already accepted, could outrank the accepted one here just for being
-- more recent. Cancelled assignments (a requester withdrawing their own
-- pending request, or the creator rejecting one applicant among possibly
-- several) are excluded entirely — a cancelled assignment doesn't mean
-- the help item itself is deleted, and picking it up here used to make an
-- item some beneficiary/helper had simply un-requested read as "Deleted"
-- instead of reverting to Initiated/still-open (see StoreCategoryList.jsx/
-- MapView.jsx, which reach this same shape via GET /store, GET /map).
SELECT status, admin_approved, creator_scheduled, consumer_scheduled, updated_at FROM assignments a
WHERE a.help_row_id = h.id AND a.status != 'cancelled' ORDER BY (a.status IN ('confirmed', 'completed')) DESC, a.updated_at DESC LIMIT 1
) la ON true
-- Latest status change first: an assignment's updated_at is touched on
-- every status-relevant mutation (request created, accepted/rejected,
-- scheduled/completed ticks, admin direct-assign — see routes/
-- assignments.js), so it's a reliable "last status change" timestamp.
-- Falls back to the help item's own created_at for an item with no
-- assignment yet (still just-created "Initiated", no status change to
-- speak of), same as the previous default ordering.
ORDER BY COALESCE(la.updated_at, h.created_at) DESC`
);
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Real people + real still-open help items for Map View, replacing the
// mock beneficiary markers it previously always showed regardless of what
// was actually in the database. NewHelp.jsx doesn't collect its own
// location — a help item is placed on the map at its creator's own
// registered address (helpers/beneficiaries.latitude/longitude, geocoded
// at registration), so only creators who've been geocoded show up here.
// One row per help item; the client groups these by person into one marker
// each, collecting every open category they have as that marker's badges.
// Once a help item is actually Matched (helps.status flips to 'assigned' —
// see PUT /assignments/:id/respond), it's no longer something anyone else
// can request, so it drops out of Help Universe entirely (both the map
// markers and the below-filter list view, which share this same endpoint —
// see MapView.jsx). helps.status only ever reverts back to 'open' if that
// match itself is later undone (Cancel/Reject/Unmatch), at which point the
// item naturally reappears here too, same as it did before ever being
// matched.
router.get('/map', authenticate, async (req, res) => {
try {
// No lat/lon filter here — registration best-effort geocodes the entered
// address (see HelperRegister.jsx/BeneficiaryRegister.jsx geocodeAddress),
// which can come back empty for an address Nominatim can't resolve. The
// client falls back to geocoding the plain-text address itself for any
// row where latitude/longitude is still null, so it still surfaces
// (rather than just silently disappearing) as long as there's an address
// to work from at all.
// my_assignment_status: same purpose as GET /store's own version below —
// this viewer's own latest assignment on the item, if any, so the client
// can block a second Request from the same person on an item that's
// still status='open' (only flips to 'assigned' once admin approves a
// match — see PUT /assignments/:id/respond) while leaving it requestable
// for everyone else.
let myHelperId = null, myBeneficiaryId = null;
if (req.user.role === 'helper') {
const r = await db.query('SELECT id FROM helpers WHERE user_id = $1', [req.user.id]);
myHelperId = r.rows[0]?.id || null;
} else if (req.user.role === 'beneficiary') {
const r = await db.query('SELECT id FROM beneficiaries WHERE user_id = $1', [req.user.id]);
myBeneficiaryId = r.rows[0]?.id || null;
}
const result = await db.query(
`SELECT h.id AS help_row_id, h.help_id, h.title, h.description, h.category, h.sub_category,
h.quantity, h.unit, h.condition, h.age_value, h.age_unit, h.photo_urls, h.logistics_preference, h.status, h.created_by, h.created_at,
h.is_online,
u.role AS creator_role,
COALESCE(v.id, b.id) AS profile_id,
COALESCE(NULLIF(v.nickname, ''), v.name, NULLIF(b.nickname, ''), b.name) AS person_name,
COALESCE(NULLIF(v.nickname, ''), NULLIF(b.nickname, '')) AS person_nickname,
COALESCE(v.name, b.name) AS person_full_name,
COALESCE(v.photo_url, b.photo_url) AS photo_url,
COALESCE(v.latitude, b.latitude) AS latitude,
COALESCE(v.longitude, b.longitude) AS longitude,
COALESCE(v.address, b.address) AS address,
COALESCE(h.confirm_city, v.city, b.city) AS location_city,
COALESCE(h.confirm_pincode, v.pincode, b.pincode) AS location_pincode,
-- Weekly availability slots, same JSONB shape either side (see
-- HelperRegister.jsx/BeneficiaryRegister.jsx's emptyAvailability: one array
-- per weekday of up to 3 {from,to} slots) — helpers store it as
-- availability, beneficiaries as time_preferences, same underlying data.
-- Previously never selected here at all, so MapView.jsx's Day/Time filter
-- had nothing real to match against (see its own slots:[] — now populated
-- from this).
COALESCE(v.availability, b.time_preferences) AS availability_json,
mine.status AS my_assignment_status
FROM helps h
JOIN users u ON u.id = h.created_by
LEFT JOIN helpers v ON v.user_id = h.created_by
LEFT JOIN beneficiaries b ON b.user_id = h.created_by
LEFT JOIN LATERAL (
-- Cancelled excluded — once this viewer withdraws their own request (or
-- it's rejected by the item's owner), that shouldn't keep blocking them
-- from requesting it again (see the same exclusion + note on GET /store
-- below, and PUT /assignments/:id/respond's requester-cancels-own-pending
-- branch, which never touches helps.status).
SELECT status FROM assignments a2
WHERE a2.help_row_id = h.id AND a2.status != 'cancelled'
AND ((a2.volunteer_id = $1::uuid AND $1::uuid IS NOT NULL) OR (a2.beneficiary_id = $2::uuid AND $2::uuid IS NOT NULL))
ORDER BY a2.updated_at DESC LIMIT 1
) mine ON true
WHERE h.status = 'open'`,
[myHelperId, myBeneficiaryId]
);
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Home: the current user's own open help + help history, shaped for
// the Help Management section's two tables. Beneficiaries see the help
// they created (something they're requesting) PLUS anything they've
// selected from a helper's own offered item via the Map View Select flow
// (POST /assignments/request — that help item's created_by is the helper,
// not the beneficiary, so it has to be pulled in separately via the
// assignment's beneficiary_id, mirroring how the helper branch below stitches
// together "assigned to me" + "created by me"); helpers see the help
// they're assigned to (via the assignments table) — so "open" / "history"
// means something slightly different per role, but the shape returned is
// the same either way.
// A row belongs in "history" once the help item itself is done for —
// deleted (helps.status = 'cancelled', see PUT /:id's Delete flow) or
// completed — regardless of what its most recent assignment_status says.
// Previously this checked assignment_status first whenever one existed, so
// deleting a help item that already had a pending/confirmed match never
// moved it out of "open": the assignment was still 'pending'/'confirmed',
// so it kept passing the open filter and looked like it was still live. A
// still-pending/still-confirmed assignment on a help item that hasn't
// itself been cancelled/completed keeps using assignment_status the same
// way as before (a rejected single request still moves just that row to
// history without cancelling the whole help item).
// A completed item stays in "open"/ongoing for 3 days after completion
// before it moves to history, so the creator/consumer still see it front
// and center for a few days (e.g. to leave feedback) rather than it
// disappearing into history the moment it's marked done. Cancelled items
// have no such grace period — they move to history immediately.
const HISTORY_DELAY_MS = 3 * 24 * 60 * 60 * 1000;
function isHistoryRow(r) {
if (r.status === 'cancelled') return true;
if (r.status === 'completed') {
if (!r.completed_at) return true;
return Date.now() - new Date(r.completed_at).getTime() >= HISTORY_DELAY_MS;
}
return r.assignment_status ? ['completed', 'cancelled'].includes(r.assignment_status) : false;
}

router.get('/mine', authenticate, async (req, res) => {
try {
if (req.user.role === 'beneficiary') {
const benResult = await db.query('SELECT id FROM beneficiaries WHERE user_id = $1', [req.user.id]);
const beneficiaryProfileId = benResult.rows[0]?.id || null;
// Postgres forbids an expression like COALESCE(...) directly in a UNION
// ALL's own ORDER BY — it only accepts a plain output-column name/number
// there ("invalid UNION/INTERSECT/EXCEPT ORDER BY clause"). So the union
// itself is left unordered and wrapped in a subquery, with the actual
// sort-by-latest-status-change applied on the outer SELECT instead, where
// expressions are fine.
const result = await db.query(
`SELECT * FROM (
-- Cancelled excluded here too — this row is MY OWN request against
-- someone else's item (their offer), not my own item. Once I withdraw it
-- (or the owner rejects it), it's not "my help history" either — it
-- should just disappear from my own Help ongoing/history entirely, same
-- as if I'd never requested it, while the item itself falls back to
-- Initiated for everyone else via the created_by branch below (unaffected
-- by this). At most one non-cancelled row can exist per (me, item) at a
-- time — see the matching status != 'cancelled' guard on POST
-- /assignments/request's own duplicate-request check — so no ranking is
-- needed here, a plain filter is enough.
SELECT a.id AS assignment_id, a.status AS assignment_status, a.admin_approved, a.on_time, a.rating_received, a.rating_given, a.updated_at AS assignment_updated_at,
a.creator_scheduled, a.consumer_scheduled, a.creator_completed, a.consumer_completed,
h.id, h.help_id, h.title, h.required_skills, h.location, h.scheduled_date, h.duration_hours, h.value, h.status, h.created_at, h.completed_at
FROM assignments a JOIN helps h ON a.help_row_id = h.id
WHERE a.beneficiary_id = $1 AND a.status != 'cancelled'
UNION ALL
SELECT la.id AS assignment_id, la.status AS assignment_status, la.admin_approved, la.on_time, la.rating_received, la.rating_given, la.updated_at AS assignment_updated_at,
la.creator_scheduled, la.consumer_scheduled, la.creator_completed, la.consumer_completed,
h.id, h.help_id, h.title, h.required_skills, h.location, h.scheduled_date, h.duration_hours, h.value, h.status, h.created_at, h.completed_at
FROM helps h
LEFT JOIN LATERAL (
-- Item 2 fix: with more than one helper applying to the same item I
-- created, this used to just grab whichever assignment was created most
-- recently — so if an earlier applicant had already been accepted
-- (confirmed) but a later one was still pending, the newer, less-relevant
-- pending row won and showed the wrong status. Confirmed/completed now
-- always wins regardless of recency; only among same-priority rows does
-- "most recent" break the tie.
-- Cancelled excluded entirely — this branch is always MY OWN item (see
-- WHERE h.created_by = $2 below), so a single rejected/withdrawn applicant
-- shouldn't make my own still-open item read as Deleted/history (see
-- isHistoryRow above) — it should fall back to the item's own status
-- (still 'open' = Initiated) same as if nobody had applied yet, and stay
-- requestable by the next applicant. The applicant's own attempt is also
-- excluded from their side (see the beneficiary_id branch above) once
-- cancelled — it just disappears from their list too, not "history".
SELECT id, status, admin_approved, on_time, rating_received, rating_given, updated_at, creator_scheduled, consumer_scheduled, creator_completed, consumer_completed FROM assignments a
WHERE a.help_row_id = h.id AND a.status != 'cancelled' ORDER BY (a.status IN ('confirmed', 'completed')) DESC, a.updated_at DESC LIMIT 1
) la ON true
WHERE h.created_by = $2
AND NOT EXISTS (SELECT 1 FROM assignments a2 WHERE a2.help_row_id = h.id AND a2.beneficiary_id = $1)
) combined
-- Latest status change first (see matching comment on GET / above) —
-- assignment_updated_at when a matching assignment exists, else the help
-- item's own created_at.
ORDER BY COALESCE(assignment_updated_at, created_at) DESC`,
[beneficiaryProfileId, req.user.id]
);
const open = result.rows.filter(r => !isHistoryRow(r));
const history = result.rows.filter(isHistoryRow);
return res.json({ open, history });
}

if (req.user.role === 'helper') {
const volResult = await db.query('SELECT id FROM helpers WHERE user_id = $1', [req.user.id]);
if (!volResult.rows[0]) return res.json({ open: [], history: [] });
// A helper's "mine" list is two different things stitched together: help
// they're assigned to (via the assignments table — the original behavior),
// plus help they offered themselves through New Help that nobody has
// picked up yet (a helps row they created, with no assignment row at all
// — previously invisible here, which meant a helper's own new offer never
// showed up in their own Help ongoing list). Both are ordered newest-first
// so a just-submitted offer lands at the top.
// See the matching comment on the beneficiary query above — the union
// itself can't be ORDER BY'd with a COALESCE expression directly, so it's
// wrapped in a subquery and sorted on the outside instead.
const result = await db.query(
`SELECT * FROM (
-- Branch H1 — help items THIS HELPER CREATED (offered) themselves,
-- pulling in the latest still-relevant applicant against it, mirroring
-- the beneficiary-side LATERAL above (including the same cancelled-
-- exclusion: a rejected/withdrawn applicant shouldn't make my own item
-- read as Deleted/history — see isHistoryRow above and the matching
-- comment on the beneficiary branch). Replaces the old separate "zero
-- assignments yet" UNION branch too — LEFT JOIN LATERAL already covers
-- "no applicant at all" and "every applicant so far was rejected/
-- withdrawn" the same way (la.* comes back null either way).
SELECT la.id AS assignment_id, la.status AS assignment_status, la.admin_approved, la.on_time,
la.consumer_rating AS rating_received, la.rating_given, la.updated_at AS assignment_updated_at,
la.creator_scheduled, la.consumer_scheduled, la.creator_completed, la.consumer_completed,
h.id AS help_row_id, h.help_id, h.title, h.required_skills, h.location, h.scheduled_date, h.duration_hours, h.value, h.status AS status, h.created_at, h.completed_at
FROM helps h
LEFT JOIN LATERAL (
SELECT * FROM assignments a
WHERE a.help_row_id = h.id AND a.status != 'cancelled'
ORDER BY (a.status IN ('confirmed', 'completed')) DESC, a.updated_at DESC LIMIT 1
) la ON true
WHERE h.created_by = $2
UNION ALL
-- Branch H2 — help items OFFERED/REQUESTED BY SOMEONE ELSE that this
-- helper has applied to, i.e. genuinely their own request against
-- another party's item (not their own item — see h.created_by <> $2).
-- Cancelled excluded here too, mirroring the beneficiary-side comment
-- above: once I withdraw my own application (or the owner rejects it),
-- it shouldn't linger as "Deleted" on my own Help page — it should just
-- disappear, same as the item itself falling back to Initiated for
-- everyone else via Branch H1 above. At most one non-cancelled row can
-- exist per (me, item) at a time — see the matching status != 'cancelled'
-- guard on POST /assignments/apply's own duplicate-request check — so
-- no ranking is needed, a plain filter is enough.
SELECT a.id AS assignment_id, a.status AS assignment_status, a.admin_approved, a.on_time,
a.creator_rating AS rating_received,
a.rating_given, a.updated_at AS assignment_updated_at,
a.creator_scheduled, a.consumer_scheduled, a.creator_completed, a.consumer_completed,
h.id AS help_row_id, h.help_id, h.title, h.required_skills, h.location, h.scheduled_date, h.duration_hours, h.value, h.status AS status, h.created_at, h.completed_at
FROM assignments a JOIN helps h ON a.help_row_id = h.id
WHERE a.volunteer_id = $1 AND h.created_by != $2 AND a.status != 'cancelled'
) combined
-- Latest status change first (see matching comment on GET / above).
ORDER BY COALESCE(assignment_updated_at, created_at) DESC`,
[volResult.rows[0].id, req.user.id]
);
const open = result.rows.filter(r => !isHistoryRow(r));
const history = result.rows.filter(isHistoryRow);
return res.json({ open, history });
}

res.json({ open: [], history: [] });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Resolve the "other party/parties" on a help item — the beneficiary/ies who
// requested it (from a helper's point of view) or the helper(s) applied to
// it (from a beneficiary's point of view). Used by the Help Status page's
// profile button, its Accept/Reject UI, and its per-request Chat button.
// Covers two directions on the same assignments row shape: the original
// flow (helper applies to a beneficiary's request — assignments.
// beneficiary_id left null, implied via the help item's creator) and the
// new flow (beneficiary selects a helper's own offered item — assignments.
// beneficiary_id set explicitly).
//
// Returns { confirmed, pending: [...] } — pending is ordered oldest-first
// (multiple beneficiaries can now select/apply to the same open item, so
// there can be more than one). Naturally privacy-scoped without an explicit
// "am I the owner" branch: the same WHERE clause that picks out the item's
// owner's own rows (when they own it) also picks out only a non-owner's own
// single request (when they don't) — see beneficiary_id COALESCE / volunteer_id
// match below, both already narrow to "rows involving me" either way.
router.get('/:id/counterpart', authenticate, async (req, res) => {
try {
const mapRows = (rows, role) => rows.map(row => ({
role, id: row.id, user_id: row.user_id, nickname: row.nickname, name: row.name, photo_url: row.photo_url,
assignment_id: row.assignment_id, assignment_status: row.assignment_status, admin_approved: row.admin_approved, created_at: row.created_at,
// Mutual post-approval confirmation state (see PUT /assignments/:id/ack)
// — 'creator' is whoever created this help item, 'consumer' the other
// matched party. Passed straight through so the client can work out
// which pair is "my own" vs "the counterpart's" once it knows whether
// the current viewer is the owner or not.
creator_scheduled: row.creator_scheduled, consumer_scheduled: row.consumer_scheduled,
creator_completed: row.creator_completed, consumer_completed: row.consumer_completed,
// Post-completion feedback + rating (see PUT /assignments/:id/feedback) —
// same creator/consumer split, both sides live on this one row.
creator_feedback: row.creator_feedback, creator_rating: row.creator_rating,
consumer_feedback: row.consumer_feedback, consumer_rating: row.consumer_rating,
// Item 12: optional post-match Schedule (see PUT /assignments/:id/schedule)
calendar_datetime: row.calendar_datetime, calendar_duration_minutes: row.calendar_duration_minutes,
calendar_meeting_link: row.calendar_meeting_link, calendar_venue: row.calendar_venue, calendar_sent_at: row.calendar_sent_at,
}));
const splitConfirmedPending = (rows, role) => {
const mapped = mapRows(rows, role);
const pending = mapped.filter(r => r.assignment_status === 'pending');
const confirmedCandidates = mapped.filter(r => ['confirmed', 'completed'].includes(r.assignment_status));
const confirmed = confirmedCandidates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
return { confirmed, pending };
};

if (req.user.role === 'beneficiary') {
const helpExists = await db.query('SELECT id FROM helps WHERE id = $1', [req.params.id]);
if (!helpExists.rows[0]) return res.status(404).json({ error: 'Help item not found' });
const benResult = await db.query('SELECT id FROM beneficiaries WHERE user_id = $1', [req.user.id]);
if (!benResult.rows[0]) return res.json({ confirmed: null, pending: [] });
const result = await db.query(
`SELECT v.id, v.user_id, v.nickname, v.name, v.photo_url, a.id AS assignment_id, a.status AS assignment_status,
a.admin_approved, a.creator_scheduled, a.consumer_scheduled, a.creator_completed, a.consumer_completed,
a.creator_feedback, a.creator_rating, a.consumer_feedback, a.consumer_rating, a.created_at,
a.calendar_datetime, a.calendar_duration_minutes, a.calendar_meeting_link, a.calendar_venue, a.calendar_sent_at
FROM assignments a
JOIN helps h2 ON h2.id = a.help_row_id
JOIN helpers v ON v.id = a.volunteer_id
WHERE a.help_row_id = $1
AND COALESCE(a.beneficiary_id, (SELECT bb.id FROM beneficiaries bb WHERE bb.user_id = h2.created_by)) = $2
ORDER BY a.created_at ASC`,
[req.params.id, benResult.rows[0].id]
);
return res.json(splitConfirmedPending(result.rows, 'helper'));
}
if (req.user.role === 'helper') {
const volResult = await db.query('SELECT id FROM helpers WHERE user_id = $1', [req.user.id]);
if (!volResult.rows[0]) return res.json({ confirmed: null, pending: [] });
const result = await db.query(
`SELECT b.id, b.user_id, b.nickname, b.name, b.photo_url, a.id AS assignment_id, a.status AS assignment_status,
a.admin_approved, a.creator_scheduled, a.consumer_scheduled, a.creator_completed, a.consumer_completed,
a.creator_feedback, a.creator_rating, a.consumer_feedback, a.consumer_rating, a.created_at,
a.calendar_datetime, a.calendar_duration_minutes, a.calendar_meeting_link, a.calendar_venue, a.calendar_sent_at
FROM assignments a
JOIN helps h2 ON h2.id = a.help_row_id
JOIN beneficiaries b ON b.id = COALESCE(a.beneficiary_id, (SELECT bb.id FROM beneficiaries bb WHERE bb.user_id = h2.created_by))
WHERE a.help_row_id = $1 AND a.volunteer_id = $2
ORDER BY a.created_at ASC`,
[req.params.id, volResult.rows[0].id]
);
return res.json(splitConfirmedPending(result.rows, 'beneficiary'));
}
// Admin — sees every request against this item regardless of direction
// (helper applying to a beneficiary's post, or beneficiary selecting a
// helper's offer), with each row's role worked out per-row via which side
// of the assignment has an explicit beneficiary_id, since a single admin
// session isn't "a helper" or "a beneficiary" the way the two branches
// above are scoped. This is what powers the Requests list's Accept/Reject
// for an admin's own "manual acceptance" — the item's normal owner never
// sees these two buckets any differently, admin just also gets the
// still-party-only-accepted rows folded into "pending" (their own accept
// isn't final — see PUT /assignments/:id/respond) rather than "confirmed".
if (req.user.role === 'admin') {
// The item's own creator — an admin reviewing a request against this
// help item needs to see who created it too, not just who's requesting
// it, especially once a request has already been accepted by the
// creator and is just waiting on the admin's final sign-off (see
// `pending` below, and how the client uses this for its dual-party
// approval row).
const helpRes = await db.query('SELECT created_by FROM helps WHERE id = $1', [req.params.id]);
if (!helpRes.rows[0]) return res.status(404).json({ error: 'Help item not found' });
const creatorId = helpRes.rows[0].created_by;
const creatorRes = await db.query(
`SELECT u.role,
COALESCE(hp.id, bp.id) AS id,
COALESCE(hp.nickname, bp.nickname) AS nickname,
COALESCE(hp.name, bp.name) AS name,
COALESCE(hp.photo_url, bp.photo_url) AS photo_url,
COALESCE(hp.member_number, bp.member_number) AS member_number
FROM users u
LEFT JOIN helpers hp ON hp.user_id = u.id
LEFT JOIN beneficiaries bp ON bp.user_id = u.id
WHERE u.id = $1`,
[creatorId]
);
const creatorRow = creatorRes.rows[0];
const creator = creatorRow ? {
role: creatorRow.role, id: creatorRow.id, user_id: creatorId,
nickname: creatorRow.nickname, name: creatorRow.name, photo_url: creatorRow.photo_url,
member_number: creatorRow.member_number,
} : null;

const result = await db.query(
`SELECT a.id AS assignment_id, a.status AS assignment_status, a.admin_approved, a.created_at, a.updated_at,
a.creator_scheduled, a.consumer_scheduled, a.creator_completed, a.consumer_completed,
a.creator_feedback, a.creator_rating, a.consumer_feedback, a.consumer_rating,
a.calendar_datetime, a.calendar_duration_minutes, a.calendar_meeting_link, a.calendar_venue, a.calendar_sent_at,
CASE WHEN a.beneficiary_id IS NOT NULL THEN 'beneficiary' ELSE 'helper' END AS role,
CASE WHEN a.beneficiary_id IS NOT NULL THEN b.id ELSE v.id END AS id,
CASE WHEN a.beneficiary_id IS NOT NULL THEN b.user_id ELSE v.user_id END AS user_id,
CASE WHEN a.beneficiary_id IS NOT NULL THEN b.nickname ELSE v.nickname END AS nickname,
CASE WHEN a.beneficiary_id IS NOT NULL THEN b.name ELSE v.name END AS name,
CASE WHEN a.beneficiary_id IS NOT NULL THEN b.photo_url ELSE v.photo_url END AS photo_url,
CASE WHEN a.beneficiary_id IS NOT NULL THEN b.member_number ELSE v.member_number END AS member_number
FROM assignments a
JOIN helpers v ON v.id = a.volunteer_id
LEFT JOIN beneficiaries b ON b.id = a.beneficiary_id
WHERE a.help_row_id = $1
ORDER BY a.created_at ASC`,
[req.params.id]
);
const mapped = result.rows.map(row => ({
role: row.role, id: row.id, user_id: row.user_id, nickname: row.nickname, name: row.name, photo_url: row.photo_url,
member_number: row.member_number,
assignment_id: row.assignment_id, assignment_status: row.assignment_status, admin_approved: row.admin_approved,
creator_scheduled: row.creator_scheduled, consumer_scheduled: row.consumer_scheduled,
creator_completed: row.creator_completed, consumer_completed: row.consumer_completed,
creator_feedback: row.creator_feedback, creator_rating: row.creator_rating,
consumer_feedback: row.consumer_feedback, consumer_rating: row.consumer_rating,
calendar_datetime: row.calendar_datetime, calendar_duration_minutes: row.calendar_duration_minutes,
calendar_meeting_link: row.calendar_meeting_link, calendar_venue: row.calendar_venue, calendar_sent_at: row.calendar_sent_at,
created_at: row.created_at, updated_at: row.updated_at,
}));
// Admin-approved rows now stay in `pending` (loosely named — really "every
// still-relevant request") instead of dropping out the moment they're
// approved, so the Requests list can keep showing them in place with their
// own "Approved on ..." + Revoke state rather than the row just vanishing
// (multiple beneficiaries/helpers can still have their own separate,
// still-open requests against the same item at the same time).
const pending = mapped.filter(r => !['cancelled', 'completed'].includes(r.assignment_status));
// Includes 'completed' as well as 'confirmed' — once a match actually
// finishes, its assignment_status moves to 'completed' (see PUT
// /assignments/:id/ack), so restricting this to 'confirmed' only meant a
// Completed help item's counterpart silently vanished back to "Not yet
// assigned" for an admin viewer the moment it finished, even though the
// match very much still happened. The beneficiary/helper branches above
// already included 'completed' here — this just brings admin in line.
const confirmedCandidates = mapped.filter(r => ['confirmed', 'completed'].includes(r.assignment_status) && r.admin_approved);
const confirmed = confirmedCandidates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
return res.json({ confirmed, pending, creator });
}
res.json({ confirmed: null, pending: [] });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Remar Store — browse list of everything Remar Store has posted
// (client/src/pages/DM/Store.jsx). Admin sees everything (for review/
// management, plus an All/Available/Required filter); helpers/
// beneficiaries reach the same page scoped to just their own direction (see
// the role filter below). Remar Store's items also still show up woven into
// the general All Help Available/Required page like any other helper's
// offer or beneficiary's ask (GET /help/map, once created_by resolves to a
// Remar Store account — see POST / above) — this page is a dedicated,
// curated view on top of that, not a replacement for it. Matches two
// shapes: legacy rows
// from before the Remar Store system account existed (creator role
// 'admin', direction tagged 'offer'/'request'), and current rows (creator
// is one of Remar Store's two system accounts — helper-side 'HRR0000' for
// Available/'offer' items, beneficiary-side 'BRR0000' for Required/
// 'request' items, see db.js's bootstrap — direction NULL only for old
// legacy rows predating that split). Scoped to still-available items only —
// excludes anything whose derived status would read as Scheduled (assigned
// + a future scheduled_date) or Completed, per what's meant to still be "in
// the store" to browse; Cancelled (= deleted, see PUT /:id's Delete flow)
// is excluded too since a deleted item isn't really available. Open to
// every role, not just admin — Store.jsx now also doubles as the Helper/
// Beneficiary Remar Store page (see App.jsx), each scoped below to just
// their own direction ('request'/Required for helpers, 'offer'/Available
// for beneficiaries); only admin gets everything plus the All/Available/
// Required filter client-side. Declared before GET /:id so '/store' isn't
// swallowed by it.
router.get('/store', authenticate, async (req, res) => {
try {
// assignment_status: latest assignment on the item overall (any
// applicant), same LATERAL pattern as GET / above — lets the client show
// "Requested"/"Matched" instead of always "Initiated" once someone (not
// necessarily this viewer) has applied, matching what Help ongoing shows
// via resolveDisplayStatus (see StoreCategoryList.jsx).
// my_assignment_status: this specific viewer's own assignment on the
// item, if any — used to disable Request/Apply for someone who's already
// sent one, without affecting other viewers who haven't (see
// HelpDetailPopup.jsx). Resolved to this user's helpers/beneficiaries row
// id up front since a plain user id can't be compared against
// volunteer_id/beneficiary_id directly.
let myHelperId = null, myBeneficiaryId = null;
if (req.user.role === 'helper') {
const r = await db.query('SELECT id FROM helpers WHERE user_id = $1', [req.user.id]);
myHelperId = r.rows[0]?.id || null;
} else if (req.user.role === 'beneficiary') {
const r = await db.query('SELECT id FROM beneficiaries WHERE user_id = $1', [req.user.id]);
myBeneficiaryId = r.rows[0]?.id || null;
}
const result = await db.query(
`SELECT h.*, COALESCE(v.city, b.city) AS location_city, COALESCE(v.pincode, b.pincode) AS location_pincode,
la.status AS assignment_status, mine.status AS my_assignment_status
FROM helps h
JOIN users u ON u.id = h.created_by
LEFT JOIN helpers v ON v.user_id = h.created_by
LEFT JOIN beneficiaries b ON b.user_id = h.created_by
LEFT JOIN LATERAL (
-- Cancelled excluded — a withdrawn/rejected assignment doesn't mean the
-- Store item itself is deleted (helps.status stays 'open' the whole time
-- for this — see PUT /assignments/:id/respond's requester-cancels-own-
-- pending branch); picking it up here used to make the item read as
-- Deleted here instead of reverting to Initiated/still-open once no
-- active assignment remains.
SELECT status FROM assignments a
WHERE a.help_row_id = h.id AND a.status != 'cancelled' ORDER BY (a.status IN ('confirmed', 'completed')) DESC, a.updated_at DESC LIMIT 1
) la ON true
LEFT JOIN LATERAL (
-- Cancelled excluded here too — withdrawing your own request shouldn't
-- keep blocking you from sending a fresh one (see alreadyRequested in
-- HelpDetailPopup.jsx).
SELECT status FROM assignments a2
WHERE a2.help_row_id = h.id AND a2.status != 'cancelled'
AND ((a2.volunteer_id = $1::uuid AND $1::uuid IS NOT NULL) OR (a2.beneficiary_id = $2::uuid AND $2::uuid IS NOT NULL))
ORDER BY a2.updated_at DESC LIMIT 1
) mine ON true
WHERE ((u.role = 'admin' AND h.direction IS NOT NULL) OR v.member_number = 'HRR0000' OR b.member_number = 'BRR0000')
AND h.status NOT IN ('completed', 'cancelled')
AND NOT (h.status = 'assigned' AND h.scheduled_date IS NOT NULL AND h.scheduled_date > NOW())
ORDER BY h.created_at DESC`,
[myHelperId, myBeneficiaryId]
);
let rows = result.rows;
if (req.user.role === 'helper') rows = rows.filter(h => h.direction === 'request');
if (req.user.role === 'beneficiary') rows = rows.filter(h => h.direction === 'offer');
// A helper/beneficiary should keep seeing a Store item for as long as it's
// still up for grabs — Initiated (assignment_status null) or Requested
// (assignment_status 'pending', including by other applicants; multiple
// people can apply to the same Store item before admin picks one) — and
// only lose it once it's actually been Matched/Scheduled/Completed
// (assignment_status 'confirmed' or 'completed' — Scheduled is still
// 'confirmed' underneath, just with help.status='assigned'+scheduled_date)
// to somebody else. If THEY are the one who got matched/completed
// (my_assignment_status 'confirmed'/'completed'), it stays visible to them.
// Admin is unaffected (sees every row regardless, for review/management).
if (req.user.role === 'helper' || req.user.role === 'beneficiary') {
rows = rows.filter(h => {
const taken = ['confirmed', 'completed'].includes(h.assignment_status);
return !taken || ['confirmed', 'completed'].includes(h.my_assignment_status);
});
}
// Item 5: browsing the Store list is well before any request/application
// exists, so nobody here has been "accepted" yet — strip the full address
// fields from every row (city/pincode is all this list ever showed anyway,
// now preferring the item's own Confirm location over the creator's live
// registered address when one was set).
rows = rows.map(h => {
if (h.confirm_city) h.location_city = h.confirm_city;
if (h.confirm_pincode) h.location_pincode = h.confirm_pincode;
h.confirm_street = null;
h.confirm_house_number = null;
h.confirm_latitude = null;
h.confirm_longitude = null;
return h;
});
res.json(rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Warn a creator, at the moment they submit New Help, if they already have
// a still-open (not completed, not deleted) help item they created within
// the last 3 days for the exact same item + quantity + New/Used condition
// — likely an accidental double-submission (e.g. a page refresh, or simply
// forgetting they already asked/offered this). Checked client-side just
// before the real POST /help — see NewHelp.jsx — so the creator gets a
// chance to go look at the existing one instead of a duplicate silently
// piling up. Normally compares against the CALLER's own past helps
// (created_by = req.user.id), never anyone else's.
//
// Admins creating help ON BEHALF of a helper/beneficiary (AdminNewHelp.jsx)
// hit this same endpoint but need the check run against the TARGET person's
// helps, not the admin's own (which would always come back empty) — so an
// admin caller may pass ?user_id=<target user id> to scope the check to
// that person instead. Non-admins can't do this: userId is silently ignored
// for them, so nobody can probe another person's help history through this
// endpoint.
//
// Remar Store restocking (AdminStoreNewHelp.jsx) is a third case: there's
// no specific target person, but Store items still front as one of the two
// system accounts (HRR0000/BRR0000, same resolution POST /help itself does
// — see that route's own comment) depending on direction, and duplicates
// there are just as much a real mistake as anywhere else (these are free,
// meant-to-be-unique items — a second identical restock within 3 days is
// almost always an accidental double-add, not intentional). So an admin
// caller may instead pass ?store=true&direction=offer|request to scope the
// check to whichever system account that Store item would actually be
// created under.
router.get('/check-duplicate', authenticate, async (req, res) => {
const { title, quantity, condition, user_id, store, direction } = req.query;
if (!title || quantity === undefined || quantity === '') {
return res.status(400).json({ error: 'title and quantity are required' });
}
let scopeUserId = (req.user.role === 'admin' && user_id) ? user_id : req.user.id;
try {
if (req.user.role === 'admin' && store && ['offer', 'request'].includes(direction)) {
const wantsRequest = direction === 'request';
const table = wantsRequest ? 'beneficiaries' : 'helpers';
const memberNumber = wantsRequest ? 'BRR0000' : 'HRR0000';
const storeAccount = await db.query(`SELECT user_id FROM ${table} WHERE member_number = $1`, [memberNumber]);
if (storeAccount.rows[0]) scopeUserId = storeAccount.rows[0].user_id;
}
const result = await db.query(
`SELECT id, help_id, title, quantity, unit, condition, status, created_at
FROM helps
WHERE created_by = $1
AND title = $2
AND quantity = $3
-- IS NOT DISTINCT FROM instead of = so two NULLs (categories with no
-- New/Used field at all, e.g. Social services) still count as a match
-- rather than a plain = silently never matching on NULL.
AND condition IS NOT DISTINCT FROM $4
AND status NOT IN ('completed', 'cancelled')
AND created_at >= NOW() - INTERVAL '3 days'
ORDER BY created_at DESC`,
[scopeUserId, title, quantity, condition || null]
);
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Get single help item
router.get('/:id', authenticate, async (req, res) => {
try {
// Help Status only wants to show the creator's city + postal code, not
// the full street address baked into h.location at creation time — pull
// those fresh from whichever of helpers/beneficiaries the creator is in.
const result = await db.query(
`SELECT h.*, COALESCE(hp.city, bp.city) AS location_city, COALESCE(hp.pincode, bp.pincode) AS location_pincode
FROM helps h
LEFT JOIN helpers hp ON hp.user_id = h.created_by
LEFT JOIN beneficiaries bp ON bp.user_id = h.created_by
WHERE h.id = $1`,
[req.params.id]
);
const row = result.rows[0];
if (!row) return res.status(404).json({ error: 'Not found' });

// Item 5 location visibility: the creator and admin always see the full
// confirmed (or fallback registered) address; a consumer only gets it
// once their own request/application on this item has been accepted by
// the creator (assignment status confirmed/completed) — until then they
// only see city + pincode, same as the public Help Universe view.
const isCreator = row.created_by === req.user.id;
const isAdmin = req.user.role === 'admin';
let revealFull = isCreator || isAdmin;
if (!revealFull) {
const asnRes = await db.query(
`SELECT a.status FROM assignments a
LEFT JOIN helpers hp ON hp.id = a.volunteer_id
LEFT JOIN beneficiaries bp ON bp.id = a.beneficiary_id
WHERE a.help_row_id = $1 AND (hp.user_id = $2 OR bp.user_id = $2)`,
[row.id, req.user.id]
);
revealFull = asnRes.rows.some(r => ['confirmed', 'completed'].includes(r.status));
}
// A per-help Confirm location (if the creator set one) takes priority
// over the creator's live registered city/pincode for the city/pincode
// shown to a non-revealed consumer too — it's the more accurate value.
if (row.confirm_city) row.location_city = row.confirm_city;
if (row.confirm_pincode) row.location_pincode = row.confirm_pincode;
if (!row.is_online && !revealFull) {
row.confirm_street = null;
row.confirm_house_number = null;
row.confirm_latitude = null;
row.confirm_longitude = null;
}
res.json(row);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Create a help request/offer (admin, beneficiary, or helper — the Home
// page's "New Help" button is shown to both helper and beneficiary roles).
// category/sub_category/quantity/unit come from the New Help form
// (client/src/pages/NewHelp.jsx); required_skills defaults to
// [sub_category] so the existing Home page "Sub-service" column keeps
// working without any changes there.
//
// Also generates and stores a permanent Help ID (help_id) here — previously
// this was only ever computed on the client from a row's position in a
// list, which drifted as items were added/completed. Sequenced the same way
// member_number is (COUNT of existing rows + 1); fine at this app's scale,
// same known race-condition caveat as that existing pattern. Alongside it,
// records who/what created it: IP address and a lightly-parsed device
// type/brand from the User-Agent header (created_at already covers
// date/time).
router.post('/', authenticate, requireRole('admin', 'beneficiary', 'helper'), async (req, res) => {
const { title, description, required_skills, location, scheduled_date, duration_hours, category, sub_category, quantity, unit, condition, age_value, age_unit, on_behalf_of_user_id, photo_urls, direction, store, logistics_preference,
  is_online, confirm_street, confirm_house_number, confirm_city, confirm_pincode, confirm_latitude, confirm_longitude } = req.body;
const skills = required_skills || (sub_category ? [sub_category] : null);
// Delivery/Collection preference — canonical 'pickup'/'dropoff' values,
// only meaningful for Food/Toiletries/Clothes (same categories as
// New/Used, see NewHelp.jsx's CONDITION_CATEGORIES); silently dropped for
// any other category rather than rejected, since the client already gates
// the field on category and a stray value here shouldn't block creation.
const LOGISTICS_CATEGORIES = ['Food', 'Clothes', 'Toiletries'];
const logisticsPreference = LOGISTICS_CATEGORIES.includes(category) && Array.isArray(logistics_preference)
  ? logistics_preference.filter(v => ['pickup', 'dropoff'].includes(v))
  : null;
// Admin-created help on behalf of a helper/beneficiary (from the Admin
// Helpers/Beneficiaries pages) — the item is recorded as created by that
// person, not the admin, so it shows up in their own Help ongoing list
// exactly like anything they'd submitted themselves. Only an admin is
// trusted to set this; anyone else's request just uses their own id.
let createdBy = (req.user.role === 'admin' && on_behalf_of_user_id) ? on_behalf_of_user_id : req.user.id;
try {
// Remar Store item (client/src/pages/DM/AdminStoreNewHelp.jsx) — admin
// creating it directly, not on any specific helper/beneficiary's behalf,
// but store:true routes it through one of Remar Store's two system
// accounts rather than the admin's own account, chosen by direction:
// 'offer' (Available — addressed to beneficiaries) uses the helper-side
// account (member_number 'HRR0000'); 'request' (Required — addressed to
// helpers) uses the beneficiary-side account (member_number 'BRR0000',
// see db.js's bootstrap for both). That makes it flow through the exact
// same "on behalf of a helper/beneficiary" path below as any other
// helper's offer or beneficiary's ask: same fields, same Help ID
// sequence, same location handling, same matching/approval flow, same
// visibility in Map View / All Help Available/Required — no bespoke
// matching logic needed for Store items at all.
const isStoreItem = req.user.role === 'admin' && !!store;
if (isStoreItem && !['offer', 'request'].includes(direction)) {
return res.status(400).json({ error: "direction ('offer' or 'request') is required for a Remar Store item" });
}
if (isStoreItem) {
const wantsRequest = direction === 'request';
const table = wantsRequest ? 'beneficiaries' : 'helpers';
const memberNumber = wantsRequest ? 'BRR0000' : 'HRR0000';
const storeAccount = await db.query(`SELECT user_id FROM ${table} WHERE member_number = $1`, [memberNumber]);
if (!storeAccount.rows[0]) return res.status(500).json({ error: 'Remar Store account is not set up' });
createdBy = storeAccount.rows[0].user_id;
}
// A genuine admin-owned item (admin posting directly, not on anyone's
// behalf and not a Remar Store item either) — legacy path, kept for any
// pre-existing direction-tagged rows: needs a direction ('offer' or
// 'request', see helps.direction) so the old Store browsing page can
// route it to the right audience, and isn't attached to any
// helper/beneficiary's own address.
const isAdminDirect = req.user.role === 'admin' && !on_behalf_of_user_id && !store;
if (isAdminDirect && !['offer', 'request'].includes(direction)) {
return res.status(400).json({ error: "direction ('offer' or 'request') is required for a Remar Store item" });
}
// Help ID's role letter (H/B/S) and sequence follow the *creator's* role
// — an admin submitting on a beneficiary's behalf still gets a B id, not
// an admin-specific one, since that item is really theirs; only a true
// admin-direct item (the Store) gets its own S sequence.
const creatorRoleRes = await db.query('SELECT role FROM users WHERE id = $1', [createdBy]);
const creatorRoleRaw = creatorRoleRes.rows[0]?.role;
const creatorRole = creatorRoleRaw === 'helper' ? 'helper' : (isAdminDirect && creatorRoleRaw === 'admin') ? 'admin' : 'beneficiary';
const prefix = creatorRole === 'helper' ? 'H' : creatorRole === 'admin' ? 'S' : 'B';
// MAX-based, not COUNT-based (see parseHelpIdSequence) — COUNT(*) silently
// collides with an existing higher id as soon as any one row for this
// prefix has ever been deleted, since it undercounts the true sequence
// position whenever there's a gap.
const lastIdRes = await db.query(
`SELECT help_id FROM helps WHERE help_id ~ $1 ORDER BY help_id DESC LIMIT 1`,
[`^X${prefix}[A-Z]{2}[0-9]{4}$`]
);
const nextSeq = lastIdRes.rows[0] ? parseHelpIdSequence(lastIdRes.rows[0].help_id) + 1 : 1;
const helpId = formatHelpId(prefix, nextSeq);
const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || null;
const userAgent = req.headers['user-agent'] || null;
const { type: deviceType, brand: deviceBrand } = parseDevice(userAgent);
// NewHelp.jsx doesn't collect its own location field — a help item's
// Location (shown on Help Status) is simply wherever its creator (the
// helper or beneficiary) is registered, same source Map View already
// pulls from. Falls back to whatever was explicitly passed (e.g. a future
// caller that does collect one) only if the creator has no address on
// file. Admin accounts have no helpers/beneficiaries row of their own, so
// a Store item just uses whatever location was explicitly passed (if any).
// Also pulls this creator's own weekly availability (availability for a
// helper, time_preferences for a beneficiary — same JSONB shape either
// way) in the same query, aliased to a common name — needed below to match
// subscribers' Day/Time filter (see notifyHelpSubscribers) against
// whoever's actually posting this item, not the subscriber's own schedule.
const addressRes = creatorRole === 'admin' ? null : await db.query(
`SELECT address, ${creatorRole === 'helper' ? 'availability' : 'time_preferences'} AS availability FROM ${creatorRole === 'helper' ? 'helpers' : 'beneficiaries'} WHERE user_id = $1`,
[createdBy]
);
const ownAddress = addressRes?.rows[0]?.address || null;
const creatorAvailability = addressRes?.rows[0]?.availability || null;
const result = await db.query(
`INSERT INTO helps (title, description, created_by, required_skills, location, scheduled_date, duration_hours, category, sub_category, quantity, unit, condition, age_value, age_unit, help_id, created_ip, created_user_agent, device_type, device_brand, photo_urls, direction, logistics_preference,
  is_online, confirm_street, confirm_house_number, confirm_city, confirm_pincode, confirm_latitude, confirm_longitude)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29) RETURNING *`,
[title, description || null, createdBy, skills, ownAddress || location || null, scheduled_date || null, duration_hours || null,
category || null, sub_category || null, quantity || null, unit || null,
condition || null, age_value || null, age_unit || null,
helpId, ip, userAgent, deviceType, deviceBrand,
Array.isArray(photo_urls) && photo_urls.length ? photo_urls.slice(0, 3) : null,
(isAdminDirect || isStoreItem) ? direction : null,
logisticsPreference && logisticsPreference.length ? logisticsPreference : null,
!!is_online,
is_online ? null : (confirm_street || null),
is_online ? null : (confirm_house_number || null),
is_online ? null : (confirm_city || null),
is_online ? null : (confirm_pincode || null),
is_online ? null : (confirm_latitude || null),
is_online ? null : (confirm_longitude || null)]
);

// Settings > App preferences > Notifications > New Help Available — see
// utils/helpSubscriptions.js. Fire-and-forget: never awaited, and the
// function itself catches everything, so a notification-side problem can
// never turn a successful Help creation into a failed request.
notifyHelpSubscribers({
helpRowId: result.rows[0].id,
helpId,
title,
category: category || null,
logisticsPreference,
creatorRole,
direction: (isAdminDirect || isStoreItem) ? direction : null,
creatorAvailability,
});

res.status(201).json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Update (Modify) a help request/offer — used both by the Help Status
// page's Modify flow (client/src/pages/DM/NewHelp.jsx in edit mode) and to
// cancel (status: 'cancelled'). Restricted to the item's own creator (or an
// admin) — previously any beneficiary could edit any help item, which this
// tightens up while adding the extra editable fields Modify needs.
router.put('/:id', authenticate, requireRole('admin', 'beneficiary', 'helper'), async (req, res) => {
const { title, description, status, required_skills, location, scheduled_date, duration_hours, category, sub_category, quantity, unit, condition, age_value, age_unit, photo_urls, logistics_preference,
  is_online, confirm_street, confirm_house_number, confirm_city, confirm_pincode, confirm_latitude, confirm_longitude } = req.body;
const LOGISTICS_CATEGORIES = ['Food', 'Clothes', 'Toiletries'];
const logisticsPreference = LOGISTICS_CATEGORIES.includes(category) && Array.isArray(logistics_preference)
  ? logistics_preference.filter(v => ['pickup', 'dropoff'].includes(v))
  : null;
try {
const existing = await db.query('SELECT created_by FROM helps WHERE id = $1', [req.params.id]);
if (!existing.rows[0]) return res.status(404).json({ error: 'Not found' });
if (req.user.role !== 'admin' && existing.rows[0].created_by !== req.user.id) {
return res.status(403).json({ error: 'Only the person who created this help item, or an admin, can modify it' });
}
const result = await db.query(
`UPDATE helps SET title=$1, description=$2, status=$3, required_skills=$4,
location=$5, scheduled_date=$6, duration_hours=$7, category=$8, sub_category=$9,
quantity=$10, unit=$11, condition=$12, age_value=$13, age_unit=$14, photo_urls=$15, logistics_preference=$16,
is_online=$17, confirm_street=$18, confirm_house_number=$19, confirm_city=$20, confirm_pincode=$21, confirm_latitude=$22, confirm_longitude=$23,
updated_at=NOW()
WHERE id=$24 RETURNING *`,
[title, description, status, required_skills, location, scheduled_date, duration_hours,
category || null, sub_category || null, quantity || null, unit || null,
condition || null, age_value || null, age_unit || null,
Array.isArray(photo_urls) && photo_urls.length ? photo_urls.slice(0, 3) : null,
logisticsPreference && logisticsPreference.length ? logisticsPreference : null,
!!is_online,
is_online ? null : (confirm_street || null),
is_online ? null : (confirm_house_number || null),
is_online ? null : (confirm_city || null),
is_online ? null : (confirm_pincode || null),
is_online ? null : (confirm_latitude || null),
is_online ? null : (confirm_longitude || null),
req.params.id]
);
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Admin's Value/Hours approval box (Help Status page, admin view only) —
// once a match is admin-approved, assignments.js pre-fills these from
// Help.xlsx pricing (see helpPricing.js); this route lets the admin
// overwrite either figure by hand. Blocked once the help item is
// 'completed' — at that point the figures are frozen for reporting (see
// AdminReports.jsx's Value/Hours/TAT tiles), so no route should still be
// able to change them, including this one.
router.put('/:id/admin-value', authenticate, requireRole('admin'), async (req, res) => {
  const { value, duration_hours } = req.body;
  try {
    const existing = await db.query('SELECT status FROM helps WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status === 'completed') {
      return res.status(400).json({ error: 'This Help ID is completed — its Value and Hours are frozen' });
    }
    const result = await db.query(
      `UPDATE helps SET value=$1, duration_hours=$2, updated_at=NOW() WHERE id=$3 RETURNING id, value, duration_hours`,
      [value === '' || value == null ? null : Number(value), duration_hours === '' || duration_hours == null ? null : Number(duration_hours), req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a help request/offer (admin only)
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
try {
await db.query('DELETE FROM helps WHERE id = $1', [req.params.id]);
res.json({ message: 'Help item deleted' });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

module.exports = router;
