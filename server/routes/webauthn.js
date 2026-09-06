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
// residentKey: 'required' makes this a discoverable credential — the
// authenticator itself stores the account's user handle (the `user.id`
// above) alongside the key, so a later login/options call with no
// identifier at all can still find it (see login/options' passwordless
// branch + login/verify's userHandle resolution below).
// requireResidentKey is the deprecated pre-Level-2 alias some older
// platform authenticators still look at instead of residentKey.
authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
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

// Settings > App preferences > Device — read-only Face ID/Fingerprint status
// (any device_label containing 'face' or 'fingerprint' on this account).
// There's no separate on/off state to read here beyond "has this account
// enrolled a credential of that kind at all" — enrolling/removing one still
// only happens from Edit Profile's own toggles (see EditHelperProfile.jsx /
// EditBeneficiaryProfile.jsx), this just reports the result for display.
router.get('/status', authenticate, async (req, res) => {
try {
const result = await db.query('SELECT device_label FROM webauthn_credentials WHERE user_id = $1', [req.user.id]);
const labels = result.rows.map(r => r.device_label || '');
res.json({
faceIdEnabled: labels.some(l => l.includes('face')),
fingerprintEnabled: labels.some(l => l.includes('fingerprint')),
});
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// --- Login (no account session yet) ----------------------------------------

// identifier is now optional — the Login page's Face ID/Fingerprint buttons
// no longer make the person type their email/phone first. With no
// identifier, this returns an empty allowCredentials list, which tells the
// browser to prompt for *any* discoverable/resident credential registered
// for this RP on the device (see register/options' residentKey: 'required')
// rather than one scoped to a known account — the account itself is only
// resolved afterwards, from the assertion's userHandle (see login/verify).
// identifier is still accepted for any future caller that already knows the
// account (e.g. a "use password instead" fallback), in which case behavior
// is unchanged from before.
router.post('/login/options', async (req, res) => {
const identifier = req.body?.identifier?.trim();
try {
if (identifier) {
const user = await findUserByIdentifier(identifier);
if (!user) return res.status(404).json({ error: 'Account not registered, please click on register at the bottom.' });

const credsResult = await db.query('SELECT credential_id FROM webauthn_credentials WHERE user_id = $1', [user.id]);
if (credsResult.rows.length === 0) {
return res.status(404).json({ error: 'No Face ID / Fingerprint set up for this account yet — sign in with your password first, then enable it from your profile.' });
}

const challenge = await storeChallenge(user.id, 'login');
return res.json({
challenge,
rpId: RP_ID,
allowCredentials: credsResult.rows.map(r => ({ type: 'public-key', id: r.credential_id })),
timeout: 60000,
userVerification: 'required',
userId: user.id,
});
}

// Passwordless branch — the challenge is stored keyed to itself (there's
// no account to key it to yet); login/verify below looks it up the same
// way regardless of which branch created it.
const challenge = crypto.randomBytes(32).toString('base64url');
const expires = new Date(Date.now() + CHALLENGE_TTL_MS);
await db.query('INSERT INTO webauthn_challenges (identifier, challenge, purpose, expires_at) VALUES ($1, $2, $3, $4)', [challenge, challenge, 'login', expires]);
res.json({ challenge, rpId: RP_ID, allowCredentials: [], timeout: 60000, userVerification: 'required' });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

router.post('/login/verify', async (req, res) => {
const { userId, rawId, response, userHandle } = req.body || {};
try {
if (!rawId || !response?.authenticatorData || !response?.clientDataJSON || !response?.signature) {
return res.status(400).json({ error: 'Malformed sign-in response' });
}

const clientDataJSON = Buffer.from(response.clientDataJSON, 'base64url');
let clientData;
try { clientData = JSON.parse(clientDataJSON.toString('utf8')); } catch { return res.status(400).json({ error: 'Malformed client data' }); }

// Looked up by the challenge's own value rather than by user id — the
// passwordless flow above doesn't know the user id yet, so it stored the
// challenge keyed to itself; the legacy identifier-first flow stores the
// same challenge value too, so this lookup covers both.
const challengeResult = await db.query(
"SELECT * FROM webauthn_challenges WHERE challenge = $1 AND purpose = 'login' AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
[clientData.challenge]
);
const challengeRow = challengeResult.rows[0];
if (!challengeRow) return res.status(400).json({ error: 'Sign-in request expired — please try again' });
await db.query('DELETE FROM webauthn_challenges WHERE id = $1', [challengeRow.id]);

checkClientData(clientDataJSON, 'webauthn.get', challengeRow.challenge);

// Resolve which account this credential belongs to: the legacy flow
// already knows (userId, from login/options); the passwordless flow only
// finds out now, from the resident credential's own user handle — the
// same opaque value set as `user.id` at registration (register/options).
let resolvedUserId = userId || null;
if (!resolvedUserId && userHandle) {
try { resolvedUserId = Buffer.from(userHandle, 'base64url').toString('utf8'); } catch { /* fall through to credential lookup below */ }
}

const credResult = resolvedUserId
? await db.query('SELECT * FROM webauthn_credentials WHERE credential_id = $1 AND user_id = $2', [rawId, resolvedUserId])
: await db.query('SELECT * FROM webauthn_credentials WHERE credential_id = $1', [rawId]);
const cred = credResult.rows[0];
if (!cred) return res.status(401).json({ error: 'Unrecognized credential' });
resolvedUserId = resolvedUserId || cred.user_id;

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

const userResult = await db.query('SELECT * FROM users WHERE id = $1', [resolvedUserId]);
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

// Settings > App preferences > Device / Edit Profile — removes every
// credential of one kind (face/fingerprint) from this account, called when
// that toggle is switched off. deviceLabel is a free-form '+'-joined string
// (see register/verify's deviceLabel), so this matches on substring rather
// than equality — a single physical enrollment covering both kinds (label
// "face+fingerprint") only has the requested kind stripped out of its label,
// and is only deleted outright once neither kind remains.
router.delete('/credentials/:type', authenticate, async (req, res) => {
const { type } = req.params;
if (!['face', 'fingerprint'].includes(type)) return res.status(400).json({ error: 'type must be face or fingerprint' });
try {
const result = await db.query('SELECT id, device_label FROM webauthn_credentials WHERE user_id = $1', [req.user.id]);
for (const row of result.rows) {
const labels = (row.device_label || '').split('+').filter(Boolean);
if (!labels.includes(type)) continue;
const remaining = labels.filter(l => l !== type);
if (remaining.length === 0) {
await db.query('DELETE FROM webauthn_credentials WHERE id = $1', [row.id]);
} else {
await db.query('UPDATE webauthn_credentials SET device_label = $1 WHERE id = $2', [remaining.join('+'), row.id]);
}
}
res.json({ success: true });
} catch (err) {
res.status(500).json({ error: err.message });
}
});

module.exports = router;
