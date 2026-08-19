const express = require('express');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

const CURRENCIES = ['Fr', '€', '$'];
const LANGUAGES = ['en', 'de', 'fr'];
const FONT_SIZES = [80, 100, 120, 150];
const COLOR_THEMES = ['standard', 'lighter', 'darker', 'bw'];

// Settings > App preferences — every logged-in user's own cosmetic/display
// settings (currency label, UI language, font-size scale, color theme).
// Purely client-side effects: currency is a label swap (no real FX
// conversion happens anywhere), language swaps which translation dictionary
// PreferencesContext.jsx reads from, font_size scales the document root's
// font-size (every rem-based Tailwind text utility scales off that), and
// color_theme picks a CSS filter applied around the whole app. Scoped to the
// requesting user only — see users.currency/language/font_size/color_theme
// (db.js migration).
router.get('/', authenticate, async (req, res) => {
try {
const result = await db.query(
'SELECT currency, language, font_size, color_theme FROM users WHERE id = $1',
[req.user.id]
);
if (!result.rows[0]) return res.status(404).json({ error: 'Account not found' });
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Partial update — only the fields present in the body are validated/
// changed, so the client can save one dropdown at a time without resending
// the others.
router.put('/', authenticate, async (req, res) => {
const { currency, language, font_size, color_theme } = req.body;
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

try {
const result = await db.query(
`UPDATE users SET
currency = COALESCE($1, currency),
language = COALESCE($2, language),
font_size = COALESCE($3, font_size),
color_theme = COALESCE($4, color_theme)
WHERE id = $5
RETURNING currency, language, font_size, color_theme`,
[currency ?? null, language ?? null, font_size != null ? Number(font_size) : null, color_theme ?? null, req.user.id]
);
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

module.exports = router;
