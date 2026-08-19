const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

// Auto-approve rules (Admin Home > Services > Auto-approval). A help item
// can only become Matched with an admin's sign-off — either manually, from
// the Help page's Requests list (see PUT /assignments/:id/respond), or
// automatically here, once a rule exists, is active, and fires. The rule
// evaluation engine itself isn't built yet — these routes just manage the
// rule records (create/list/toggle/modify/delete) so the Current Logic
// table has something real to read from and an admin can define, edit,
// enable/disable, or remove rules ahead of that engine landing.

// Current Logic list — oldest first, so a rule's on-screen number (Rule 1,
// Rule 2, ...) stays stable as later rules get added.
router.get('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM auto_match_rules ORDER BY created_at ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new logic — the free-text box below the last rule on the Auto-approval
// page. New rules start active.
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  const { logic } = req.body;
  if (!logic || !logic.trim()) return res.status(400).json({ error: 'Rule text is required' });
  try {
    const result = await db.query(
      'INSERT INTO auto_match_rules (logic) VALUES ($1) RETURNING *',
      [logic.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Flip a rule's active/inactive switch without deleting it or losing its
// applied_count history.
router.patch('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'is_active must be true or false' });
  try {
    const result = await db.query(
      'UPDATE auto_match_rules SET is_active = $1 WHERE id = $2 RETURNING *',
      [is_active, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Modify a rule's logic text (its number and applied_count history stay
// put — only the wording changes).
router.put('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { logic } = req.body;
  if (!logic || !logic.trim()) return res.status(400).json({ error: 'Rule text is required' });
  try {
    const result = await db.query(
      'UPDATE auto_match_rules SET logic = $1 WHERE id = $2 RETURNING *',
      [logic.trim(), req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a rule outright — unlike the is_active switch, this loses its
// applied_count history for good, so the client confirms first.
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query('DELETE FROM auto_match_rules WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
