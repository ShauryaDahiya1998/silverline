const db = require('../database/db');

const DELETED_LABEL = 'Deleted account';

// Deletes a user account (self-service Settings > Delete account, or an
// admin cleaning up a specific account) while keeping other people's
// history intact:
//  1. Any pending/confirmed request this account made on someone ELSE's
//     help item is cancelled (not silently dropped) — the other party's
//     Requests list keeps showing it, just as Cancelled.
//  2. The account's own helper/beneficiary profile row is anonymized and
//     detached (name/nickname -> "Deleted account", every other personal
//     field cleared, user_id -> NULL) rather than deleted outright — so
//     completed assignments, donations, and chat threads that reference it
//     by id keep resolving instead of vanishing or crashing. See the
//     helpers.user_id / beneficiaries.user_id / messages.recipient_user_id
//     schema comments (ON DELETE SET NULL) for why this row can safely
//     survive its own user going away.
//  3. The users row itself (login, email, phone, password) is deleted —
//     this also cascades to delete every help item the account created
//     (helps.created_by ON DELETE CASCADE), which in turn cascades away
//     any assignments against those items (their own items are gone
//     entirely, not just cancelled — nothing left to cancel).
// Returns { role, helpsDeleted, requestsCancelled }.
async function deleteAccount(userId) {
  const userResult = await db.query('SELECT id, role FROM users WHERE id = $1', [userId]);
  const user = userResult.rows[0];
  if (!user) return null;

  const helperResult = await db.query('SELECT id FROM helpers WHERE user_id = $1', [userId]);
  const beneficiaryResult = await db.query('SELECT id FROM beneficiaries WHERE user_id = $1', [userId]);
  const profileId = helperResult.rows[0]?.id || beneficiaryResult.rows[0]?.id || null;
  const profileTable = helperResult.rows[0] ? 'helpers' : beneficiaryResult.rows[0] ? 'beneficiaries' : null;
  const profileColumn = profileTable === 'helpers' ? 'volunteer_id' : 'beneficiary_id';

  const helpsCountResult = await db.query('SELECT COUNT(*) FROM helps WHERE created_by = $1', [userId]);
  const helpsDeleted = Number(helpsCountResult.rows[0].count);

  let requestsCancelled = 0;
  if (profileId) {
    // Only requests against help items this account did NOT create — its
    // own items (and every assignment against them) are about to be
    // deleted wholesale via the users row's cascade, so there's nothing to
    // "cancel" there separately.
    const cancelResult = await db.query(
      `UPDATE assignments a SET status = 'cancelled', updated_at = NOW()
       WHERE a.${profileColumn} = $1
       AND a.status IN ('pending', 'confirmed')
       AND a.help_row_id NOT IN (SELECT id FROM helps WHERE created_by = $2)
       RETURNING a.id`,
      [profileId, userId]
    );
    requestsCancelled = cancelResult.rowCount;

    // Each cleared column gets a literal NULL (not a shared $2 parameter) —
    // Postgres can't deduce a single type for one placeholder used across
    // a DATE, NUMERIC, JSONB, and TEXT column all at once.
    await db.query(
      `UPDATE ${profileTable} SET
        name = $1, nickname = $1, photo_url = NULL, voice_note_url = NULL,
        date_of_birth = NULL, age_group = NULL, gender = NULL, address = NULL, street = NULL,
        house_number = NULL, city = NULL, pincode = NULL, latitude = NULL, longitude = NULL,
        phone = NULL, personality_notes = NULL, about_me = NULL, contact_preference = NULL,
        preferred_regions = NULL, ${profileTable === 'helpers' ? 'skills' : 'support_needs'} = NULL,
        ${profileTable === 'helpers' ? 'availability' : 'time_preferences'} = NULL,
        user_id = NULL
       WHERE id = $2`,
      [DELETED_LABEL, profileId]
    );
  }

  await db.query('DELETE FROM users WHERE id = $1', [userId]);

  return { role: user.role, helpsDeleted, requestsCancelled };
}

module.exports = { deleteAccount, DELETED_LABEL };
