const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { sendOtpEmail } = require('../utils/email');
const { sendOtpSms } = require('../utils/sms');
const router = express.Router();

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits, no leading zero
}

// Keep only the digits and a leading '+', matching routes/auth.js — lets a
// phone number typed here match however it was normalized at registration.
function normalizePhone(value) {
  if (!value) return null;
  const digits = value.replace(/[^\d+]/g, '');
  return digits || null;
}

// This endpoint is only ever reached from the registration flow
// (RegisterVerify.jsx), so an existing account for this identifier means
// the person is trying to register again with an email/phone that's
// already taken — surface that immediately instead of sending them a code
// for an account they can't create.
async function isAlreadyRegistered(identifier, method) {
  const result = method === 'email'
    ? await db.query('SELECT id FROM users WHERE email = $1', [identifier])
    : await db.query('SELECT id FROM users WHERE phone = $1', [normalizePhone(identifier)]);
  return result.rows.length > 0;
}

// Send (or resend) a 6-digit OTP to an email address or phone number.
router.post('/send', async (req, res) => {
  const { identifier, method } = req.body;
  if (!identifier || !['email', 'phone'].includes(method)) {
    return res.status(400).json({ error: 'A valid identifier and method (email or phone) are required' });
  }

  try {
    if (await isAlreadyRegistered(identifier.trim(), method)) {
      return res.status(409).json({
        error: `This ${method === 'email' ? 'email address' : 'phone number'} is already in use`,
        alreadyRegistered: true,
      });
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Invalidate any still-pending codes for this identifier/method before issuing a new one.
    await db.query('DELETE FROM otp_codes WHERE identifier = $1 AND method = $2 AND verified = FALSE', [identifier, method]);
    await db.query(
      'INSERT INTO otp_codes (identifier, method, code_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [identifier, method, codeHash, expiresAt]
    );

    if (method === 'email') {
      sendOtpEmail(identifier, code).catch(err => console.error('OTP email error:', err.message));
    } else {
      sendOtpSms(identifier, code).catch(err => console.error('OTP SMS error:', err.message));
    }

    res.json({ message: 'Verification code sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shared by POST /verify below and routes/auth.js's Delete-account OTP step
// (server/routes/auth.js), so both check/consume a pending code the exact
// same way instead of two copies of this logic drifting apart. Returns
// { ok: true } on success, or { ok: false, status, body } shaped ready to
// hand straight to res.status(status).json(body) at the call site.
async function checkAndConsumeOtp(identifier, method, otp) {
  const result = await db.query(
    `SELECT * FROM otp_codes WHERE identifier = $1 AND method = $2 AND verified = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [identifier, method]
  );
  const record = result.rows[0];
  if (!record) return { ok: false, status: 400, body: { error: 'No pending verification code — please request a new one', expired: true } };

  if (new Date(record.expires_at) < new Date()) {
    await db.query('DELETE FROM otp_codes WHERE id = $1', [record.id]);
    return { ok: false, status: 400, body: { error: 'This code has expired — please request a new one', expired: true } };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await db.query('DELETE FROM otp_codes WHERE id = $1', [record.id]);
    return { ok: false, status: 400, body: { error: 'Too many incorrect attempts — please request a new code', expired: true } };
  }

  const valid = await bcrypt.compare(String(otp), record.code_hash);
  if (!valid) {
    await db.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [record.id]);
    return { ok: false, status: 400, body: { error: 'Incorrect code — please try again', verified: false } };
  }

  await db.query('UPDATE otp_codes SET verified = TRUE WHERE id = $1', [record.id]);
  return { ok: true };
}

// Verify a submitted OTP against the most recent pending code for that identifier/method.
router.post('/verify', async (req, res) => {
  const { identifier, method, otp } = req.body;
  if (!identifier || !method || !otp) {
    return res.status(400).json({ error: 'identifier, method and otp are required' });
  }

  try {
    const result = await checkAndConsumeOtp(identifier, method, otp);
    if (!result.ok) return res.status(result.status).json(result.body);
    res.json({ verified: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.generateCode = generateCode;
module.exports.checkAndConsumeOtp = checkAndConsumeOtp;
