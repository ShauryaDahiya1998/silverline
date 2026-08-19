const express = require('express');
const nodemailer = require('nodemailer');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'zubinsarkar@gmail.com';

// Contact us form (Settings > Support > Contact us) — emails REMAR directly
// and records a support_tickets row so the person can track whether it's
// been resolved (Settings > Support > Tickets). The 48-hour response
// promise is stated on the client; this just delivers/records the message.
router.post('/contact', authenticate, async (req, res) => {
const { subject, description } = req.body;
if (!subject || !description?.trim()) {
return res.status(400).json({ error: 'Subject and description are required' });
}
try {
const ticket = await db.query(
'INSERT INTO support_tickets (user_id, subject, description) VALUES ($1,$2,$3) RETURNING *',
[req.user.id, subject, description.trim()]
);

if (process.env.EMAIL_USER) {
try {
const transporter = nodemailer.createTransport({
service: 'gmail',
auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});
await transporter.sendMail({
from: process.env.EMAIL_USER,
to: SUPPORT_EMAIL,
replyTo: req.user.email,
subject: `REMAR Schweiz Support: ${subject}`,
text: `From: ${req.user.email}\nRole: ${req.user.role}\nTicket: ${ticket.rows[0].id}\n\n${description}`,
});
} catch (mailErr) {
// The ticket is already recorded either way — email delivery failing
// (e.g. no network) shouldn't lose the submission itself.
console.error('Support email send failed:', mailErr.message);
}
}

res.json({ success: true, ticket: ticket.rows[0] });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Past tickets for the current user (Settings > Support > Tickets)
router.get('/tickets/mine', authenticate, async (req, res) => {
try {
const result = await db.query('SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Every support ticket across every user (admin only) — the Escalations
// queue reached from Admin Home > Services > Escalations. Open tickets are
// what actually need admin attention; resolved ones stay listed for
// context/history.
router.get('/tickets', authenticate, requireRole('admin'), async (req, res) => {
try {
const result = await db.query(
`SELECT t.*, u.email AS user_email, u.role AS user_role
FROM support_tickets t
JOIN users u ON u.id = t.user_id
ORDER BY (t.status = 'open') DESC, t.created_at DESC`
);
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Whether there's a support ticket the current admin hasn't seen yet —
// powers the red "new" highlight on Admin Home > Services > Escalations.
// Same pattern as donations.js's /unseen: compares the newest ticket's
// created_at against this admin's own escalations_seen_at.
router.get('/tickets/unseen', authenticate, requireRole('admin'), async (req, res) => {
try {
const seen = await db.query('SELECT escalations_seen_at FROM users WHERE id = $1', [req.user.id]);
const latest = await db.query('SELECT MAX(created_at) AS latest FROM support_tickets');
const latestAt = latest.rows[0]?.latest;
const seenAt = seen.rows[0]?.escalations_seen_at;
const hasNew = !!latestAt && (!seenAt || new Date(latestAt) > new Date(seenAt));
res.json({ hasNew });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Called when the admin opens the Escalations page — clears the "new" flag
// above for them.
router.post('/tickets/mark-seen', authenticate, requireRole('admin'), async (req, res) => {
try {
await db.query('UPDATE users SET escalations_seen_at = NOW() WHERE id = $1', [req.user.id]);
res.json({ ok: true });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Resolve a ticket (admin only) — the only status transition an escalation
// needs; there's no separate "in progress" state to keep the queue simple.
router.put('/tickets/:id/resolve', authenticate, requireRole('admin'), async (req, res) => {
try {
const result = await db.query(
`UPDATE support_tickets SET status = 'resolved', resolved_at = NOW() WHERE id = $1 RETURNING *`,
[req.params.id]
);
if (!result.rows[0]) return res.status(404).json({ error: 'Ticket not found' });
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Save/update a Bot chat session (Settings > Support > Chats) — id is
// client-generated so the same session upserts instead of duplicating if
// it's saved more than once (e.g. a retry).
router.post('/chats', authenticate, async (req, res) => {
const { id, messages } = req.body;
if (!id || !Array.isArray(messages)) {
return res.status(400).json({ error: 'id and messages are required' });
}
try {
const result = await db.query(
`INSERT INTO support_chats (id, user_id, messages) VALUES ($1,$2,$3)
ON CONFLICT (id) DO UPDATE SET messages = EXCLUDED.messages, updated_at = NOW()
RETURNING *`,
[id, req.user.id, JSON.stringify(messages)]
);
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Past chat sessions for the current user (Settings > Support > Chats)
router.get('/chats/mine', authenticate, async (req, res) => {
try {
const result = await db.query('SELECT * FROM support_chats WHERE user_id = $1 ORDER BY updated_at DESC', [req.user.id]);
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

module.exports = router;
