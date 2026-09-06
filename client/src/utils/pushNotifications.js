import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import api from '../api';
import { showNotificationToast } from './notificationToastBus';

// Registers this device for push notifications and hands the resulting
// device token to the server (see server/routes/pushTokens.js), so it can
// eventually be used to actually send a push. This is what makes iOS/
// Android register the Notifications permission for real — as opposed to
// Settings.jsx's "Notifications" row, which only ever *deep-links* to the
// OS's existing settings for whatever permission state already exists.
// No-ops outside a native app shell (the plugin has no web implementation)
// and silently does nothing if the person declines the permission prompt —
// there's no error to surface to them either way, just no push token saved.
let alreadyRegistered = false;

export async function registerPush() {
  if (!Capacitor.isNativePlatform() || alreadyRegistered) return;
  alreadyRegistered = true;

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return;

    // 'registration' fires once the OS hands back a real device token;
    // listeners are added before register() so the event can't fire and be
    // missed in between.
    PushNotifications.addListener('registration', (token) => {
      api.post('/push-tokens', {
        token: token.value,
        platform: Capacitor.getPlatform(),
      }).catch(() => {});
    });
    PushNotifications.addListener('registrationError', () => {});

    // Fires only while the app is actually open/foregrounded — a
    // backgrounded/closed app never runs this code at all, and instead
    // shows the OS's own system banner directly from the push payload (see
    // server/utils/push.js's notification/alert fields). Two delivery
    // mechanisms live here for the foreground case, matching Settings >
    // App preferences > Device > Notifications' "vibration or notification
    // popup" wording: a haptic buzz (if Vibration is on) and an in-app
    // banner (see NotificationToast.jsx/notificationToastBus.js) — nothing
    // would otherwise appear on screen for a foreground push at all.
    // vibration_enabled is checked fresh (not cached) on each arrival since
    // this module lives outside React and has no subscription to
    // PreferencesContext — a push notification is rare enough that one
    // extra GET /preferences per arrival is cheap. Best-effort throughout:
    // any failure here (offline, plugin unavailable on web/simulator,
    // preference fetch failing) just means no buzz/banner, never an error
    // surfaced to the user.
    PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      showNotificationToast({
        title: notification?.title,
        body: notification?.body,
        data: notification?.data,
      });
      try {
        const res = await api.get('/preferences');
        if (res.data.vibration_enabled) await Haptics.impact({ style: ImpactStyle.Medium });
      } catch { /* best-effort */ }
    });

    await PushNotifications.register();
  } catch {
    // Registration failing shouldn't block anything else in the app —
    // this is best-effort infrastructure, not a user-facing feature yet.
  }
}
