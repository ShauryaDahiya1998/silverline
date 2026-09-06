const db = require('../database/db');

// Real native push notifications — the system banner + vibration a person
// sees even when the app is backgrounded/closed (see client/src/utils/
// pushNotifications.js, which registers a device token per platform into
// push_tokens the moment someone signs in on that device). Two entirely
// separate delivery paths, one per platform, since @capacitor/push-
// notifications hands back a different kind of token on each:
//
//   - Android: the token IS already a Firebase Cloud Messaging registration
//     token (that's how the Android side of the plugin is implemented under
//     the hood) — sent via the firebase-admin SDK.
//   - iOS: the token is a raw Apple Push Notification service device token
//     — sent directly to APNs (via the `apn` package) using an APNs Auth
//     Key, no Firebase involved on this side at all.
//
// Both paths are lazily require()'d and gated on their own env vars being
// set, exactly like utils/email.js/utils/sms.js's existing
// "gracefully no-op if not configured" pattern — so the server boots and
// runs fine with neither package installed nor either credential set; a
// send attempt just logs and does nothing until they're set up. See
// server/.env.example for the exact env vars each path needs.
let firebaseApp = null;
function getFirebaseMessaging() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  try {
    const admin = require('firebase-admin');
    if (!firebaseApp) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      firebaseApp = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    return admin.messaging();
  } catch (err) {
    console.error('Firebase Admin init error:', err.message);
    return null;
  }
}

let apnProvider = null;
function getApnProvider() {
  if (!process.env.APNS_KEY_PATH || !process.env.APNS_KEY_ID || !process.env.APNS_TEAM_ID || !process.env.APNS_BUNDLE_ID) return null;
  try {
    const apn = require('apn');
    if (!apnProvider) {
      apnProvider = new apn.Provider({
        token: {
          key: process.env.APNS_KEY_PATH,
          keyId: process.env.APNS_KEY_ID,
          teamId: process.env.APNS_TEAM_ID,
        },
        production: process.env.APNS_PRODUCTION === 'true',
      });
    }
    return { apn, provider: apnProvider };
  } catch (err) {
    console.error('APNs provider init error:', err.message);
    return null;
  }
}

async function sendAndroid(token, title, body, data) {
  const messaging = getFirebaseMessaging();
  if (!messaging) { console.log('[Push] FIREBASE_SERVICE_ACCOUNT_JSON not set — Android push not sent'); return; }
  try {
    // FCM's `data` payload only accepts string values — everything in
    // `data` here (help_row_id etc.) gets stringified so this doesn't throw
    // on a stray number/boolean.
    const stringData = Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)]));
    await messaging.send({ token, notification: { title, body }, data: stringData });
  } catch (err) {
    console.error('Android push send error:', err.message);
  }
}

async function sendIOS(token, title, body, data) {
  const found = getApnProvider();
  if (!found) { console.log('[Push] APNS_KEY_PATH/APNS_KEY_ID/APNS_TEAM_ID/APNS_BUNDLE_ID not set — iOS push not sent'); return; }
  try {
    const { apn, provider } = found;
    const note = new apn.Notification();
    note.alert = { title, body };
    note.sound = 'default';
    note.topic = process.env.APNS_BUNDLE_ID;
    note.payload = data || {};
    const result = await provider.send(note, token);
    if (result.failed?.length) {
      console.error('iOS push send failed:', result.failed[0]?.response?.reason || result.failed[0]?.status);
    }
  } catch (err) {
    console.error('iOS push send error:', err.message);
  }
}

// Sends to every device this user has ever registered (see push_tokens —
// one row per device, re-pointed at whoever's currently logged in on it).
// Best-effort per token: one dead/expired token failing never blocks the
// others, and this itself never throws back to its caller.
async function sendPushToUser(userId, { title, body, data } = {}) {
  if (!userId || !title) return;
  try {
    const tokens = await db.query('SELECT token, platform FROM push_tokens WHERE user_id = $1', [userId]);
    await Promise.allSettled(tokens.rows.map((row) =>
      row.platform === 'android' ? sendAndroid(row.token, title, body, data) : sendIOS(row.token, title, body, data)
    ));
  } catch (err) {
    console.error('sendPushToUser error:', err.message);
  }
}

module.exports = { sendPushToUser };
