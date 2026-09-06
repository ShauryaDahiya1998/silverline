// WebAuthn helpers — converts between the base64url strings used to move
// challenge/credential data over JSON (axios/Express) and whatever shape
// each platform's own credential API actually requires.
//
// Two implementations live behind the same exports below:
//   - Browser (web deployment): navigator.credentials, as before.
//   - Native iOS: PasskeyPlugin (client/ios/App/App/PasskeyPlugin.swift) —
//     needed because the native app is loaded from a locally bundled build
//     (see capacitor.config.json, no "server" block), so its WKWebView's
//     own origin is never remar-app-pq0s.onrender.com and plain browser
//     navigator.credentials can't perform a ceremony against that RP ID at
//     all. This isn't Apple's system Passkey UI either (that needs the
//     "Associated Domains" capability, which Apple restricts to paid
//     Developer Program accounts) — it's a Secure Enclave-backed key pair
//     the plugin builds and signs with itself, gated by Face ID/Touch ID
//     via biometryCurrentSet Keychain access control, wrapped in the same
//     WebAuthn-shaped bytes a browser ceremony would produce. Every caller
//     (Login.jsx, HelperRegister.jsx, BeneficiaryRegister.jsx,
//     EditHelperProfile.jsx, EditBeneficiaryProfile.jsx) goes through
//     registerCredential/getAssertion/isWebAuthnSupported/removeCredential
//     only, so neither branch needs any caller-side changes.
import { Capacitor, registerPlugin } from '@capacitor/core';

const PasskeyPlugin = registerPlugin('PasskeyPlugin');
const isNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

function base64urlToBuffer(base64url) {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isWebAuthnSupported() {
  if (isNative()) return true; // gated by PasskeyPlugin.isAvailable() at call time instead — see below
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;
}

// Registration — pass the object returned by POST /webauthn/register/options.
// Resolves to the payload POST /webauthn/register/verify expects.
export async function registerCredential(options) {
  if (isNative()) {
    const { value: available } = await PasskeyPlugin.isAvailable();
    if (!available) throw new Error('Face ID / Touch ID is not set up on this device');
    const result = await PasskeyPlugin.register({
      challenge: options.challenge,
      rpId: options.rp.id,
      userId: options.user.id,
      userName: options.user.name,
      userDisplayName: options.user.displayName,
    });
    return {
      rawId: result.rawId,
      response: {
        attestationObject: result.attestationObject,
        clientDataJSON: result.clientDataJSON,
      },
    };
  }

  const publicKey = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    user: { ...options.user, id: base64urlToBuffer(options.user.id) },
  };
  const credential = await navigator.credentials.create({ publicKey });
  return {
    rawId: credential.id, // PublicKeyCredential.id is already base64url(rawId) per spec
    response: {
      attestationObject: bufferToBase64url(credential.response.attestationObject),
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
    },
  };
}

// Login — pass the object returned by POST /webauthn/login/options.
// Resolves to the payload POST /webauthn/login/verify expects. When
// allowCredentials is empty (the passwordless branch of login/options), the
// platform prompts for any resident/discoverable credential it holds for
// this RP rather than one specific account, and hands back a userHandle
// identifying which account was picked — that's what login/verify uses to
// resolve the account without ever asking for an email/phone. The native
// branch below always behaves this way (PasskeyPlugin.authenticate doesn't
// take an allowCredentials list) since iOS's own system passkey UI already
// only offers credentials registered for this rpId.
export async function getAssertion(options) {
  if (isNative()) {
    const { value: available } = await PasskeyPlugin.isAvailable();
    if (!available) throw new Error('Face ID / Touch ID is not set up on this device');
    const result = await PasskeyPlugin.authenticate({
      challenge: options.challenge,
      rpId: options.rpId,
    });
    return {
      rawId: result.rawId,
      response: {
        authenticatorData: result.authenticatorData,
        clientDataJSON: result.clientDataJSON,
        signature: result.signature,
      },
      userHandle: result.userHandle || null,
    };
  }

  const publicKey = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    allowCredentials: (options.allowCredentials || []).map(c => ({ ...c, id: base64urlToBuffer(c.id) })),
  };
  const credential = await navigator.credentials.get({ publicKey });
  return {
    rawId: credential.id,
    response: {
      authenticatorData: bufferToBase64url(credential.response.authenticatorData),
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
      signature: bufferToBase64url(credential.response.signature),
    },
    userHandle: credential.response.userHandle ? bufferToBase64url(credential.response.userHandle) : null,
  };
}

// Native-only cleanup — call alongside DELETE /webauthn/credentials/:type
// (see EditHelperProfile.jsx/EditBeneficiaryProfile.jsx's disable-toggle
// path) so switching Face ID/Fingerprint off also clears the on-device
// Secure Enclave key, rather than leaving an orphaned one behind that
// would still trigger a Face ID prompt on next login only to then fail
// server-side with "Unrecognized credential". No-op on web (there's
// nothing local to clean up there — the browser/platform owns that).
export async function removeCredential() {
  if (!isNative()) return;
  try { await PasskeyPlugin.removeCredential(); } catch { /* best-effort, same as the server DELETE call */ }
}
