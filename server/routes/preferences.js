const express = require('express');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

const CURRENCIES = ['Fr', '€', '$'];
const LANGUAGES = ['en', 'de', 'fr'];
const FONT_SIZES = [80, 100, 120, 150];
const COLOR_THEMES = ['standard', 'lighter', 'darker', 'bw'];

// Settings > App preferences > Notifications event types — see
// utils/notifier.js, which is what actually reads this shape when deciding
// where to send a given event. Kept here too so PUT can validate the shape
// of whatever the client sends rather than trusting it blindly. 'new_help'
// is Help Universe's "notify me about new matching items" event (see
// help_subscription below and routes/help.js's POST / matching logic) —
// this only controls which of Email/SMS/WhatsApp it goes out on, not
// whether it fires at all (that's help_subscription.enabled).
const NOTIFICATION_EVENTS = ['help_status', 'messages', 'new_help'];
const NOTIFICATION_CHANNELS = ['email', 'sms', 'whatsapp'];

function isValidChannelsShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const [event, channels] of Object.entries(value)) {
    if (!NOTIFICATION_EVENTS.includes(event)) return false;
    if (!channels || typeof channels !== 'object' || Array.isArray(channels)) return false;
    for (const [channel, enabled] of Object.entries(channels)) {
      if (!NOTIFICATION_CHANNELS.includes(channel)) return false;
      if (typeof enabled !== 'boolean') return false;
    }
  }
  return true;
}

// Same taxonomy as Help Universe's own HELP_CATEGORIES (MapView.jsx) and
// New Help's category picker — kept as its own copy here since this file
// has no shared module to import it from (same pattern as the client's own
// per-file duplication of this list).
const HELP_CATEGORIES = ['Food', 'Toiletries', 'Clothes', 'Social services', 'Professional services', 'Money'];
const LOGISTICS_VALUES = ['pickup', 'dropoff'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_RE = /^([01]\d|2[0-4]):00$/;

// Settings > App preferences > Notifications > New Help Available — see
// help_subscription's own migration comment in db.js. Mirrors the same
// three match dimensions as the Help Universe filter panel: categories
// (empty array = any category), day/from/to (empty day = don't check
// day/time at all), and logistics (empty array = don't check).
function isValidHelpSubscription(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (typeof value.enabled !== 'boolean') return false;
  if (!Array.isArray(value.categories) || value.categories.some(c => !HELP_CATEGORIES.includes(c))) return false;
  if (value.day !== '' && !DAYS.includes(value.day)) return false;
  if (value.from !== '' && !TIME_RE.test(value.from)) return false;
  if (value.to !== '' && !TIME_RE.test(value.to)) return false;
  if (!Array.isArray(value.logistics) || value.logistics.some(l => !LOGISTICS_VALUES.includes(l))) return false;
  return true;
}

// Settings > App preferences — every logged-in user's own cosmetic/display
// settings (currency label, UI language, font-size scale, color theme), plus
// Device (vibration_enabled) and Notifications (notification_channels,
// help_subscription) preferences. Purely client-side effects for the
// cosmetic fields: currency is a label swap (no real FX conversion happens
// anywhere), language swaps which translation dictionary
// PreferencesContext.jsx reads from, font_size scales the document root's
// font-size (every rem-based Tailwind text utility scales off that), and
// color_theme picks a CSS filter applied around the whole app. Scoped to
// the requesting user only — see users.currency/language/font_size/
// color_theme/vibration_enabled/notification_channels/help_subscription
// (db.js migration).
router.get('/', authenticate, async (req, res) => {
try {
const result = await db.query(
'SELECT currency, language, font_size, color_theme, vibration_enabled, notification_channels, help_subscription FROM users WHERE id = $1',
[req.user.id]
);
if (!result.rows[0]) return res.status(404).json({ error: 'Account not found' });
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Partial update — only the fields present in the body are validated/
// changed, so the client can save one dropdown (or one notification
// checkbox) at a time without resending the others. notification_channels
// and help_subscription are each saved whole (not merged key-by-key) — the
// client always sends its full local copy of the object, same as every
// other preference here.
router.put('/', authenticate, async (req, res) => {
const { currency, language, font_size, color_theme, vibration_enabled, notification_channels, help_subscription } = req.body;
if (currency !== undefined && !CURRENCIES.includes(currency)) {
return res.status(400).json({ error: `currency must be one of: ${CURRENCIES.join(', ')}` });
}
if (language !== undefined && !LANGUAGES.includes(language)) {
return res.status(400).json({ error: `language must be one of: ${LANGUAGES.join(', ')}` });
}
if (font_size !== undefined && !FONT_SIZES.includes(Number(font_size))) {
return res.status(400).json({ error: `font_size must be one of: ${FONT_SIZES.join(', ')}` });
}
if (color_theme !== undefined && !COLOR_THEMES.includes(color_theme)) {
return res.status(400).json({ error: `color_theme must be one of: ${COLOR_THEMES.join(', ')}` });
}
if (vibration_enabled !== undefined && typeof vibration_enabled !== 'boolean') {
return res.status(400).json({ error: 'vibration_enabled must be a boolean' });
}
if (notification_channels !== undefined && !isValidChannelsShape(notification_channels)) {
return res.status(400).json({ error: `notification_channels must map events (${NOTIFICATION_EVENTS.join(', ')}) to channel booleans (${NOTIFICATION_CHANNELS.join(', ')})` });
}
if (help_subscription !== undefined && !isValidHelpSubscription(help_subscription)) {
return res.status(400).json({ error: 'help_subscription must be { enabled, categories[], day, from, to, logistics[] } with valid values' });
}

try {
const result = await db.query(
`UPDATE users SET
currency = COALESCE($1, currency),
language = COALESCE($2, language),
font_size = COALESCE($3, font_size),
color_theme = COALESCE($4, color_theme),
vibration_enabled = COALESCE($5, vibration_enabled),
notification_channels = COALESCE($6, notification_channels),
help_subscription = COALESCE($7, help_subscription)
WHERE id = $8
RETURNING currency, language, font_size, color_theme, vibration_enabled, notification_channels, help_subscription`,
[
currency ?? null,
language ?? null,
font_size != null ? Number(font_size) : null,
color_theme ?? null,
vibration_enabled ?? null,
notification_channels ? JSON.stringify(notification_channels) : null,
help_subscription ? JSON.stringify(help_subscription) : null,
req.user.id,
]
);
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

module.exports = router;
