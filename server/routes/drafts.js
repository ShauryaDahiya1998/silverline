const express = require('express');
const crypto = require('crypto');
const db = require('../database/db');
const router = express.Router();

// Create or update a helper registration draft. No auth required — the helper
// doesn't have an account yet at draft time. Access is instead gated by an
// opaque token (generated server-side, stored client-side), so drafts can't
// be enumerated or read just by knowing someone's email.
router.post('/', async (req, res) => {
  const { token, email, data } = req.body;
  if (!data) return res.status(400).json({ error: 'No draft data provided' });
  try {
    if (token) {
      const result = await db.query(
        'UPDATE helper_drafts SET email=$1, data=$2, updated_at=NOW() WHERE token=$3 RETURNING token',
        [email || null, data, token]
      );
      if (result.rows[0]) return res.json({ token: result.rows[0].token });
      // Token was provided but no longer exists (e.g. cleared server-side) — fall through and create a new one
    }
    const newToken = crypto.randomBytes(24).toString('hex');
    await db.query(
      'INSERT INTO helper_drafts (token, email, data) VALUES ($1, $2, $3)',
      [newToken, email || null, data]
    );
    res.status(201).json({ token: newToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch a draft by its token
router.get('/:token', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT email, data, updated_at FROM helper_drafts WHERE token = $1',
      [req.params.token]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Draft not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a draft (e.g. once registration is completed)
router.delete('/:token', async (req, res) => {
  try {
    await db.query('DELETE FROM helper_drafts WHERE token = $1', [req.params.token]);
    res.json({ message: 'Draft deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
