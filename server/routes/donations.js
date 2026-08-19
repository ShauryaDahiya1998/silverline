const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

// Admin Home > Services > Donation. Nothing today captures a donation
// automatically (Donate.jsx just shows bank-transfer details — no payment
// processor is wired up), so an admin logs each one manually once it's
// actually received from a helper, and this list is what powers both the
// donations table and the period-total dropdown on that page.
router.get('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.id, d.amount, d.donated_at, d.created_at,
       h.id AS helper_id, h.member_number AS helper_member_number,
       COALESCE(NULLIF(h.nickname, ''), h.name) AS helper_name
       FROM donations d
       JOIN helpers h ON h.id = d.helper_id
       ORDER BY d.donated_at DESC, d.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Whether there's a donation the current admin hasn't seen yet — powers the
// green "new" highlight on Admin Home > Services > Donation. Compares the
// most recent donation's created_at against this admin's own
// donations_seen_at (see users table migration in db.js), which only moves
// forward when they actually open the Donation page (mark-seen below).
router.get('/unseen', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const seen = await db.query('SELECT donations_seen_at FROM users WHERE id = $1', [req.user.id]);
    const latest = await db.query('SELECT MAX(created_at) AS latest FROM donations');
    const latestAt = latest.rows[0]?.latest;
    const seenAt = seen.rows[0]?.donations_seen_at;
    const hasNew = !!latestAt && (!seenAt || new Date(latestAt) > new Date(seenAt));
    res.json({ hasNew });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Called when the admin opens the Donation page — clears the "new" flag
// above for them (other admins, if any, keep seeing it until they do too).
router.post('/mark-seen', authenticate, requireRole('admin'), async (req, res) => {
  try {
    await db.query('UPDATE users SET donations_seen_at = NOW() WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// A helper's own donation history — powers the Donations tile on My
// Contribution (Contribution.jsx), which aggregates these client-side the
// same way it already does for completed-help stats (by the selected
// Lifetime/year/month period).
router.get('/mine', authenticate, requireRole('helper'), async (req, res) => {
  try {
    const helperResult = await db.query('SELECT id FROM helpers WHERE user_id = $1', [req.user.id]);
    if (!helperResult.rows[0]) return res.json([]);
    const result = await db.query(
      `SELECT id, amount, donated_at FROM donations WHERE helper_id = $1 ORDER BY donated_at DESC`,
      [helperResult.rows[0].id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Log a donation — helper_id (the helpers.id, not the user id), amount
// (Fr.), and the date it was actually received (defaults to today if
// omitted, but the client always sends one).
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  const { helper_id, amount, donated_at } = req.body;
  if (!helper_id || amount == null || Number(amount) <= 0) {
    return res.status(400).json({ error: 'helper_id and a positive amount are required' });
  }
  try {
    const helper = await db.query('SELECT id FROM helpers WHERE id = $1', [helper_id]);
    if (!helper.rows[0]) return res.status(404).json({ error: 'Helper not found' });
    const result = await db.query(
      `INSERT INTO donations (helper_id, amount, donated_at, logged_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [helper_id, Number(amount), donated_at || new Date(), req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
