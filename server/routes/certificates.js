const express = require('express');
const nodemailer = require('nodemailer');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { buildCertificatePdf } = require('../utils/pdf');
const { sendCertificateEmail } = require('../utils/email');
const router = express.Router();

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'zubinsarkar@gmail.com';

// Request a Certificate of Service for a period (My Contribution > Request
// Certificate) — records the request and emails a REMAR admin, rather than
// self-issuing a PDF instantly. An admin reviews and issues it from there
// (see buildCertificatePdf below, still used for the actual PDF once that
// happens).
router.post('/request', authenticate, requireRole('helper'), async (req, res) => {
  const { period_type, period_value, period_label } = req.body;
  if (!['lifetime', 'year', 'month'].includes(period_type) || !period_label) {
    return res.status(400).json({ error: 'A valid period is required' });
  }
  try {
    const request = await db.query(
      `INSERT INTO certificate_requests (user_id, period_type, period_value, period_label)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, period_type, period_value || null, period_label]
    );

    if (process.env.EMAIL_USER) {
      try {
        const volResult = await db.query('SELECT name, member_number FROM helpers WHERE user_id = $1', [req.user.id]);
        const volunteer = volResult.rows[0];
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: SUPPORT_EMAIL,
          replyTo: req.user.email,
          subject: `REMAR Schweiz: Certificate request (${period_label})`,
          text: `${volunteer?.name || req.user.email} (${volunteer?.member_number || '—'}) requested a Certificate of Service for: ${period_label}\n\nRequest ID: ${request.rows[0].id}`,
        });
      } catch (mailErr) {
        // The request is already recorded either way.
        console.error('Certificate request email send failed:', mailErr.message);
      }
    }

    res.json({ success: true, request: request.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Past certificate requests for the current user (shown under Request
// Certificate on My Contribution).
router.get('/requests/mine', authenticate, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM certificate_requests WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All certificate requests across every helper (admin only) — shown on the
// Admin Home > Contribution certificate service page.
router.get('/requests', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT cr.*, v.name AS helper_name, v.member_number
       FROM certificate_requests cr
       LEFT JOIN helpers v ON v.user_id = cr.user_id
       ORDER BY cr.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Issue a certificate for a pending request (admin only) — pulls every
// completed help item for that helper (the request itself doesn't store
// which specific items to include, just the period it covers), generates
// the same PDF the helper could self-issue from My Contribution, and emails
// it straight to that helper (rather than downloading it to the admin's own
// browser, which is what this used to do) — see sendCertificateEmail. The
// request is only marked 'issued' once the email actually goes out; if
// EMAIL_USER/EMAIL_PASS aren't configured, or the send itself fails, the
// request stays 'pending' so admin can see it wasn't really delivered and
// try again.
router.post('/requests/:id/issue', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const reqResult = await db.query('SELECT * FROM certificate_requests WHERE id = $1', [req.params.id]);
    const request = reqResult.rows[0];
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const volResult = await db.query(
      `SELECT v.id, v.name, v.member_number, u.email
       FROM helpers v JOIN users u ON u.id = v.user_id
       WHERE v.user_id = $1`,
      [request.user_id]
    );
    const volunteer = volResult.rows[0];
    if (!volunteer) return res.status(404).json({ error: 'Helper profile not found' });
    if (!volunteer.email) return res.status(400).json({ error: 'This helper has no email on file to send the certificate to' });

    const helpsResult = await db.query(
      `SELECT h.id, h.title, h.scheduled_date, h.duration_hours
       FROM assignments a JOIN helps h ON a.help_row_id = h.id
       WHERE a.volunteer_id = $1 AND a.status = 'completed'
       ORDER BY h.scheduled_date DESC`,
      [volunteer.id]
    );
    if (helpsResult.rows.length === 0) {
      return res.status(400).json({ error: 'This helper has no completed help items to certify yet' });
    }

    const pdfBuffer = buildCertificatePdf({
      helperName: volunteer.name,
      memberNumber: volunteer.member_number || '—',
      issuedDate: new Date().toLocaleDateString(),
      helps: helpsResult.rows,
    });
    const filename = `REMAR-Certificate-${(volunteer.member_number || 'helper')}.pdf`;

    const emailed = await sendCertificateEmail(volunteer.email, volunteer.name || 'there', pdfBuffer, filename);
    if (!emailed) {
      return res.status(500).json({ error: 'Could not email the certificate — check the server\'s email configuration and try again' });
    }

    await db.query(`UPDATE certificate_requests SET status = 'issued', resolved_at = NOW() WHERE id = $1`, [req.params.id]);

    res.json({ success: true, emailedTo: volunteer.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Whether there's a certificate request the current admin hasn't seen yet —
// powers the light-green "new" highlight on Admin Home > Services >
// Certificate. Same pattern as donations.js's /unseen and support.js's
// /tickets/unseen: compares the newest request's created_at against this
// admin's own certificates_seen_at (see users table migration in db.js).
router.get('/unseen', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const seen = await db.query('SELECT certificates_seen_at FROM users WHERE id = $1', [req.user.id]);
    const latest = await db.query('SELECT MAX(created_at) AS latest FROM certificate_requests');
    const latestAt = latest.rows[0]?.latest;
    const seenAt = seen.rows[0]?.certificates_seen_at;
    const hasNew = !!latestAt && (!seenAt || new Date(latestAt) > new Date(seenAt));
    res.json({ hasNew });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Called when the admin opens the Certificates page — clears the "new" flag
// above for them (other admins, if any, keep seeing it until they do too).
router.post('/mark-seen', authenticate, requireRole('admin'), async (req, res) => {
  try {
    await db.query('UPDATE users SET certificates_seen_at = NOW() WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reject a pending request (admin only) — e.g. the period has nothing to certify.
router.put('/requests/:id/reject', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE certificate_requests SET status = 'rejected', resolved_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Request not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Issue a Certificate of Service PDF for one or more of the current
// helper's completed (delivered) help items. Helper-only, and only
// assignments that (a) belong to this helper and (b) are actually marked
// completed can be certified — no self-issuing a certificate for an
// unfinished help item.
router.post('/generate', authenticate, requireRole('helper'), async (req, res) => {
  const { assignment_ids } = req.body;
  if (!Array.isArray(assignment_ids) || assignment_ids.length === 0) {
    return res.status(400).json({ error: 'Select at least one completed help item to certify' });
  }
  try {
    const volResult = await db.query('SELECT id, name, member_number FROM helpers WHERE user_id = $1', [req.user.id]);
    const volunteer = volResult.rows[0];
    if (!volunteer) return res.status(404).json({ error: 'Helper profile not found' });

    const helpsResult = await db.query(
      `SELECT h.id, h.title, h.scheduled_date, h.duration_hours
       FROM assignments a JOIN helps h ON a.help_row_id = h.id
       WHERE a.id = ANY($1::uuid[]) AND a.volunteer_id = $2 AND a.status = 'completed'`,
      [assignment_ids, volunteer.id]
    );
    if (helpsResult.rows.length === 0) {
      return res.status(400).json({ error: 'No completed help items found for that selection' });
    }

    const pdfBuffer = buildCertificatePdf({
      helperName: volunteer.name,
      memberNumber: volunteer.member_number || '—',
      issuedDate: new Date().toLocaleDateString(),
      helps: helpsResult.rows,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="REMAR-Certificate-${(volunteer.member_number || 'helper')}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
