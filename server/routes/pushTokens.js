const express = require('express');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Registers (or re-registers) a device for push notifications — see client/
// src/utils/pushNotifications.js, which calls this once per app session
// after the OS hands back a real device token. token is globally unique
// (ON CONFLICT re-points it at whoever's currently logged in on that
// device, e.g. after a logout/login as a different account) — nothing
// today actually SENDS a push through this token yet, this just persists
// it so that capability can be built later without another native
// permission round-trip.
router.post('/', authenticate, async (req, res) => {
  const { token, platform } = req.body;
  if (!token || !platform) {
    return res.status(400).json({ error: 'token and platform are required' });
  }
  try {
    await db.query(
      `INSERT INTO push_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = $1, platform = $3`,
      [req.user.id, token, platform]
    );
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
