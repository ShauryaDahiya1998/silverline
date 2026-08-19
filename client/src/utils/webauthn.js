// Browser-side WebAuthn helpers — converts between the base64url strings
// used to move challenge/credential data over JSON (axios/Express) and the
// ArrayBuffers the navigator.credentials API actually requires.

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
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;
}

// Registration — pass the object returned by POST /webauthn/register/options.
// Resolves to the payload POST /webauthn/register/verify expects.
export async function registerCredential(options) {
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
// Resolves to the payload POST /webauthn/login/verify expects.
export async function getAssertion(options) {
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
  };
}
