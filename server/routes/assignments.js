const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const { buildIcs } = require('../utils/ics');
const { sendCalendarInvite } = require('../utils/email');
const { computeDefaultValueAndHours } = require('../utils/helpPricing');
const { notifyUser } = require('../utils/notifier');
const router = express.Router();

// Fills in a newly-Matched help item's Value/Hours with computed defaults
// (see helpPricing.js) — called right after admin_approved flips true at
// any of its three call sites below (manual admin Approve, Auto-approval
// rule 1, or an admin's direct-assign). Only ever touches a help row that
// still has BOTH fields empty, so it never clobbers figures an admin has
// already entered by hand (e.g. re-approving after an unmatch/rematch).
async function applyDefaultValueHours(helpRowId, assignmentId) {
  const helpRes = await db.query(
    'SELECT value, duration_hours, quantity, unit, category, sub_category, title FROM helps WHERE id = $1',
    [helpRowId]
  );
  const help = helpRes.rows[0];
  if (!help || help.value != null || help.duration_hours != null) return;
  const assignRes = await db.query('SELECT logistics_preference FROM assignments WHERE id = $1', [assignmentId]);
  const { value, duration_hours } = computeDefaultValueAndHours(help, assignRes.rows[0]?.logistics_preference);
  await db.query('UPDATE helps SET value = $1, duration_hours = $2 WHERE id = $3', [value, duration_hours, helpRowId]);
}

// Shared by PUT/DELETE /:id/schedule below — one lookup covering everything
// needed to authorize the request (creator/consumer identity) and build the
// calendar invite (help details, both parties' emails). Same isCreator/
// isConsumer + Remar Store "system creator" pattern as PUT /:id/ack above.
async function loadScheduleContext(assignmentId) {
const result = await db.query(
`SELECT a.id, a.status AS current_status, a.admin_approved,
a.calendar_ics_uid, a.calendar_sequence, a.calendar_datetime, a.calendar_duration_minutes,
h.id AS help_row_id, h.help_id, h.title, h.is_online, h.created_by, h.direction,
v.user_id AS volunteer_user_id, uv.email AS volunteer_email,
b.user_id AS beneficiary_user_id, ub.email AS beneficiary_email,
uc.email AS creator_email
FROM assignments a
JOIN helps h ON a.help_row_id = h.id
JOIN helpers v ON v.id = a.volunteer_id
LEFT JOIN beneficiaries b ON b.id = a.beneficiary_id
LEFT JOIN users uv ON uv.id = v.user_id
LEFT JOIN users ub ON ub.id = b.user_id
LEFT JOIN users uc ON uc.id = h.created_by
WHERE a.id = $1`,
[assignmentId]
);
return result.rows[0] || null;
}
function authorizeScheduleParty(row, user) {
const isSystemCreator = row.direction != null;
const isCreator = row.created_by === user.id || (user.role === 'admin' && isSystemCreator);
const isConsumer = !isCreator && (row.volunteer_user_id === user.id || row.beneficiary_user_id === user.id);
return isCreator || isConsumer || user.role === 'admin';
}

// Item 2 — Auto-approval rule 1 (Admin Home > Services > Auto-approval, see
// routes/autoMatch.js): "If the same combination of creator and consumer
// have been approved by Admin for the same item twice in the last 6 months
// and the consumer is first in order of request, auto-approve the match."
// Called right after the item's real (non-admin) owner accepts a
// still-pending request in PUT /:id/respond below — that's the moment a
// match would otherwise sit waiting for an admin's manual sign-off. If this
// fires, it sets admin_approved here instead of leaving that to admin,
// same end state as an admin doing it themselves. Matched by rule 1's exact
// seeded wording (db.DEFAULT_AUTO_MATCH_RULE) rather than "whichever rule
// happens to be first", since there's still no free-text rule-parsing
// engine for arbitrary custom rules (see routes/autoMatch.js).
async function evaluateAutoApprovalRule1(assignmentId) {
try {
const rule = await db.query(
`SELECT id FROM auto_match_rules WHERE is_active = TRUE AND logic = $1 LIMIT 1`,
[db.DEFAULT_AUTO_MATCH_RULE]
);
if (!rule.rows[0]) return false;

const ctx = await db.query(
`SELECT a.id, a.created_at, a.volunteer_id, COALESCE(a.beneficiary_id, bc.id) AS beneficiary_id,
h.id AS help_row_id, h.created_by, h.category, h.sub_category, h.title
FROM assignments a
JOIN helps h ON a.help_row_id = h.id
LEFT JOIN beneficiaries bc ON bc.user_id = h.created_by
WHERE a.id = $1`,
[assignmentId]
);
const row = ctx.rows[0];
if (!row || !row.volunteer_id || !row.beneficiary_id) return false;

// "Consumer is first in order of request" — this must be the earliest
// still-live (non-cancelled) request made for this specific help item.
const first = await db.query(
`SELECT id FROM assignments WHERE help_row_id = $1 AND status != 'cancelled' ORDER BY created_at ASC LIMIT 1`,
[row.help_row_id]
);
if (!first.rows[0] || first.rows[0].id !== row.id) return false;

// Same helper+beneficiary pair, admin-approved for the exact same item
// (category + sub-category + title) at least twice in the last 6 months.
// Matched on volunteer_id + resolved beneficiary_id directly rather than
// on h.created_by — either party can create a Help ID (a helper offering
// something, or a beneficiary requesting it), so "the same combination of
// parties" can flip which one is the creator from one instance to the
// next, and the assignment row's own beneficiary_id column is only
// populated on some of those flows (see the ctx query above). Filtering by
// created_by missed that: e.g. two prior approvals created by the helper
// (XHAA0020, XHAA0012) didn't count toward a third instance created by the
// beneficiary (XBAA0007) even though it was the same two people and the
// same item.
const priorCount = await db.query(
`SELECT COUNT(*)::int AS n
FROM assignments a2
JOIN helps h2 ON a2.help_row_id = h2.id
LEFT JOIN beneficiaries bc2 ON bc2.user_id = h2.created_by
WHERE a2.volunteer_id = $1
AND COALESCE(a2.beneficiary_id, bc2.id) = $2
AND h2.category IS NOT DISTINCT FROM $3
AND h2.sub_category IS NOT DISTINCT FROM $4
AND h2.title = $5
AND a2.admin_approved = TRUE
AND a2.updated_at >= NOW() - INTERVAL '6 months'`,
[row.volunteer_id, row.beneficiary_id, row.category, row.sub_category, row.title]
);
if ((priorCount.rows[0]?.n || 0) < 2) return false;

await db.query(`UPDATE assignments SET admin_approved = TRUE, updated_at = NOW() WHERE id = $1`, [assignmentId]);
await db.query(`UPDATE helps SET status = 'assigned' WHERE id = $1`, [row.help_row_id]);
await db.query(`UPDATE auto_match_rules SET applied_count = applied_count + 1 WHERE id = $1`, [rule.rows[0].id]);
await applyDefaultValueHours(row.help_row_id, assignmentId);
return true;
} catch (err) {
console.error('Auto-approval rule 1 evaluation error:', err.message);
return false;
}
}

const sendNotification = async (to, subject, text) => {
if (!process.env.EMAIL_USER) return;
const transporter = nodemailer.createTransport({
service: 'gmail',
auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});
await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, text });
};

// Get all assignments (admin only)
router.get('/', authenticate, requireRole('admin'), async (req, res) => {
try {
const result = await db.query(`
SELECT a.*, h.title as help_title, v.name as volunteer_name, b.name as beneficiary_name
FROM assignments a
JOIN helps h ON a.help_row_id = h.id
JOIN helpers v ON a.volunteer_id = v.id
LEFT JOIN beneficiaries b ON a.beneficiary_id = b.id
ORDER BY a.created_at DESC
`);
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// A consumer's chosen logistics_preference must be a non-empty subset of the
// help item's own options whenever the item actually has any (Food/Clothes/
// Toiletries items only — see NewHelp.jsx) — the Universe view's Select/
// Request popup requires ticking at least one before it lets the request
// through, this is that same rule enforced server-side. Items with no
// logistics_preference at all (services, Money, etc.) skip this entirely.
function validateLogisticsChoice(helpLogistics, chosen) {
if (!Array.isArray(helpLogistics) || helpLogistics.length === 0) return null;
if (!Array.isArray(chosen) || chosen.length === 0) {
return 'Please select at least one delivery/collection preference before requesting this help item.';
}
if (!chosen.every((v) => helpLogistics.includes(v))) {
return 'Selected preference is not one of the options offered for this help item.';
}
return null;
}

// Volunteer applies for a help item
router.post('/apply', authenticate, requireRole('helper'), async (req, res) => {
const { help_row_id, logistics_preference } = req.body;
try {
const volResult = await db.query('SELECT id FROM helpers WHERE user_id = $1', [req.user.id]);
if (!volResult.rows[0]) return res.status(400).json({ error: 'Volunteer profile not found' });
const volunteer_id = volResult.rows[0].id;

const helpResult = await db.query('SELECT status, logistics_preference FROM helps WHERE id = $1', [help_row_id]);
if (!helpResult.rows[0]) return res.status(404).json({ error: 'Help item not found' });
if (helpResult.rows[0].status !== 'open') return res.status(400).json({ error: 'Help item is not open for applications' });
const logisticsError = validateLogisticsChoice(helpResult.rows[0].logistics_preference, logistics_preference);
if (logisticsError) return res.status(400).json({ error: logisticsError });

// Cancelled excluded — a withdrawn (self-cancelled) or rejected
// application shouldn't block a fresh one; only a still-active
// (pending/confirmed/completed) application on this item counts as
// "already applied" (see GET /help/store's my_assignment_status, which
// gates the client's Apply button the same way).
const existing = await db.query("SELECT id FROM assignments WHERE help_row_id = $1 AND volunteer_id = $2 AND status != 'cancelled'", [help_row_id, volunteer_id]);
if (existing.rows[0]) return res.status(400).json({ error: 'Already applied for this help item' });

const result = await db.query(
`INSERT INTO assignments (help_row_id, volunteer_id, assigned_by, status, logistics_preference) VALUES ($1,$2,$3,'pending',$4) RETURNING *`,
[help_row_id, volunteer_id, req.user.id, logistics_preference || null]
);
res.status(201).json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Beneficiary requests a helper's own offered help item — the reverse
// direction from /apply above (which is a helper applying to a
// beneficiary's request). volunteer_id is derived from the help item's
// creator (a helper), beneficiary_id is set explicitly to the requester,
// mirroring how /apply sets volunteer_id explicitly with beneficiary_id
// left implicit. Left as a fully separate route so /apply's existing
// behavior for the helper-applies flow is untouched.
router.post('/request', authenticate, requireRole('beneficiary'), async (req, res) => {
const { help_row_id, logistics_preference } = req.body;
try {
const benResult = await db.query('SELECT id FROM beneficiaries WHERE user_id = $1', [req.user.id]);
if (!benResult.rows[0]) return res.status(400).json({ error: 'Beneficiary profile not found' });
const beneficiary_id = benResult.rows[0].id;

const helpResult = await db.query('SELECT status, created_by, logistics_preference FROM helps WHERE id = $1', [help_row_id]);
if (!helpResult.rows[0]) return res.status(404).json({ error: 'Help item not found' });
if (helpResult.rows[0].status !== 'open') return res.status(400).json({ error: 'Help item is not open for requests' });
const logisticsError = validateLogisticsChoice(helpResult.rows[0].logistics_preference, logistics_preference);
if (logisticsError) return res.status(400).json({ error: logisticsError });

const helperResult = await db.query('SELECT id FROM helpers WHERE user_id = $1', [helpResult.rows[0].created_by]);
if (!helperResult.rows[0]) return res.status(400).json({ error: 'This item was not offered by a helper' });
const volunteer_id = helperResult.rows[0].id;

// Cancelled excluded — see the matching comment on /apply above.
const existing = await db.query("SELECT id FROM assignments WHERE help_row_id = $1 AND beneficiary_id = $2 AND status != 'cancelled'", [help_row_id, beneficiary_id]);
if (existing.rows[0]) return res.status(400).json({ error: 'Already requested this help item' });

const result = await db.query(
`INSERT INTO assignments (help_row_id, volunteer_id, beneficiary_id, assigned_by, status, logistics_preference) VALUES ($1,$2,$3,$4,'pending',$5) RETURNING *`,
[help_row_id, volunteer_id, beneficiary_id, req.user.id, logistics_preference || null]
);
res.status(201).json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Get current volunteer's assignments
router.get('/my', authenticate, requireRole('helper'), async (req, res) => {
try {
const volResult = await db.query('SELECT id FROM helpers WHERE user_id = $1', [req.user.id]);
if (!volResult.rows[0]) return res.json([]);
const result = await db.query(
`SELECT a.*, h.title as help_title, h.location, h.scheduled_date
FROM assignments a JOIN helps h ON a.help_row_id = h.id
WHERE a.volunteer_id = $1 ORDER BY a.created_at DESC`,
[volResult.rows[0].id]
);
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Create assignment (admin only) — REMAR directly pairing a helper and
// beneficiary is treated as an immediate, already-approved match, not a
// pending request (there's no one left to "accept" it, and it's an admin
// doing the pairing themselves) — status is set to 'confirmed' and
// admin_approved to true straight away, same as an admin's own Accept via
// /:id/respond, which also puts the chat between the two of them within reach.
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
const { help_row_id, volunteer_id, beneficiary_id, notes } = req.body;
try {
const result = await db.query(
`INSERT INTO assignments (help_row_id, volunteer_id, beneficiary_id, assigned_by, notes, status, admin_approved)
VALUES ($1,$2,$3,$4,$5,'confirmed',TRUE) RETURNING *`,
[help_row_id, volunteer_id, beneficiary_id, req.user.id, notes]
);

// Update help item status
await db.query("UPDATE helps SET status='assigned' WHERE id=$1", [help_row_id]);
await applyDefaultValueHours(help_row_id, result.rows[0].id);

// Send notification
const volUser = await db.query(
'SELECT u.email FROM users u JOIN helpers v ON u.id = v.user_id WHERE v.id = $1', [volunteer_id]
);
if (volUser.rows[0]) {
await sendNotification(volUser.rows[0].email, 'REMAR: New Assignment', 'You have been assigned to a new volunteer opportunity. Please log in to view details.');
}

res.status(201).json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Beneficiary approves/rejects a helper's application (existing flow), or a
// helper accepts/rejects a beneficiary's request on their own offered item
// (new flow) — same route, same ownership check below (h.created_by is
// whoever posted the help item either way), just no longer restricted to
// the beneficiary role only. An admin can also act here on ANY help item's
// requests (the ownership check is skipped for them) — reviewing/approving
// requests from the same Help page is exactly the "manual acceptance" flow.
//
// A help item can only ever become Matched with an admin's sign-off (manual,
// here, or an auto-approval rule elsewhere) — not from a party's own Accept
// alone. So when the party doing the accepting is the helper/beneficiary
// themselves, this only moves the assignment to 'confirmed' (acknowledging
// they're willing) without touching the help item's status. When it's an
// admin accepting — whether the request was still 'pending' or already
// party-'confirmed' — that's the actual approval: admin_approved is set and
// the help item flips to 'assigned' (Matched) in the same step.
//
// Also handles un-matching: the item's owner (or an admin) can cancel a
// beneficiary/helper even after they were already confirmed — rather than a
// hard delete/reject, this reverts the assignment back to 'pending' (so it's
// still there, just no longer matched), clears admin_approved, and reverts
// the help item back to 'open', which reads as "Requested" again everywhere
// the status is shown, instead of vanishing outright.
router.put('/:id/respond', authenticate, requireRole('helper', 'beneficiary', 'admin'), async (req, res) => {
const { status } = req.body; // 'confirmed', 'cancelled', or 'pending' (unmatch)
if (!['confirmed', 'cancelled', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
const isAdmin = req.user.role === 'admin';
try {
// Pulls in both parties' user ids so a non-owner can be recognized as
// "the requester on their own row" below — the item's owner isn't the
// only one allowed to act here anymore (see isRequester). h.direction is
// only ever set on a Remar Store/admin-owned item (see POST /help) — used
// below to gate admin's power over a still-pending request.
const check = await db.query(
`SELECT a.id, a.status AS current_status, a.help_row_id, h.created_by, h.direction, h.help_id, h.title,
v.user_id AS volunteer_user_id, b.user_id AS beneficiary_user_id
FROM assignments a
JOIN helps h ON a.help_row_id = h.id
JOIN helpers v ON v.id = a.volunteer_id
LEFT JOIN beneficiaries b ON b.id = a.beneficiary_id
WHERE a.id = $1`,
[req.params.id]
);
if (!check.rows[0]) return res.status(403).json({ error: 'Not authorized' });
const row = check.rows[0];
const isRealCreator = row.created_by === req.user.id;
const isStoreItem = row.direction != null;
// A brand-new, still-'pending' request has to reach the item's real
// creator first (Accept/Reject) — only once THEY'VE moved it to
// 'confirmed' does it reach admin for final sign-off. So admin only gets
// owner-level power over a still-pending request for a Remar Store item,
// where admin already stands in for the (login-less) system account as
// the real creator (same proxy PUT /assignments/:id/ack already allows).
// Once a request is past 'pending' (already confirmed, or this call isn't
// an accept/reject at all — e.g. unmatching an existing match), admin
// keeps full owner-level power everywhere, same as before.
const isRespondingToFreshRequest = row.current_status === 'pending' && ['confirmed', 'cancelled'].includes(status);
const isOwner = isRealCreator || (isAdmin && (isStoreItem || !isRespondingToFreshRequest));
// The other party on this same assignment — whoever sent the request
// this row represents (not the item's owner). Lets them revoke their
// own still-pending request (an "unsend") without giving them any of
// the owner's Accept/Reject/unmatch powers.
const isRequester = !isOwner && (row.volunteer_user_id === req.user.id || row.beneficiary_user_id === req.user.id);
if (!isOwner && !isRequester) return res.status(403).json({ error: 'Not authorized' });
if (isRequester && (status !== 'cancelled' || row.current_status !== 'pending')) {
return res.status(403).json({ error: 'Not authorized' });
}
if (status === 'pending' && row.current_status !== 'confirmed') {
return res.status(400).json({ error: 'Only a matched request can be cancelled back to requested' });
}

const result = await db.query(
`UPDATE assignments SET status=$1, admin_approved=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
[status, status === 'confirmed' && isAdmin, req.params.id]
);
if (status === 'confirmed' && isAdmin) {
await db.query("UPDATE helps SET status='assigned' WHERE id=(SELECT help_row_id FROM assignments WHERE id=$1)", [req.params.id]);
await applyDefaultValueHours(row.help_row_id, req.params.id);
} else if (status === 'pending') {
await db.query("UPDATE helps SET status='open' WHERE id=(SELECT help_row_id FROM assignments WHERE id=$1)", [req.params.id]);
} else if (status === 'confirmed' && !isAdmin) {
// The item's real owner just accepted a request themselves — normally
// this still waits for an admin's manual sign-off (see comment above
// this route), unless Auto-approval rule 1 fires here and fast-tracks
// it straight to Matched.
const autoApproved = await evaluateAutoApprovalRule1(req.params.id);
if (autoApproved) result.rows[0].admin_approved = true;
}

// Settings > App preferences > Notifications ('help_status' event) — let
// whichever party on this assignment did NOT make this change know the
// status moved. Best-effort/non-blocking (see notifyUser) so a
// notification-delivery problem never affects the response below.
const statusLabel = status === 'confirmed'
? (result.rows[0].admin_approved ? 'Matched' : 'Accepted (pending admin approval)')
: status === 'cancelled' ? 'Rejected / Cancelled'
: 'Reverted to Requested';
const otherPartyIds = [row.volunteer_user_id, row.beneficiary_user_id]
.filter((id) => id && id !== req.user.id);
for (const id of otherPartyIds) {
notifyUser(id, 'help_status', {
subject: `REMAR Schweiz: Help ${row.help_id || ''} status update`,
text: `The status of Help ${row.help_id || ''} (${row.title || ''}) changed to: ${statusLabel}.`,
});
}

res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Mutual post-approval confirmation — once a match is admin-approved, the
// help item's own creator and the other matched party ("consumer") each
// independently tick their own box for "is the delivery scheduled?" and
// "is the delivery completed?" (Help Status page, replacing the old
// Cancel/Modify/Delete row for both of them at that point). type is
// 'scheduled' or 'completed', value is the new checked state for whichever
// side the caller is on. Ticking "scheduled" only ever changes the derived
// status label (client-side, same as the old scheduled_date check it
// replaces) — but once BOTH sides have ticked "completed", this actually
// flips the assignment's (and the help item's) own status to 'completed'
// for real, and reverts it back to 'confirmed'/'assigned' if either side
// unchecks afterwards.
router.put('/:id/ack', authenticate, requireRole('helper', 'beneficiary', 'admin'), async (req, res) => {
const { type, value } = req.body;
if (!['scheduled', 'completed'].includes(type) || typeof value !== 'boolean') {
return res.status(400).json({ error: 'Invalid ack' });
}
try {
const check = await db.query(
`SELECT a.id, a.status AS current_status, a.admin_approved, a.help_row_id, h.created_by, h.direction,
v.user_id AS volunteer_user_id, b.user_id AS beneficiary_user_id
FROM assignments a
JOIN helps h ON a.help_row_id = h.id
JOIN helpers v ON v.id = a.volunteer_id
LEFT JOIN beneficiaries b ON b.id = a.beneficiary_id
WHERE a.id = $1`,
[req.params.id]
);
if (!check.rows[0]) return res.status(404).json({ error: 'Not found' });
const row = check.rows[0];
// Only meaningful once admin has actually approved this match — before
// that there's no "delivery" to schedule/complete yet, and it's still the
// old Cancel/Modify/Delete + Accept/Reject flow. 'completed' is also
// allowed as the current status (ticking "completed" itself doesn't need
// to still be 'confirmed').
if (!['confirmed', 'completed'].includes(row.current_status) || !row.admin_approved) {
return res.status(400).json({ error: 'This request has not been approved yet' });
}
// A Remar Store item's "creator" is one of its two system accounts (see
// db.js) which never logs in — nobody can ever tick creator_scheduled/
// creator_completed on its behalf directly. h.direction is only ever set
// on a Remar Store/admin-owned item (see POST /help), so it doubles as
// "this help item's creator can't act for itself" — admin ticks on its
// behalf instead, same as admin already stands in for it in /respond.
const isSystemCreator = row.direction != null;
const isCreator = row.created_by === req.user.id || (req.user.role === 'admin' && isSystemCreator);
const isConsumer = !isCreator && (row.volunteer_user_id === req.user.id || row.beneficiary_user_id === req.user.id);
if (!isCreator && !isConsumer) return res.status(403).json({ error: 'Not authorized' });

const column = `${isCreator ? 'creator' : 'consumer'}_${type}`;
await db.query(`UPDATE assignments SET ${column} = $1, updated_at = NOW() WHERE id = $2`, [value, req.params.id]);

const refreshed = await db.query(
`SELECT creator_scheduled, consumer_scheduled, creator_completed, consumer_completed, status FROM assignments WHERE id = $1`,
[req.params.id]
);
const a = refreshed.rows[0];
if (type === 'completed') {
const bothCompleted = a.creator_completed && a.consumer_completed;
const newAssignmentStatus = bothCompleted ? 'completed' : 'confirmed';
await db.query(`UPDATE assignments SET status = $1 WHERE id = $2`, [newAssignmentStatus, req.params.id]);
// completed_at starts the 7-day Chats send-lock window (see messages.js's
// isHelpLocked) — cleared again if either side unchecks afterwards, same
// as the status revert itself.
await db.query(
`UPDATE helps SET status = $1, completed_at = $2 WHERE id = $3`,
[bothCompleted ? 'completed' : 'assigned', bothCompleted ? new Date() : null, row.help_row_id]
);
a.status = newAssignmentStatus;
}
res.json(a);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Item 12 — optional post-match Schedule (Help Status page): date/time +
// duration, a Jitsi meeting link for an Online help item or the given venue
// for a physical one, and a calendar invite (.ics) emailed to both the
// creator and the consumer. Only meaningful once this assignment is
// actually Matched (same current_status + admin_approved gate as /ack
// above). Re-sending after the first send (client's "Modify") reuses the
// same calendar_ics_uid with calendar_sequence bumped, so calendar apps
// treat it as an update to the existing event rather than a new one.
router.put('/:id/schedule', authenticate, requireRole('helper', 'beneficiary', 'admin'), async (req, res) => {
const { datetime, duration_minutes, venue } = req.body;
if (!datetime) return res.status(400).json({ error: 'A date and time is required' });
try {
const row = await loadScheduleContext(req.params.id);
if (!row) return res.status(404).json({ error: 'Not found' });
if (!['confirmed', 'completed'].includes(row.current_status) || !row.admin_approved) {
return res.status(400).json({ error: 'This Help ID has not been matched yet' });
}
if (!authorizeScheduleParty(row, req.user)) return res.status(403).json({ error: 'Not authorized' });

const duration = Number(duration_minutes) > 0 ? Number(duration_minutes) : 30;
// One stable room per Help ID — same link every time this Schedule is
// (re)sent, rather than a fresh one each edit.
const meetingLink = row.is_online ? `https://meet.jit.si/RemarSchweiz-${row.help_id}` : null;
const venueText = row.is_online ? null : (venue || null);
const uid = row.calendar_ics_uid || `${row.id}@remar-schweiz.app`;
const sequence = row.calendar_ics_uid ? row.calendar_sequence + 1 : 0;

await db.query(
`UPDATE assignments SET calendar_datetime=$1, calendar_duration_minutes=$2, calendar_meeting_link=$3, calendar_venue=$4,
calendar_ics_uid=$5, calendar_sequence=$6, calendar_sent_at=NOW(), updated_at=NOW() WHERE id=$7`,
[datetime, duration, meetingLink, venueText, uid, sequence, req.params.id]
);

const attendeeEmails = [row.creator_email, row.volunteer_email || row.beneficiary_email].filter(Boolean);
if (attendeeEmails.length) {
const location = meetingLink || venueText || undefined;
const ics = buildIcs({
uid, sequence, method: 'REQUEST', start: datetime, durationMinutes: duration,
summary: `Remar: Help ID ${row.help_id}`,
description: meetingLink ? `Join online: ${meetingLink}` : (venueText ? `Location: ${venueText}` : undefined),
location, organizerEmail: process.env.EMAIL_USER, attendeeEmails,
});
await sendCalendarInvite(attendeeEmails.join(', '), `Remar: Help ID ${row.help_id}`, `
<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#3a6b00">Help ${row.help_id} scheduled</h2>
<p>${row.title}</p>
<p>${meetingLink ? `Join online: <a href="${meetingLink}">${meetingLink}</a>` : (venueText ? `Location: ${venueText}` : '')}</p>
</div>
`, ics, 'REQUEST');
}

res.json({
calendar_datetime: datetime, calendar_duration_minutes: duration,
calendar_meeting_link: meetingLink, calendar_venue: venueText, calendar_sent_at: new Date().toISOString(),
});
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Deletes a sent Schedule (Help Status page's "Delete" option once
// frozen) — best-effort emails a CANCEL .ics to both parties first (so it
// disappears from calendar apps that already added it), then clears the
// fields so the tab goes back to its empty, editable state.
router.delete('/:id/schedule', authenticate, requireRole('helper', 'beneficiary', 'admin'), async (req, res) => {
try {
const row = await loadScheduleContext(req.params.id);
if (!row) return res.status(404).json({ error: 'Not found' });
if (!authorizeScheduleParty(row, req.user)) return res.status(403).json({ error: 'Not authorized' });

if (row.calendar_ics_uid && row.calendar_datetime) {
const attendeeEmails = [row.creator_email, row.volunteer_email || row.beneficiary_email].filter(Boolean);
if (attendeeEmails.length) {
const ics = buildIcs({
uid: row.calendar_ics_uid, sequence: row.calendar_sequence + 1, method: 'CANCEL',
start: row.calendar_datetime, durationMinutes: row.calendar_duration_minutes || 30,
summary: `Remar: Help ID ${row.help_id}`,
organizerEmail: process.env.EMAIL_USER, attendeeEmails,
});
await sendCalendarInvite(attendeeEmails.join(', '), `Help ${row.help_id} — invite cancelled`, `
<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#3a6b00">Help ${row.help_id} schedule cancelled</h2>
</div>
`, ics, 'CANCEL');
}
}
await db.query(
`UPDATE assignments SET calendar_datetime=NULL, calendar_duration_minutes=NULL, calendar_meeting_link=NULL, calendar_venue=NULL, calendar_sent_at=NULL, updated_at=NOW() WHERE id=$1`,
[req.params.id]
);
res.json({ deleted: true });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Post-completion feedback + rating (Help Status page's "Help feedback"
// card) — only meaningful once this assignment (and its help item) has
// actually reached 'completed' for real (both sides ticked "completed" via
// /:id/ack above), same creator/consumer split as the ack columns. Each
// side can only ever set their own column, never the other's — admin has
// no column of its own here (it isn't a party to the match), it just reads
// both back via GET /help/:id/counterpart once they exist.
router.put('/:id/feedback', authenticate, requireRole('helper', 'beneficiary'), async (req, res) => {
const { feedback, rating } = req.body;
if (rating != null && (typeof rating !== 'number' || rating < 1 || rating > 5)) {
return res.status(400).json({ error: 'rating must be a number between 1 and 5' });
}
try {
const check = await db.query(
`SELECT a.id, a.status AS current_status, h.created_by,
v.user_id AS volunteer_user_id, b.user_id AS beneficiary_user_id
FROM assignments a
JOIN helps h ON a.help_row_id = h.id
JOIN helpers v ON v.id = a.volunteer_id
LEFT JOIN beneficiaries b ON b.id = a.beneficiary_id
WHERE a.id = $1`,
[req.params.id]
);
if (!check.rows[0]) return res.status(404).json({ error: 'Not found' });
const row = check.rows[0];
if (row.current_status !== 'completed') {
return res.status(400).json({ error: 'Feedback can only be left once this help item is marked Completed' });
}
const isCreator = row.created_by === req.user.id;
const isConsumer = !isCreator && (row.volunteer_user_id === req.user.id || row.beneficiary_user_id === req.user.id);
if (!isCreator && !isConsumer) return res.status(403).json({ error: 'Not authorized' });

const feedbackCol = isCreator ? 'creator_feedback' : 'consumer_feedback';
const ratingCol = isCreator ? 'creator_rating' : 'consumer_rating';
const result = await db.query(
`UPDATE assignments SET ${feedbackCol} = $1, ${ratingCol} = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
[feedback?.trim() || null, rating ?? null, req.params.id]
);
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Get pending applications for beneficiary's help items
router.get('/for-me', authenticate, requireRole('beneficiary'), async (req, res) => {
try {
const result = await db.query(
`SELECT a.*, h.title as help_title, v.name as volunteer_name, v.phone as volunteer_phone
FROM assignments a
JOIN helps h ON a.help_row_id = h.id
JOIN helpers v ON a.volunteer_id = v.id
WHERE h.created_by = $1 AND a.status = 'pending'
ORDER BY a.created_at DESC`,
[req.user.id]
);
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Update assignment status (admin only)
router.put('/:id', authenticate, requireRole('admin'), async (req, res) => {
const { status, notes } = req.body;
try {
const result = await db.query(
'UPDATE assignments SET status=$1, notes=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
[status, notes, req.params.id]
);
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

module.exports = router;
