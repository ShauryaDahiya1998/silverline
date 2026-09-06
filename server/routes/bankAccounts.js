const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

// Donate > Bank transfer accounts (client's Donate.jsx tabs + admin-only
// AdminBankDetails.jsx, reached from Settings > My account > Bank details).
// Any signed-in role can read the list (needed so Donate.jsx can render the
// tabs for helpers/beneficiaries too) — only admin can add/modify/delete.

// Oldest first, so a bank's on-screen order stays stable as later ones get
// added — same convention as GET /auto-match-rules.
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM bank_accounts ORDER BY created_at ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const REQUIRED_FIELDS = ['label', 'account_holder', 'bank_name', 'iban', 'bic'];

router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  const { label, account_holder, bank_name, iban, bic, reference } = req.body;
  for (const field of REQUIRED_FIELDS) {
    if (!req.body[field] || !String(req.body[field]).trim()) {
      return res.status(400).json({ error: `${field.replace('_', ' ')} is required` });
    }
  }
  try {
    const result = await db.query(
      'INSERT INTO bank_accounts (label, account_holder, bank_name, iban, bic, reference) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [label.trim(), account_holder.trim(), bank_name.trim(), iban.trim(), bic.trim(), (reference || 'Donation').trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Modify — any subset of fields can be sent; only the provided ones change.
router.put('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const fields = ['label', 'account_holder', 'bank_name', 'iban', 'bic', 'reference'];
  const updates = [];
  const values = [];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) {
      if (!String(req.body[field]).trim()) {
        return; // skip blanking a field out — treated the same as "not provided"
      }
      updates.push(`${field} = $${updates.length + 1}`);
      values.push(String(req.body[field]).trim());
    }
  });
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  values.push(req.params.id);
  try {
    const result = await db.query(
      `UPDATE bank_accounts SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query('DELETE FROM bank_accounts WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
