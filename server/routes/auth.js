const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const https = require('https');
const db = require('../database/db');
const { sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail, sendAccountDeletionOtpEmail } = require('../utils/email');
const { sendOtpSms } = require('../utils/sms');
const { generateCode, checkAndConsumeOtp } = require('./otp');
const { authenticate } = require('../middleware/auth');
const { deleteAccount } = require('../utils/accountDeletion');
const router = express.Router();

// Fixed list shown on Settings > My account > Delete account's reason
// dropdown — kept server-side too so /delete-account/confirm can reject a
// request that didn't send one of these (not enforced too strictly: 'Other'
// covers anything not listed).
const DELETE_REASONS = [
'No longer need the app',
'Privacy concerns',
'Found help elsewhere',
'Too many notifications',
'Difficult to use',
'Other',
];

// Standard password rule used at Change Password: at least one letter and
// one number (length is separately enforced by minLength on the inputs).
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).+$/;

// Keep only the digits and a leading '+' so phone numbers entered with
// varying spacing/dashes still compare equal to what was stored at
// registration (e.g. "+41 79 123 45 67" and "+41791234567" match).
function normalizePhone(value) {
if (!value) return null;
const digits = value.replace(/[^\d+]/g, '');
return digits || null;
}

// Verifies a Google Identity Services ID token by asking Google's own
// tokeninfo endpoint (Google checks the signature, audience and expiry for
// us) — avoids adding a new npm dependency just for local JWT verification.
// Returns the decoded payload (email, email_verified, aud, ...) on success.
function verifyGoogleToken(idToken) {
return new Promise((resolve, reject) => {
https.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, (resp) => {
let data = '';
resp.on('data', chunk => { data += chunk; });
resp.on('end', () => {
let parsed;
try { parsed = JSON.parse(data); } catch (err) { return reject(new Error('Invalid response from Google')); }
if (resp.statusCode !== 200) return reject(new Error(parsed.error_description || 'Invalid or expired Google sign-in'));
resolve(parsed);
});
}).on('error', reject);
});
}

// Register
router.post('/register', async (req, res) => {
const { email, phone, password, role } = req.body;
const normalizedPhone = normalizePhone(phone);
try {
const hash = await bcrypt.hash(password, 10);
// By this point the person has already proven ownership of this email/phone
// via the OTP step on Verify-to-register (RegisterVerify.jsx + routes/otp.js)
// before ever reaching this route, so there's nothing left to verify here —
// the account is created already verified, no separate email-link step.
const result = await db.query(
'INSERT INTO users (email, phone, password_hash, role, is_verified) VALUES ($1, $2, $3, $4, TRUE) RETURNING id, email, phone, role',
[email, normalizedPhone, hash, role]
);
const user = result.rows[0];
const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Thank-you email only — not a verification step (non-blocking)
sendWelcomeEmail(email).catch(err => console.error('Email error:', err.message));

res.json({ token, user });
} catch (err) {
if (err.code === '23505') {
if (err.constraint === 'users_phone_unique') return res.status(400).json({ error: 'Phone number already registered' });
return res.status(400).json({ error: 'Email already exists' });
}
res.status(500).json({ error: err.message });
}
});

// Verify email
router.get('/verify-email/:token', async (req, res) => {
try {
const result = await db.query(
'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE verification_token = $1 RETURNING id',
[req.params.token]
);
if (result.rowCount === 0) return res.status(400).json({ error: 'Invalid or expired verification link' });
res.json({ message: 'Email verified successfully' });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
const { email } = req.body;
try {
const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
const user = result.rows[0];
if (!user) return res.status(404).json({ error: 'Email not found' });
if (user.is_verified) return res.status(400).json({ error: 'Email already verified' });

const token = crypto.randomBytes(32).toString('hex');
await db.query('UPDATE users SET verification_token = $1 WHERE id = $2', [token, user.id]);
sendVerificationEmail(email, token).catch(err => console.error('Email error:', err.message));
res.json({ message: 'Verification email sent' });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Login — the "email" field doubles as a generic identifier: it matches
// against the stored email exactly, or against the stored phone once both
// sides are normalized to digits-only, so either one logs in with the same
// password.
router.post('/login', async (req, res) => {
const { email, password } = req.body;
try {
const result = await db.query('SELECT * FROM users WHERE email = $1 OR phone = $2', [email, normalizePhone(email)]);
const user = result.rows[0];
if (!user) return res.status(400).json({ error: 'Invalid credentials' });

const valid = await bcrypt.compare(password, user.password_hash);
if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

if (!user.is_verified) return res.status(403).json({ error: 'Please verify your email before logging in', unverified: true });

const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Google Sign-In — this is "sign in" only, not "sign up": the ID token from
// Google Identity Services proves who the person is, and we log them into
// their existing REMAR account if the Google email matches one. If it
// doesn't match any account, they need to register first (role + full
// profile can't be inferred from a Google login).
router.post('/google', async (req, res) => {
const { credential } = req.body;
if (!credential) return res.status(400).json({ error: 'Missing Google credential' });
try {
const payload = await verifyGoogleToken(credential);

if (!process.env.GOOGLE_CLIENT_ID) {
return res.status(500).json({ error: 'Google sign-in is not configured on this server' });
}
// Google issues a different OAuth *client* per platform (Web, iOS,
// Android), and an ID token's "aud" claim is always the client ID that
// requested it — so a token from the native iOS app (GIDClientID in
// client/ios/App/App/Info.plist) never matches the web GOOGLE_CLIENT_ID
// this used to check exclusively, and got rejected here with this exact
// "Invalid Google sign-in" error even though the token was perfectly
// valid. Accept any of our own registered client IDs as a valid audience
// instead of just the web one.
// .trim() guards against a trailing newline/space sneaking in from
// copy-pasting these into Render's env var UI, which would otherwise make
// an exact-match comparison silently fail even though the values "look"
// identical when eyeballed.
const allowedAudiences = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_IOS_CLIENT_ID, process.env.GOOGLE_ANDROID_CLIENT_ID]
.filter(Boolean)
.map(id => id.trim());
if (!allowedAudiences.includes(payload.aud)) {
// Logged (not returned to the client, to avoid leaking client IDs) so
// this is diagnosable from Render's Logs tab instead of guessing blind
// next time this fires.
console.error('[google-signin] aud mismatch:', { received: payload.aud, allowed: allowedAudiences });
return res.status(401).json({ error: 'Invalid Google sign-in' });
}
if (payload.email_verified !== 'true' && payload.email_verified !== true) {
return res.status(401).json({ error: 'Google account email is not verified' });
}

const result = await db.query('SELECT * FROM users WHERE email = $1', [payload.email]);
const user = result.rows[0];
if (!user) {
return res.status(404).json({ error: 'Account not registered, please click on register at the bottom.', notFound: true });
}

// Google has already proven this email belongs to them — no reason to
// keep gating login behind our own separate email-verification step.
if (!user.is_verified) {
await db.query('UPDATE users SET is_verified = TRUE WHERE id = $1', [user.id]);
}

const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
} catch (err) {
res.status(401).json({ error: err.message || 'Google sign-in failed' });
}
});

// Simple HTTPS GET-and-parse-JSON helper, reused by the Facebook checks
// below (kept separate from verifyGoogleToken since the error-shape and
// status handling differ slightly between Google's and Facebook's APIs).
function httpsGetJson(url) {
return new Promise((resolve, reject) => {
https.get(url, (resp) => {
let data = '';
resp.on('data', chunk => { data += chunk; });
resp.on('end', () => {
let parsed;
try { parsed = JSON.parse(data); } catch (err) { return reject(new Error('Invalid response')); }
if (resp.statusCode !== 200 || parsed.error) return reject(new Error(parsed.error?.message || 'Request failed'));
resolve(parsed);
});
}).on('error', reject);
});
}

// Facebook Login — same "sign in only" shape as Google: the access token
// proves who the person is on Facebook's side, and we log them into their
// existing REMAR account if the Facebook email matches one.
router.post('/facebook', async (req, res) => {
// .trim() guards against a stray trailing newline/space in the token or in
// the Render-dashboard env vars (sync: false, so these are hand-pasted) —
// that's enough by itself to make Facebook's debug_token endpoint reject
// the request with "Cannot parse access token".
const accessToken = (req.body.accessToken || '').trim();
if (!accessToken) return res.status(400).json({ error: 'Missing Facebook access token' });
const fbAppId = (process.env.FACEBOOK_APP_ID || '').trim();
const fbAppSecret = (process.env.FACEBOOK_APP_SECRET || '').trim();
if (!fbAppId || !fbAppSecret) {
return res.status(500).json({ error: 'Facebook sign-in is not configured on this server' });
}
try {
// Confirm the token was actually issued for our app (not lifted from a
// different site) before trusting anything it says about the user.
const debug = await httpsGetJson(
`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(fbAppId + '|' + fbAppSecret)}`
);
console.log('[facebook-debug-token]', JSON.stringify(debug.data), 'expected app_id:', fbAppId, 'token len:', accessToken.length, 'token prefix:', accessToken.slice(0, 6));
if (!debug.data?.is_valid || debug.data.app_id !== fbAppId) {
return res.status(401).json({ error: 'Invalid Facebook sign-in' });
}

const profile = await httpsGetJson(
`https://graph.facebook.com/me?fields=id,email,name&access_token=${encodeURIComponent(accessToken)}`
);
if (!profile.email) {
return res.status(400).json({ error: 'Your Facebook account has no email address available to sign in with' });
}

const result = await db.query('SELECT * FROM users WHERE email = $1', [profile.email]);
const user = result.rows[0];
if (!user) {
return res.status(404).json({ error: 'Account not registered, please click on register at the bottom.', notFound: true });
}

if (!user.is_verified) {
await db.query('UPDATE users SET is_verified = TRUE WHERE id = $1', [user.id]);
}

const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
} catch (err) {
res.status(401).json({ error: err.message || 'Facebook sign-in failed' });
}
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
const { email } = req.body;
try {
const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
const user = result.rows[0];
// Always respond with success to avoid exposing whether email exists
if (!user) return res.json({ message: 'If that email is registered, a reset link has been sent' });

const token = crypto.randomBytes(32).toString('hex');
const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
await db.query('UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3', [token, expires, user.id]);
sendPasswordResetEmail(email, token).catch(err => console.error('Email error:', err.message));
res.json({ message: 'If that email is registered, a reset link has been sent' });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Reset password
router.post('/reset-password/:token', async (req, res) => {
const { password } = req.body;
try {
const result = await db.query(
'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
[req.params.token]
);
const user = result.rows[0];
if (!user) return res.status(400).json({ error: 'Invalid or expired reset link' });

const hash = await bcrypt.hash(password, 10);
await db.query(
'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
[hash, user.id]
);
res.json({ message: 'Password reset successfully' });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Admin's own display info for the Admin Home page's Account section — name
// is always literally "Admin" (not a personal name, admin accounts are
// shared org logins), and the ID is "Admin N" based on this account's
// position among all admin accounts ordered by creation (there are only
// ever 2-3 of these, seeded directly in db.js, never via registration).
router.get('/admin-info', authenticate, async (req, res) => {
if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
try {
const result = await db.query("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC");
const index = result.rows.findIndex(r => r.id === req.user.id);
res.json({ email: req.user.email, adminNumber: index >= 0 ? index + 1 : 1 });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Change password (Settings > Account, while already logged in) — distinct
// from Forgot/Reset password above, which is for someone who's locked out.
// Requires the current password to be re-entered rather than a reset token.
router.put('/change-password', authenticate, async (req, res) => {
const { currentPassword, newPassword } = req.body;
if (!currentPassword || !newPassword) {
return res.status(400).json({ error: 'Current and new password are required' });
}
if (newPassword.length < 8 || !PASSWORD_RULE.test(newPassword)) {
return res.status(400).json({ error: 'New password must be at least 8 characters and include at least 1 letter and 1 number' });
}
try {
const result = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
const user = result.rows[0];
if (!user) return res.status(404).json({ error: 'Account not found' });

const valid = await bcrypt.compare(currentPassword, user.password_hash);
if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

const hash = await bcrypt.hash(newPassword, 10);
await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
res.json({ message: 'Password changed successfully' });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Lets Settings > My account > Delete account's OTP-method step know
// whether to offer a Phone tab at all, without ever handing the client the
// account's actual email/phone value — DeleteAccount.jsx only needs the
// masked display strings.
function maskEmail(email) {
return email ? email.replace(/^(.{2}).*(@.*)$/, '$1***$2') : null;
}
function maskPhone(phone) {
return phone ? phone.replace(/.(?=.{2})/g, '•') : null;
}

router.get('/delete-account/methods', authenticate, async (req, res) => {
try {
const result = await db.query('SELECT email, phone FROM users WHERE id = $1', [req.user.id]);
const account = result.rows[0];
if (!account) return res.status(404).json({ error: 'Account not found' });
res.json({ maskedEmail: maskEmail(account.email), maskedPhone: maskPhone(account.phone) });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Settings > My account > Delete account, step 1 of 2 — send a fresh OTP to
// the account's own email or phone. Deliberately bypasses routes/otp.js's
// POST /send (that one refuses to send if the identifier is already
// registered — exactly backwards here, since this identifier belongs to
// the account we're about to delete). The identifier itself is always
// looked up from the authenticated session's own row, never taken from the
// request body, so this can't be used to spam an OTP to someone else's
// email/phone.
router.post('/delete-account/send-otp', authenticate, async (req, res) => {
const { method } = req.body;
if (!['email', 'phone'].includes(method)) {
return res.status(400).json({ error: 'method must be "email" or "phone"' });
}
try {
const result = await db.query('SELECT email, phone FROM users WHERE id = $1', [req.user.id]);
const account = result.rows[0];
if (!account) return res.status(404).json({ error: 'Account not found' });

const identifier = method === 'email' ? account.email : account.phone;
if (!identifier) {
return res.status(400).json({ error: 'No phone number is on file for this account — use email instead' });
}

const code = generateCode();
const codeHash = await bcrypt.hash(code, 10);
const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

await db.query('DELETE FROM otp_codes WHERE identifier = $1 AND method = $2 AND verified = FALSE', [identifier, method]);
await db.query(
'INSERT INTO otp_codes (identifier, method, code_hash, expires_at) VALUES ($1, $2, $3, $4)',
[identifier, method, codeHash, expiresAt]
);

if (method === 'email') {
sendAccountDeletionOtpEmail(identifier, code).catch(err => console.error('Delete-account OTP email error:', err.message));
} else {
sendOtpSms(identifier, code).catch(err => console.error('Delete-account OTP SMS error:', err.message));
}

// Masked so the client can say "sent to y***@..." without ever needing to
// know the full value itself.
const masked = method === 'email' ? maskEmail(identifier) : maskPhone(identifier);
res.json({ message: 'Verification code sent', maskedIdentifier: masked });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Settings > My account > Delete account, step 2 of 2 — verify the OTP,
// record why (Settings > Delete account's reason dropdown), then actually
// delete the account via deleteAccount() (see accountDeletion.js): own help
// items are removed, pending requests on others' items are cancelled
// instead of vanishing, and the helper/beneficiary profile survives
// anonymized as "Deleted account" so other people's completed-match/chat
// history keeps working — the frontend logs the user out and redirects to
// Login itself, once it's shown its own 5-second confirmation.
router.post('/delete-account/confirm', authenticate, async (req, res) => {
const { method, otp, reason } = req.body;
if (!['email', 'phone'].includes(method) || !otp) {
return res.status(400).json({ error: 'method and otp are required' });
}
try {
const result = await db.query('SELECT email, phone, role FROM users WHERE id = $1', [req.user.id]);
const account = result.rows[0];
if (!account) return res.status(404).json({ error: 'Account not found' });

const identifier = method === 'email' ? account.email : account.phone;
if (!identifier) return res.status(400).json({ error: 'No phone number is on file for this account — use email instead' });

const check = await checkAndConsumeOtp(identifier, method, otp);
if (!check.ok) return res.status(check.status).json(check.body);

const cleanReason = (reason && DELETE_REASONS.includes(reason)) ? reason : (reason || 'Other');
await db.query('INSERT INTO account_deletion_feedback (role, reason) VALUES ($1, $2)', [account.role, cleanReason]);

await deleteAccount(req.user.id);
res.json({ deleted: true });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

module.exports = router;
