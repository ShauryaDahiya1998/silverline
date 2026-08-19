const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

// Remar honors — real awards/recognitions granted to a helper by a REMAR
// admin. Not derived from ratings or completed-help counts.

// Current user's own honors (for My Contribution)
router.get('/mine', authenticate, async (req, res) => {
try {
const result = await db.query('SELECT * FROM honors WHERE user_id = $1 ORDER BY awarded_at DESC', [req.user.id]);
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// All honors, optionally filtered by user (admin only)
router.get('/', authenticate, requireRole('admin'), async (req, res) => {
try {
const { user_id } = req.query;
const result = user_id
? await db.query('SELECT * FROM honors WHERE user_id = $1 ORDER BY awarded_at DESC', [user_id])
: await db.query('SELECT * FROM honors ORDER BY awarded_at DESC');
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Grant an honor (admin only)
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
const { user_id, title, description } = req.body;
if (!user_id || !title) return res.status(400).json({ error: 'user_id and title are required' });
try {
const result = await db.query(
'INSERT INTO honors (user_id, title, description, awarded_by) VALUES ($1,$2,$3,$4) RETURNING *',
[user_id, title, description || null, req.user.id]
);
res.status(201).json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Revoke an honor (admin only)
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
try {
await db.query('DELETE FROM honors WHERE id = $1', [req.params.id]);
res.json({ success: true });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

module.exports = router;
