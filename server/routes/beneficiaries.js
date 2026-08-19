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

// Register a new beneficiary — creates the login (users row) and the
// profile (this beneficiaries row) together in one DB transaction. See the
// matching route in routes/helpers.js for why: doing these as two
// separate requests could leave a login-only account with no profile if
// the second request ever failed to complete. No authenticate middleware —
// this route IS how the account gets created.
router.post('/register', async (req, res) => {
  const { email, phone, password, name, nickname, photo_url, voice_note_url, date_of_birth, age_group, gender,
    address, street, house_number, city, pincode, latitude, longitude, support_needs, time_preferences, personality_notes,
    about_me, contact_preference, preferred_regions } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password and name are required' });
  }

  const normalizedPhone = normalizePhone(phone);
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const hash = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      `INSERT INTO users (email, phone, password_hash, role, is_verified) VALUES ($1, $2, $3, 'beneficiary', TRUE) RETURNING id, email, phone, role`,
      [email, normalizedPhone, hash]
    );
    const user = userResult.rows[0];

    const lastRes = await client.query(
      `SELECT member_number FROM beneficiaries WHERE member_number ~ '^B[A-Z]{2}[0-9]{4}$' ORDER BY member_number DESC LIMIT 1`
    );
    const nextSeq = lastRes.rows[0] ? parseMemberNumberSequence(lastRes.rows[0].member_number) + 1 : 1;
    const memberNumber = formatMemberNumber('B', nextSeq);

    const profileResult = await client.query(
      `INSERT INTO beneficiaries (user_id, name, nickname, photo_url, voice_note_url, date_of_birth,
        age_group, gender, address, street, house_number, city, pincode, latitude, longitude, support_needs, time_preferences, phone, personality_notes,
        about_me, contact_preference, preferred_regions, member_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
      [user.id, name, nickname, photo_url, voice_note_url, date_of_birth,
        age_group, gender, address, street, house_number, city, pincode, latitude, longitude, support_needs, time_preferences, normalizedPhone || phone, personality_notes,
        about_me, contact_preference ? JSON.stringify(contact_preference) : null,
        preferred_regions ? JSON.stringify(preferred_regions) : null, memberNumber]
    );

    await client.query('COMMIT');

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

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

// Get all beneficiaries (admin only)
// The Admin Beneficiaries page's table. helps_count is every help item
// they've ever created (any status) — the natural "how many times has this
// person asked for help" figure for a beneficiary, unlike a helper's
// helps_count (see routes/helpers.js), which only counts ones actually
// completed.
router.get('/', authenticate, requireRole('admin'), async (req, res) => {
try {
const result = await db.query(
`SELECT b.*, COALESCE(hc.helps_count, 0) AS helps_count
FROM beneficiaries b
LEFT JOIN (
SELECT created_by, COUNT(*) AS helps_count FROM helps GROUP BY created_by
) hc ON hc.created_by = b.user_id
WHERE b.user_id IS NOT NULL
ORDER BY b.created_at DESC`
);
res.json(result.rows);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Get current beneficiary's own profile
router.get('/me', authenticate, async (req, res) => {
try {
const result = await db.query('SELECT * FROM beneficiaries WHERE user_id = $1', [req.user.id]);
if (!result.rows[0]) return res.status(404).json({ error: 'Profile not found' });
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Get single beneficiary. Admin callers (e.g. ProfilePopup's admin full-profile
// view) also get the login email joined in — it lives on users, not this
// table, and is otherwise never exposed to non-admin viewers of this route.
router.get('/:id', authenticate, async (req, res) => {
try {
const result = await db.query(
  req.user.role === 'admin'
    ? `SELECT b.*, u.email FROM beneficiaries b LEFT JOIN users u ON u.id = b.user_id WHERE b.id = $1`
    : `SELECT * FROM beneficiaries WHERE id = $1`,
  [req.params.id]
);
if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
res.json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Create beneficiary profile
router.post('/', authenticate, async (req, res) => {
const { name, nickname, photo_url, voice_note_url, date_of_birth, age_group, gender,
address, street, house_number, city, pincode, latitude, longitude, support_needs, time_preferences, phone, personality_notes,
about_me, contact_preference, preferred_regions } = req.body;
try {
// Organization-assigned member number shown on the Home page (BAA0001,
// BAA0002, ...) — sequential per role, assigned once at registration.
// Derived from the highest member_number that currently exists (not a
// row COUNT(*), which drifts — and can hand out a number that's already
// taken, causing a duplicate-key error — the moment any beneficiary row
// has ever been deleted, since the count goes down but the surviving
// rows keep their original higher numbers).
const lastRes = await db.query(
`SELECT member_number FROM beneficiaries WHERE member_number ~ '^B[A-Z]{2}[0-9]{4}$' ORDER BY member_number DESC LIMIT 1`
);
const nextSeq = lastRes.rows[0] ? parseMemberNumberSequence(lastRes.rows[0].member_number) + 1 : 1;
const memberNumber = formatMemberNumber('B', nextSeq);
const result = await db.query(
`INSERT INTO beneficiaries (user_id, name, nickname, photo_url, voice_note_url, date_of_birth,
age_group, gender, address, street, house_number, city, pincode, latitude, longitude, support_needs, time_preferences, phone, personality_notes,
about_me, contact_preference, preferred_regions, member_number)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
[req.user.id, name, nickname, photo_url, voice_note_url, date_of_birth,
age_group, gender, address, street, house_number, city, pincode, latitude, longitude, support_needs, time_preferences, phone, personality_notes,
about_me, contact_preference ? JSON.stringify(contact_preference) : null,
preferred_regions ? JSON.stringify(preferred_regions) : null, memberNumber]
);
res.status(201).json(result.rows[0]);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Update beneficiary profile
router.put('/:id', authenticate, async (req, res) => {
const { name, nickname, photo_url, voice_note_url, date_of_birth, age_group, gender, address, street, house_number, city, pincode,
latitude, longitude, support_needs, time_preferences, phone, personality_notes,
about_me, contact_preference, preferred_regions } = req.body;
try {
const result = await db.query(
`UPDATE beneficiaries SET name=$1, nickname=$2, photo_url=$3, voice_note_url=$4, date_of_birth=$5, age_group=$6, gender=$7,
address=$8, street=$9, house_number=$10, city=$11, pincode=$12, latitude=$13, longitude=$14, support_needs=$15, time_preferences=$16, phone=$17, personality_notes=$18,
about_me=$19, contact_preference=$20, preferred_regions=$21
WHERE id=$22 RETURNING *`,
[name, nickname, photo_url, voice_note_url, date_of_birth, age_group, gender, address, street, house_number, city, pincode,
latitude, longitude, support_needs, time_preferences, phone, personality_notes,
about_me, contact_preference ? JSON.stringify(contact_preference) : null,
preferred_regions ? JSON.stringify(preferred_regions) : null, req.params.id]
);
// Keep the login-lookup table (users.phone) in sync with the profile's
// phone — login (routes/auth.js POST /login) matches against users.phone,
// not beneficiaries.phone, so without this a phone number added/changed
// here would show on the profile but never actually work to log in with.
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

// Shared by both export routes below — same shape as the Admin
// Beneficiaries page's table (Beneficiary ID, Name, Location, Helps).
async function beneficiariesExportRows() {
const result = await db.query(
`SELECT b.member_number, b.name, b.nickname, b.city, b.pincode, COALESCE(hc.helps_count, 0) AS helps_count
FROM beneficiaries b
LEFT JOIN (
SELECT created_by, COUNT(*) AS helps_count FROM helps GROUP BY created_by
) hc ON hc.created_by = b.user_id
ORDER BY b.created_at DESC`
);
return result.rows.map(r => {
const fullName = r.name || '';
const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
const surname = nameParts.length ? nameParts[nameParts.length - 1] : '';
return {
beneficiary_id: r.member_number || '—',
name: r.nickname || surname || '—',
location: r.city || r.pincode || '—',
helps: Number(r.helps_count) || 0,
};
});
}

// Export beneficiaries as CSV
router.get('/export/csv', authenticate, requireRole('admin'), async (req, res) => {
try {
const rows = await beneficiariesExportRows();
const filePath = path.join(__dirname, '../exports/beneficiaries.csv');
const csvWriter = createObjectCsvWriter({
path: filePath,
header: [
{ id: 'beneficiary_id', title: 'Beneficiary ID' },
{ id: 'name', title: 'Name' },
{ id: 'location', title: 'Location' },
{ id: 'helps', title: 'Helps' },
]
});
await csvWriter.writeRecords(rows);
res.download(filePath, 'beneficiaries.csv');
} catch (err) {
res.status(500).json({ error: err.message });
}
});

// Export beneficiaries as XLSX — see utils/xlsx.js for why this is
// hand-rolled rather than a library (no npm registry access here).
router.get('/export/xlsx', authenticate, requireRole('admin'), async (req, res) => {
try {
const rows = await beneficiariesExportRows();
const { buildXlsx } = require('../utils/xlsx');
const buf = buildXlsx(
['Beneficiary ID', 'Name', 'Location', 'Helps'],
rows.map(r => [r.beneficiary_id, r.name, r.location, r.helps])
);
res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
res.setHeader('Content-Disposition', 'attachment; filename="beneficiaries.xlsx"');
res.send(buf);
} catch (err) {
res.status(500).json({ error: err.message });
}
});

module.exports = router;
