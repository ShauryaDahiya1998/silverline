import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { useAuth } from './AuthContext';
import { translations } from '../i18n/translations';

const PreferencesContext = createContext(null);

const DEFAULT_NOTIFICATION_CHANNELS = {
  help_status: { email: true, sms: false, whatsapp: false },
  messages: { email: true, sms: false, whatsapp: false },
  new_help: { email: true, sms: false, whatsapp: false },
};

// Settings > App preferences > Notifications > New Help Available — see
// db.js's help_subscription migration and utils/helpSubscriptions.js (the
// server-side matcher that reads this). Disabled by default.
const DEFAULT_HELP_SUBSCRIPTION = { enabled: false, categories: [], day: '', from: '', to: '', logistics: [] };

const DEFAULT_PREFS = {
  currency: 'Fr', language: 'en', font_size: 100, color_theme: 'standard',
  vibration_enabled: true, notification_channels: DEFAULT_NOTIFICATION_CHANNELS,
  help_subscription: DEFAULT_HELP_SUBSCRIPTION,
};

// Settings > App preferences > Color. A CSS filter on the whole app is the
// only way to re-tint every existing color (buttons, gradients, icons,
// status dots, ...) app-wide without redoing each one individually — see
// App.jsx, which wraps <AppRoutes> in a div using colorFilter below.
const COLOR_FILTERS = {
  standard: 'none',
  lighter: 'brightness(1.14) saturate(0.88)',
  darker: 'brightness(0.82) saturate(1.05)',
  bw: 'grayscale(1)',
};

// Wraps AuthProvider — loads the signed-in user's own App preferences
// (Settings > App preferences) once per session, applies font-size scaling
// to the document root, and exposes a currency/translation helper + a
// colorFilter string for App.jsx to apply. Everything here is purely
// client-side/cosmetic: currency is a label swap (no FX conversion),
// language swaps which dictionary t() reads from (see i18n/translations.js),
// font_size (%) scales every rem-based Tailwind text utility at once, and
// color_theme is a CSS filter. Logged-out visitors just get the defaults.
export const PreferencesProvider = ({ children }) => {
const { user, token } = useAuth();
const [prefs, setPrefs] = useState(DEFAULT_PREFS);

useEffect(() => {
if (!user || !token) { setPrefs(DEFAULT_PREFS); return; }
let cancelled = false;
api.get('/preferences').then(res => { if (!cancelled) setPrefs(res.data); }).catch(() => {});
return () => { cancelled = true; };
}, [user?.id, token]);

// Tailwind v4's text-xs/text-sm/... utilities are all defined in rem, so
// resizing the root element's own font-size proportionally resizes every
// one of them app-wide — no per-component changes needed.
useEffect(() => {
document.documentElement.style.fontSize = `${prefs.font_size}%`;
return () => { document.documentElement.style.fontSize = ''; };
}, [prefs.font_size]);

// Optimistic — the dropdown flips immediately, then reconciles with
// whatever the server actually saved (falls back silently on failure,
// leaving the optimistic value in place; a page refresh will resync from
// GET /preferences either way).
const updatePreferences = async (patch) => {
setPrefs(prev => ({ ...prev, ...patch }));
try {
const res = await api.put('/preferences', patch);
setPrefs(res.data);
} catch {
// leave the optimistic value — not worth surfacing a popup for a
// cosmetic setting that'll reconcile on next load anyway
}
};

const t = (key) => translations[prefs.language]?.[key] ?? translations.en[key] ?? key;

const value = useMemo(() => ({
currency: prefs.currency,
language: prefs.language,
fontSize: prefs.font_size,
colorTheme: prefs.color_theme,
colorFilter: COLOR_FILTERS[prefs.color_theme] || 'none',
vibrationEnabled: prefs.vibration_enabled,
notificationChannels: prefs.notification_channels || DEFAULT_NOTIFICATION_CHANNELS,
helpSubscription: prefs.help_subscription || DEFAULT_HELP_SUBSCRIPTION,
updatePreferences,
t,
// `${amount}` values in this app are always plain numbers/strings with no
// currency baked in (e.g. h.value, periodTotal.toFixed(2)) — this just
// prefixes the user's chosen symbol the same way "Fr." used to be
// hardcoded everywhere.
formatCurrency: (amount) => `${prefs.currency} ${amount}`,
// eslint-disable-next-line react-hooks/exhaustive-deps
}), [prefs]);

return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = () => useContext(PreferencesContext);
