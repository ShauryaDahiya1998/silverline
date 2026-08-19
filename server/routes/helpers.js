const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const { formatMemberNumber, parseMemberNumberSequence } = require('../utils/memberNumber');
const { sendWelcomeEmail } = require('../utils/email');
const { sendWelcomeSms } = require('../utils/sms');
const router = express.Router();

// Keep only the digits and a leading '+', matching routes/auth.js.
function normalizePhone(value) {
  if (!value) return null;
  const digits = value.replace(/[^\d+]/g, '');
  return digits || null;
}

// Register a new helper — creates the login (users row) and the profile
// (this helpers row) together in one DB transaction. Previously this was
// two separate requests (POST /auth/register then POST /helpers below);
// if the second one ever failed or never fired (dropped connection, browser
// closed mid-submit, a bug in the client), the account was left sitting in
// the database with no profile — able to occupy an email/phone forever, but
// unusable (no profile row to log into). Wrapping both inserts in one
// transaction means either the whole registration succeeds or neither row
// is kept. No authenticate middleware — this route IS how the account gets
// created; the OTP step on Verify-to-register (routes/otp.js) is what
// proves the person owns this email/phone before they ever reach here.
router.post('/register', async (req, res) => {
  const { email, phone, password, name, nickname, photo_url, voice_note_url, date_of_birth, age_group, gender,
    address, street, house_number, city, pincode, latitude, longitude, skills, availability, personality_notes,
    about_me, contact_preference, preferred_regions, professional_license, professional_experience } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password and name are required' });
  }

  const normalizedPhone = normalizePhone(phone);
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const hash = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      `INSERT INTO users (email, phone, password_hash, role, is_verified) VALUES ($1, $2, $3, 'helper', TRUE) RETURNING id, email, phone, role`,
      [email, normalizedPhone, hash]
    );
    const user = userResult.rows[0];

    // Excludes HRR0000 — the fixed, permanently-reserved member number for
    // the Remar Store system account (see db.js's bootstrap) — otherwise
    // its 'RR' letter block, which sorts after any real sequential block
    // (AA, AB, ...), would get picked up as the "highest" existing number
    // and badly derail every real helper's next member number.
    const lastRes = await client.query(
      `SELECT member_number FROM helpers WHERE member_number ~ '^H[A-Z]{2}[0-9]{4}$' AND member_number <> 'HRR0000' ORDER BY member_number DESC LIMIT 1`
    );
    const nextSeq = lastRes.rows[0] ? parseMemberNumberSequence(lastRes.rows[0].member_number) + 1 : 1;
    const memberNumber = formatMemberNumber('H', nextSeq);

    const profileResult = await client.query(
      `INSERT INTO helpers (user_id, name, nickname, photo_url, voice_note_url, date_of_birth,
        age_group, gender, address, street, house_number, city, pincode, latitude, longitude, skills, availability, phone, personality_notes,
        about_me, contact_preference, preferred_regions, member_number, professional_license, professional_experience)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
      [user.id, name, nickname, photo_url, voice_note_url, date_of_birth,
        age_group, gender, address, street, house_number, city, pincode, latitude, longitude, skills, availability, normalizedPhone || phone, personality_notes,
        about_me, contact_preference ? JSON.stringify(contact_preference) : null,
        preferred_regions ? JSON.stringify(preferred_regions) : null, memberNumber,
        professional_license || null, professional_experience || null]
    );

    await client.query('COMMIT');

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Confirmation only fires once both rows are safely committed —
    // best-effort/non-blocking either way, to whichever contact methods
    // are on file.
    if (user.email) sendWelcomeEmail(user.email).catch(err => console.error('Welcome email error:', err.message));
    if (user.phone) sendWelcomeSms(user.phone).catch(err => console.error('Welcome SMS error:', err.message));

    res.status(201).json({ token, user, profile: profileResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      if (err.constraint === 'users_phone_unique') return res.status(400).json({ error: 'Phone number already registered' });
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Get all helpers (admin only) — the Admin Helpers page's table. Excludes
// the Remar Store system account (member_number 'HRR0000', see db.js's
// bootstrap) — it isn't a real person, so it has no place in a roster of
// helpers to browse/export/message. helps_count is completed assignments
// as the volunteer (actual help delivered, not just matched/in-progress);
// donations_total is their lifetime logged total (see routes/donations.js —
// nothing automatic feeds this, an admin logs each one manually).
router.get('/', authenticate, requireRole('admin'), async (req, res) => {
try {
const result = await db.query(
`SELECT h.*, COALESCE(hc.helps_count, 0) AS helps_count, COALESCE(dc.donations_total, 0) AS donations_total
FROM helpers h
LEFT JOIN (
SELECT volunteer_id, COUNT(*) AS helps_count FROM assignments WHERE status = 'completed' GROUP BY volunteer_id
) hc ON hc.volunteer_id = h.id
LEFT JOIN (
SELECT helper_id, SUM(amount) AS donations_total FROM donations GROUP BY helper_id
) dc ON dc.helper_id = h.id
WHERE h.member_number IS DISTINCT FROM 'HRR0000' AND h.user_id IS NOT NULL
ORDER BY h.created_at DESC`
);
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Get current helper's own profile
router.get('/me', authenticate, async (req, res) => {
try {
const result = await db.query('SELECT * FROM helpers WHERE user_id = $1', [req.user.id]);
if (!result.rows[0]) return res.status(404).json({ error: 'Profile not found' });
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Admin > Settings > Store location — reads/writes the Remar Store system
// account's own address (member_number 'HRR0000', see db.js's bootstrap).
// This IS "the Admin account's location" Remar Store items are placed at on
// the map (there's only ever one Remar Store account, shared org-wide, same
// as admin logins themselves) — same address fields as helper/beneficiary
// registration. Declared before GET /:id (same reason /me is) so
// '/store-location' isn't swallowed by it.
router.get('/store-location', authenticate, requireRole('admin'), async (req, res) => {
try {
const result = await db.query(
`SELECT street, house_number, city, pincode, latitude, longitude FROM helpers WHERE member_number = 'HRR0000'`
);
if (!result.rows[0]) return res.status(404).json({ error: 'Remar Store account is not set up' });
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

router.put('/store-location', authenticate, requireRole('admin'), async (req, res) => {
const { street, house_number, city, pincode, latitude, longitude } = req.body;
if (!pincode) return res.status(400).json({ error: 'Pincode is required' });
try {
const address = [street, house_number, city, pincode].filter(Boolean).join(', ');
const result = await db.query(
`UPDATE helpers SET street=$1, house_number=$2, city=$3, pincode=$4, latitude=$5, longitude=$6, address=$7
WHERE member_number = 'HRR0000' RETURNING street, house_number, city, pincode, latitude, longitude`,
[street || null, house_number || null, city || null, pincode, latitude || null, longitude || null, address]
);
if (!result.rows[0]) return res.status(404).json({ error: 'Remar Store account is not set up' });
// Also mirror onto BRR0000 (the beneficiary-side system account fronting
// "Help Required" Store items, direction 'request') — this route is the
// one place both accounts' address gets set, so every Store item shows
// the same Store location regardless of which system account created it
// (see the Help Status / Store popup location field).
await db.query(
`UPDATE beneficiaries SET street=$1, house_number=$2, city=$3, pincode=$4, latitude=$5, longitude=$6, address=$7
WHERE member_number = 'BRR0000'`,
[street || null, house_number || null, city || null, pincode, latitude || null, longitude || null, address]
);
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Get single helper. Admin callers (e.g. ProfilePopup's admin full-profile
// view) also get the login email joined in — it lives on users, not this
// table, and is otherwise never exposed to non-admin viewers of this route.
router.get('/:id', authenticate, async (req, res) => {
try {
const result = await db.query(
  req.user.role === 'admin'
    ? `SELECT h.*, u.email FROM helpers h LEFT JOIN users u ON u.id = h.user_id WHERE h.id = $1`
    : `SELECT * FROM helpers WHERE id = $1`,
  [req.params.id]
);
if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Create helper profile
router.post('/', authenticate, async (req, res) => {
const { name, nickname, photo_url, voice_note_url, date_of_birth, age_group, gender,
address, street, house_number, city, pincode, latitude, longitude, skills, availability, phone, personality_notes,
about_me, contact_preference, preferred_regions } = req.body;
try {
// Organization-assigned member number shown on the Home page (HAA0001,
// HAA0002, ...) — sequential per role, assigned once at registration.
// Derived from the highest member_number that currently exists (not a
// row COUNT(*), which drifts — and can hand out a number that's already
// taken, causing a duplicate-key error — the moment any helper row
// has ever been deleted, since the count goes down but the surviving
// rows keep their original higher numbers).
// Excludes HRR0000 — see the matching exclusion + comment on the /register
// route above.
const lastRes = await db.query(
`SELECT member_number FROM helpers WHERE member_number ~ '^H[A-Z]{2}[0-9]{4}$' AND member_number <> 'HRR0000' ORDER BY member_number DESC LIMIT 1`
);
const nextSeq = lastRes.rows[0] ? parseMemberNumberSequence(lastRes.rows[0].member_number) + 1 : 1;
const memberNumber = formatMemberNumber('H', nextSeq);
const result = await db.query(
`INSERT INTO helpers (user_id, name, nickname, photo_url, voice_note_url, date_of_birth,
age_group, gender, address, street, house_number, city, pincode, latitude, longitude, skills, availability, phone, personality_notes,
about_me, contact_preference, preferred_regions, member_number)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
[req.user.id, name, nickname, photo_url, voice_note_url, date_of_birth,
age_group, gender, address, street, house_number, city, pincode, latitude, longitude, skills, availability, phone, personality_notes,
about_me, contact_preference ? JSON.stringify(contact_preference) : null,
preferred_regions ? JSON.stringify(preferred_regions) : null, memberNumber]
);
res.status(201).json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Update helper profile
router.put('/:id', authenticate, async (req, res) => {
const { name, nickname, photo_url, voice_note_url, date_of_birth, age_group, gender, address, street, house_number, city, pincode,
latitude, longitude, skills, availability, phone, personality_notes,
about_me, contact_preference, preferred_regions, professional_license, professional_experience } = req.body;
try {
const result = await db.query(
`UPDATE helpers SET name=$1, nickname=$2, photo_url=$3, voice_note_url=$4, date_of_birth=$5, age_group=$6, gender=$7,
address=$8, street=$9, house_number=$10, city=$11, pincode=$12, latitude=$13, longitude=$14, skills=$15, availability=$16, phone=$17, personality_notes=$18,
about_me=$19, contact_preference=$20, preferred_regions=$21, professional_license=$22, professional_experience=$23
WHERE id=$24 RETURNING *`,
[name, nickname, photo_url, voice_note_url, date_of_birth, age_group, gender, address, street, house_number, city, pincode,
latitude, longitude, skills, availability, phone, personality_notes,
about_me, contact_preference ? JSON.stringify(contact_preference) : null,
preferred_regions ? JSON.stringify(preferred_regions) : null,
professional_license || null, professional_experience || null, req.params.id]
);
// Keep the login-lookup table (users.phone) in sync with the profile's
// phone — login (routes/auth.js POST /login) matches against users.phone,
// not helpers.phone, so without this a phone number added/changed here
// would show on the profile but never actually work to log in with.
if (result.rows[0]) {
await db.query('UPDATE users SET phone = $1 WHERE id = $2', [normalizePhone(phone), result.rows[0].user_id]);
}
res.json(result.rows[0]);
} catch (err) {
if (err.code === '23505' && err.constraint === 'users_phone_unique') {
return res.status(400).json({ error: 'Phone number already registered to another account' });
}
res.status(500).json({ error: err.message });
}
});

// Shared by both export routes below — same shape as the Admin Helpers
// page's table (Helper ID, Name, Location, Helps, Donations), so what gets
// downloaded matches exactly what's on screen. Location falls back to a
// pincode-derived city the same way the client does for any row missing
// city outright, since a plain city/pincode column dump wouldn't show it.
async function helpersExportRows() {
const result = await db.query(
`SELECT h.member_number, h.name, h.nickname, h.city, h.pincode,
COALESCE(hc.helps_count, 0) AS helps_count, COALESCE(dc.donations_total, 0) AS donations_total
FROM helpers h
LEFT JOIN (
SELECT volunteer_id, COUNT(*) AS helps_count FROM assignments WHERE status = 'completed' GROUP BY volunteer_id
) hc ON hc.volunteer_id = h.id
LEFT JOIN (
SELECT helper_id, SUM(amount) AS donations_total FROM donations GROUP BY helper_id
) dc ON dc.helper_id = h.id
WHERE h.member_number IS DISTINCT FROM 'HRR0000' AND h.user_id IS NOT NULL
ORDER BY h.created_at DESC`
);
return result.rows.map(r => {
const fullName = r.name || '';
const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
const surname = nameParts.length ? nameParts[nameParts.length - 1] : '';
return {
helper_id: r.member_number || '—',
name: r.nickname || surname || '—',
location: r.city || r.pincode || '—',
helps: Number(r.helps_count) || 0,
donations: Number(r.donations_total) || 0,
};
});
}

// Export helpers as CSV
router.get('/export/csv', authenticate, requireRole('admin'), async (req, res) => {
try {
const rows = await helpersExportRows();
const filePath = path.join(__dirname, '../exports/helpers.csv');
const csvWriter = createObjectCsvWriter({
path: filePath,
header: [
{ id: 'helper_id', title: 'Helper ID' },
{ id: 'name', title: 'Name' },
{ id: 'location', title: 'Location' },
{ id: 'helps', title: 'Helps' },
{ id: 'donations', title: 'Donations (Fr)' },
]
});
await csvWriter.writeRecords(rows);
res.download(filePath, 'helpers.csv');
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Export helpers as XLSX — see utils/xlsx.js for why this is hand-rolled
// rather than a library (no npm registry access in this environment).
router.get('/export/xlsx', authenticate, requireRole('admin'), async (req, res) => {
try {
const rows = await helpersExportRows();
const { buildXlsx } = require('../utils/xlsx');
const buf = buildXlsx(
['Helper ID', 'Name', 'Location', 'Helps', 'Donations (Fr)'],
rows.map(r => [r.helper_id, r.name, r.location, r.helps, r.donations])
);
res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
res.setHeader('Content-Disposition', 'attachment; filename="helpers.xlsx"');
res.send(buf);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

module.exports = router;
