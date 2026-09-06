import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeNotificationToast } from '../utils/notificationToastBus';

const AUTO_DISMISS_MS = 6000;

// Settings > App preferences > Device > Notifications "popup" delivery —
// a top-of-screen banner for a push notification received while the app is
// open in the foreground (see utils/pushNotifications.js's
// pushNotificationReceived listener, which is also where the vibration
// check happens). Backgrounded/closed is handled entirely by the OS's own
// system notification banner (see utils/push.js's notification/alert
// payload) — nothing here runs in that case, there's no app process to run
// it in. Mounted once, near the root (see App.jsx), same pattern as
// ErrorModal/errorBus.js.
export default function NotificationToast() {
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  useEffect(() => subscribeNotificationToast(setToast), []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  const handleTap = () => {
    setToast(null);
    // Only 'new_help' carries a destination today (see
    // utils/helpSubscriptions.js's push data payload) — anything else just
    // dismisses without navigating.
    if (toast.data?.type === 'new_help') navigate('/map');
  };

  return (
    <div
      className="fixed left-0 right-0 z-[2600] px-4 flex justify-center"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 2mm)' }}
    >
      <button
        type="button"
        onClick={handleTap}
        className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-100 px-4 py-3 text-left flex items-start gap-3 active:scale-[0.99] transition"
      >
        <span className="text-xl leading-none mt-0.5">🔔</span>
        <span className="flex-1 min-w-0">
          {toast.title && <span className="block text-sm font-semibold text-gray-800 truncate">{toast.title}</span>}
          {toast.body && <span className="block text-xs text-gray-500 mt-0.5 line-clamp-2">{toast.body}</span>}
        </span>
        <span
          onClick={(e) => { e.stopPropagation(); setToast(null); }}
          className="text-gray-300 text-xs shrink-0 mt-0.5"
        >
          ✕
        </span>
      </button>
    </div>
  );
}
