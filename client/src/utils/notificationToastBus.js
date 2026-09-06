// Same tiny pub/sub shape as errorBus.js, for a different purpose: a
// transient top-of-screen banner for a push notification received while
// the app is open in the foreground (see utils/pushNotifications.js's
// pushNotificationReceived listener). While the app is backgrounded/closed,
// the OS shows its own native system banner instead — this only covers the
// foreground case, where nothing would otherwise appear on screen at all.
// NotificationToast (mounted once, in App.jsx) is the sole subscriber.
let listener = null;

export function showNotificationToast({ title, body, data } = {}) {
  if (!title && !body) return;
  if (listener) listener({ title, body, data });
}

export function subscribeNotificationToast(fn) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
