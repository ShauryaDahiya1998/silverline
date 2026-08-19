// Hand-rolled WebAuthn helpers — no npm package (registry access is
// unavailable in this environment), so this decodes just the subset of CBOR
// that a "none"-attestation platform authenticator (Face ID / Touch ID /
// Android biometric / Windows Hello) actually produces, and verifies
// signatures with Node's built-in crypto module. Scope: ES256 (ECDSA P-256)
// credentials only, which is what every mainstream platform authenticator
// defaults to and is required to support.
const crypto = require('crypto');

// ---- Minimal CBOR decoder -------------------------------------------------
// Handles the major types WebAuthn's "none" attestation format and COSE keys
// use: 0 (uint), 1 (negative int), 2 (byte string), 3 (text string),
// 4 (array), 5 (map). That's the complete set needed here.
function decodeCbor(buf, offset = 0) {
const first = buf[offset];
const majorType = first >> 5;
const info = first & 0x1f;
offset += 1;

let length;
if (info < 24) {
length = info;
} else if (info === 24) {
length = buf.readUInt8(offset); offset += 1;
} else if (info === 25) {
length = buf.readUInt16BE(offset); offset += 2;
} else if (info === 26) {
length = buf.readUInt32BE(offset); offset += 4;
} else if (info === 27) {
length = Number(buf.readBigUInt64BE(offset)); offset += 8;
} else {
throw new Error(`Unsupported CBOR length encoding (info=${info})`);
}

switch (majorType) {
case 0: // unsigned int
return { value: length, offset };
case 1: // negative int
return { value: -1 - length, offset };
case 2: { // byte string
const value = buf.subarray(offset, offset + length);
return { value, offset: offset + length };
}
case 3: { // text string
const value = buf.toString('utf8', offset, offset + length);
return { value, offset: offset + length };
}
case 4: { // array
const arr = [];
for (let i = 0; i < length; i++) {
const item = decodeCbor(buf, offset);
arr.push(item.value);
offset = item.offset;
}
return { value: arr, offset };
}
case 5: { // map
const map = new Map();
for (let i = 0; i < length; i++) {
const key = decodeCbor(buf, offset);
offset = key.offset;
const val = decodeCbor(buf, offset);
offset = val.offset;
map.set(key.value, val.value);
}
return { value: map, offset };
}
default:
throw new Error(`Unsupported CBOR major type ${majorType}`);
}
}

// ---- WebAuthn structure parsing -------------------------------------------

// authenticatorData layout (fixed 37-byte header + variable attested data):
//   rpIdHash(32) | flags(1) | signCount(4) | [attestedCredentialData]
function parseAuthenticatorData(authData) {
const rpIdHash = authData.subarray(0, 32);
const flags = authData[32];
const signCount = authData.readUInt32BE(33);
let offset = 37;

const attestedCredentialDataIncluded = !!(flags & 0x40);
let credentialId = null;
let publicKeyJwk = null;

if (attestedCredentialDataIncluded) {
offset += 16; // aaguid
const credIdLen = authData.readUInt16BE(offset); offset += 2;
credentialId = authData.subarray(offset, offset + credIdLen); offset += credIdLen;

const decoded = decodeCbor(authData, offset);
const coseKey = decoded.value; // Map of COSE key parameters
offset = decoded.offset;

publicKeyJwk = coseKeyToJwk(coseKey);
}

return { rpIdHash, flags, signCount, credentialId, publicKeyJwk, bytesConsumed: offset };
}

// Converts a COSE EC2 key (the format platform authenticators use for
// ES256/P-256) into a JWK that Node's crypto.createPublicKey understands.
// COSE key map keys: 1=kty, 3=alg, -1=crv, -2=x, -3=y (all integers).
function coseKeyToJwk(coseKey) {
const kty = coseKey.get(1);
const crv = coseKey.get(-1);
const x = coseKey.get(-2);
const y = coseKey.get(-3);
if (kty !== 2 || crv !== 1) {
throw new Error('Only ES256 (P-256) credentials are supported');
}
return {
kty: 'EC',
crv: 'P-256',
x: Buffer.from(x).toString('base64url'),
y: Buffer.from(y).toString('base64url'),
};
}

// attestationObject is itself a CBOR map: { fmt, attStmt, authData }
function parseAttestationObject(buf) {
const decoded = decodeCbor(buf, 0);
const map = decoded.value;
const authDataRaw = map.get('authData');
return { fmt: map.get('fmt'), authData: parseAuthenticatorData(authDataRaw) };
}

// Verifies an assertion (login) signature: signature is over
// authenticatorData || SHA-256(clientDataJSON), DER-encoded ECDSA.
function verifyAssertionSignature({ publicKeyJwk, authenticatorData, clientDataJSON, signature }) {
const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
const signedData = Buffer.concat([authenticatorData, clientDataHash]);
const publicKey = crypto.createPublicKey({ key: publicKeyJwk, format: 'jwk' });
return crypto.verify('sha256', signedData, publicKey, signature);
}

module.exports = { parseAttestationObject, parseAuthenticatorData, verifyAssertionSignature };
