const express = require('express');
const nodemailer = require('nodemailer');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'zubinsarkar@gmail.com';

// Settings > Support > Give App Feedback (helper/beneficiary — see
// client's GiveFeedback.jsx). Always emails SUPPORT_EMAIL on submit,
// regardless of the submitter's own notification_channels preference —
// this isn't a per-event-type notification (see utils/notifier.js), it's
// REMAR's own inbox for app feedback.
router.post('/', authenticate, async (req, res) => {
const { rating, text } = req.body;
const ratingNum = Number(rating);
if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5' });
}
if (!text?.trim()) {
return res.status(400).json({ error: 'Feedback text is required' });
}
try {
const result = await db.query(
'INSERT INTO app_feedback (user_id, rating, feedback_text) VALUES ($1,$2,$3) RETURNING *',
[req.user.id, ratingNum, text.trim()]
);
const feedback = result.rows[0];

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
subject: `REMAR Schweiz App Feedback: ${ratingNum}★`,
text: `From: ${req.user.email}\nRole: ${req.user.role}\nRating: ${ratingNum}/5\n\n${text.trim()}`,
});
} catch (mailErr) {
// The feedback is already recorded either way — email delivery
// failing shouldn't lose the submission itself.
console.error('Feedback email send failed:', mailErr.message);
}
}

res.json({ success: true, feedback });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Called only after a 5-star submission's follow-up "post this publicly?"
// prompt (client-side) — records the answer either way so the admin
// Feedback page can tell "hasn't been asked" (still NULL) apart from "said
// no" (false). Scoped to the submitter's own row so one user can't consent
// on another's behalf.
router.put('/:id/public-consent', authenticate, async (req, res) => {
const { consent } = req.body;
if (typeof consent !== 'boolean') {
return res.status(400).json({ error: 'consent must be true or false' });
}
try {
const result = await db.query(
'UPDATE app_feedback SET public_consent = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
[consent, req.params.id, req.user.id]
);
if (!result.rows[0]) return res.status(404).json({ error: 'Feedback not found' });
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Every feedback submission across every user (admin only) — Settings >
// My account > Feedback.
router.get('/', authenticate, requireRole('admin'), async (req, res) => {
try {
const result = await db.query(
`SELECT f.*, u.email AS user_email, u.role AS user_role
FROM app_feedback f
JOIN users u ON u.id = f.user_id
ORDER BY f.created_at DESC`
);
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

module.exports = router;
