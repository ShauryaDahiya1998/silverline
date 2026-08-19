const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { parseAttestationObject, verifyAssertionSignature } = require('../utils/webauthn');
const router = express.Router();

const RP_NAME = 'REMAR Schweiz';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

// Keep only the digits and a leading '+', matching routes/auth.js — lets a
// phone number typed at login find the account it was registered under.
function normalizePhone(value) {
if (!value) return null;
const digits = value.replace(/[^\d+]/g, '');
return digits || null;
}

async function findUserByIdentifier(identifier) {
const result = await db.query('SELECT * FROM users WHERE email = $1 OR phone = $2', [identifier, normalizePhone(identifier)]);
return result.rows[0] || null;
}

async function storeChallenge(identifier, purpose) {
const challenge = crypto.randomBytes(32).toString('base64url');
const expires = new Date(Date.now() + CHALLENGE_TTL_MS);
await db.query('DELETE FROM webauthn_challenges WHERE identifier = $1 AND purpose = $2', [identifier, purpose]);
await db.query('INSERT INTO webauthn_challenges (identifier, challenge, purpose, expires_at) VALUES ($1, $2, $3, $4)', [identifier, challenge, purpose, expires]);
return challenge;
}

async function consumeChallenge(identifier, purpose) {
const result = await db.query(
'SELECT * FROM webauthn_challenges WHERE identifier = $1 AND purpose = $2 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
[identifier, purpose]
);
const row = result.rows[0];
if (!row) return null;
await db.query('DELETE FROM webauthn_challenges WHERE id = $1', [row.id]);
return row.challenge;
}

function checkClientData(clientDataJSON, expectedType, expectedChallenge) {
let clientData;
try { clientData = JSON.parse(clientDataJSON.toString('utf8')); } catch { throw new Error('Malformed client data'); }
if (clientData.type !== expectedType) throw new Error('Unexpected WebAuthn ceremony type');
if (clientData.challenge !== expectedChallenge) throw new Error('Challenge mismatch — this request may be stale, try again');
if (clientData.origin !== ORIGIN) throw new Error('Origin mismatch');
}

// --- Registration (enrolling a device to an already-signed-in account) -----

// Called right after a helper/beneficiary account is created (or later from
// a profile settings page), while already authenticated.
router.post('/register/options', authenticate, async (req, res) => {
try {
const challenge = await storeChallenge(req.user.id, 'register');
res.json({
challenge,
rp: { name: RP_NAME, id: RP_ID },
user: { id: Buffer.from(req.user.id, 'utf8').toString('base64url'), name: req.user.email, displayName: req.user.email },
pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256 only
authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
timeout: 60000,
attestation: 'none',
});
} catch (err) {
res.status(500).json({ error: err.message });
}
});

router.post('/register/verify', authenticate, async (req, res) => {
const { rawId, response, deviceLabel } = req.body || {};
try {
if (!rawId || !response?.attestationObject || !response?.clientDataJSON) {
return res.status(400).json({ error: 'Malformed registration response' });
}
const expectedChallenge = await consumeChallenge(req.user.id, 'register');
if (!expectedChallenge) return res.status(400).json({ error: 'Registration request expired — please try again' });

const clientDataJSON = Buffer.from(response.clientDataJSON, 'base64url');
checkClientData(clientDataJSON, 'webauthn.create', expectedChallenge);

const attestationObject = Buffer.from(response.attestationObject, 'base64url');
const { authData } = parseAttestationObject(attestationObject);
if (!authData.publicKeyJwk || !authData.credentialId) {
return res.status(400).json({ error: 'No credential public key in attestation' });
}

await db.query(
'INSERT INTO webauthn_credentials (user_id, credential_id, public_key_jwk, sign_count, device_label) VALUES ($1, $2, $3, $4, $5)',
[req.user.id, rawId, JSON.stringify(authData.publicKeyJwk), authData.signCount, deviceLabel || null]
);
res.status(201).json({ success: true });
} catch (err) {
res.status(400).json({ error: err.message || 'Registration failed' });
}
});

// --- Login (no account session yet — identified by email/phone) -----------

router.post('/login/options', async (req, res) => {
const { identifier } = req.body || {};
if (!identifier?.trim()) return res.status(400).json({ error: 'Enter your email or phone number first' });
try {
const user = await findUserByIdentifier(identifier.trim());
if (!user) return res.status(404).json({ error: 'Account not registered, please click on register at the bottom.' });

const credsResult = await db.query('SELECT credential_id FROM webauthn_credentials WHERE user_id = $1', [user.id]);
if (credsResult.rows.length === 0) {
return res.status(404).json({ error: 'No Face ID / Fingerprint set up for this account yet — sign in with your password first, then enable it from your profile.' });
}

const challenge = await storeChallenge(user.id, 'login');
res.json({
challenge,
rpId: RP_ID,
allowCredentials: credsResult.rows.map(r => ({ type: 'public-key', id: r.credential_id })),
timeout: 60000,
userVerification: 'required',
userId: user.id,
});
} catch (err) {
res.status(500).json({ error: err.message });
}
});

router.post('/login/verify', async (req, res) => {
const { userId, rawId, response } = req.body || {};
try {
if (!userId || !rawId || !response?.authenticatorData || !response?.clientDataJSON || !response?.signature) {
return res.status(400).json({ error: 'Malformed sign-in response' });
}
const expectedChallenge = await consumeChallenge(userId, 'login');
if (!expectedChallenge) return res.status(400).json({ error: 'Sign-in request expired — please try again' });

const clientDataJSON = Buffer.from(response.clientDataJSON, 'base64url');
checkClientData(clientDataJSON, 'webauthn.get', expectedChallenge);

const credResult = await db.query('SELECT * FROM webauthn_credentials WHERE credential_id = $1 AND user_id = $2', [rawId, userId]);
const cred = credResult.rows[0];
if (!cred) return res.status(401).json({ error: 'Unrecognized credential' });

const authenticatorData = Buffer.from(response.authenticatorData, 'base64url');
const signature = Buffer.from(response.signature, 'base64url');
const valid = verifyAssertionSignature({
publicKeyJwk: cred.public_key_jwk,
authenticatorData,
clientDataJSON,
signature,
});
if (!valid) return res.status(401).json({ error: 'Signature verification failed' });

// Basic replay protection: a nonzero counter must strictly increase.
// Authenticators that never implement a counter report 0 every time,
// which is valid per spec and shouldn't be treated as a replay.
const newCount = authenticatorData.readUInt32BE(33);
if ((cred.sign_count !== 0 || newCount !== 0) && newCount <= cred.sign_count) {
return res.status(401).json({ error: 'This credential may have been cloned — sign count did not increase' });
}
await db.query('UPDATE webauthn_credentials SET sign_count = $1 WHERE id = $2', [newCount, cred.id]);

const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
const user = userResult.rows[0];
if (!user) return res.status(404).json({ error: 'Account no longer exists' });
if (!user.is_verified) {
await db.query('UPDATE users SET is_verified = TRUE WHERE id = $1', [user.id]);
}

const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
} catch (err) {
res.status(401).json({ error: err.message || 'Sign-in failed' });
}
});

module.exports = router;
