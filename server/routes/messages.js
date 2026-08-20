const express = require('express');
const { randomUUID } = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'zubinsarkar@gmail.com';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Look up a display name for the current user (helper/beneficiary), falling
// back to their email if no profile row is found (e.g. admin accounts) —
// UNLESS that admin is messaging within a Store-item thread (helpRowId's
// help has a `direction` set), in which case they're standing in for the
// Remar Store account (see resolveStoreRecipient above) and should be
// labelled "Remar Store", not their personal login email.
async function senderNameFor(user, helpRowId) {
  const result = await db.query(
    `SELECT name FROM helpers WHERE user_id = $1
     UNION ALL
     SELECT name FROM beneficiaries WHERE user_id = $1
     LIMIT 1`,
    [user.id]
  );
  if (result.rows[0]?.name) return result.rows[0].name;
  if (helpRowId) {
    const h = await db.query('SELECT direction FROM helps WHERE id = $1', [helpRowId]);
    if (h.rows[0]?.direction != null) return 'Remar Store';
  }
  return user.email;
}

// Batch version of senderNameFor, keyed by user id — used by GET /mine to
// look up every thread's "other party" display name in one query instead
// of one per thread.
async function nameForUserIds(userIds) {
  if (!userIds.length) return {};
  const result = await db.query(
    `SELECT user_id, name FROM helpers WHERE user_id = ANY($1)
     UNION ALL
     SELECT user_id, name FROM beneficiaries WHERE user_id = ANY($1)`,
    [userIds]
  );
  const map = {};
  for (const row of result.rows) map[row.user_id] = row.name;
  return map;
}

// The two login-less system accounts' own `users.id` (HRR0000 in helpers,
// BRR0000 in beneficiaries — see db.js). Used to give every admin a shared
// view of messages still addressed to "Remar Store" itself — see the
// isStoreAdminViewer branch in GET /mine and GET /thread/:threadId below.
async function getStoreSystemUserIds() {
  const result = await db.query(
    `SELECT user_id FROM helpers WHERE member_number = 'HRR0000'
     UNION ALL SELECT user_id FROM beneficiaries WHERE member_number = 'BRR0000'`
  );
  return result.rows.map(r => r.user_id).filter(Boolean);
}

// A Store item's "creator" (see GET /help/:id/counterpart) always resolves
// to one of the two login-less system accounts (HRR0000/BRR0000 — see
// db.js) — a real helper/beneficiary's own Chat button on such an item
// therefore points at an account nobody's ever logged into. Meanwhile
// admin's side of the SAME conversation is sent under admin's own real
// account (so it displays correctly and stays "mine" in admin's own chat
// view). Left alone, those are two different user ids for what's really
// one conversation — a second, dead-end thread against the system account,
// separate from the one admin already started. This finds whichever real
// admin already has a thread going with the current viewer about this
// exact help item and redirects to them instead, so both sides land in the
// same thread; if no admin has messaged yet, returns userId unchanged
// (nothing to redirect to — matches the pre-existing behavior).
async function resolveStoreRecipient(userId, helpRowId, viewerId) {
  if (!helpRowId || !userId) return userId;
  const sysCheck = await db.query(
    `SELECT 1 FROM helpers WHERE user_id = $1 AND member_number = 'HRR0000'
     UNION ALL SELECT 1 FROM beneficiaries WHERE user_id = $1 AND member_number = 'BRR0000'`,
    [userId]
  );
  if (!sysCheck.rows[0]) return userId;
  const existing = await db.query(
    `SELECT m.sender_user_id, m.recipient_user_id FROM messages m
     JOIN users u ON u.id = (CASE WHEN m.sender_user_id = $2 THEN m.recipient_user_id ELSE m.sender_user_id END)
     WHERE m.help_row_id = $1 AND (m.sender_user_id = $2 OR m.recipient_user_id = $2) AND u.role = 'admin'
     ORDER BY m.created_at DESC LIMIT 1`,
    [helpRowId, viewerId]
  );
  const row = existing.rows[0];
  if (!row) return userId;
  return row.sender_user_id === viewerId ? row.recipient_user_id : row.sender_user_id;
}

// A thread tied to a specific help item (messages.help_row_id) can no
// longer send messages once that help item has been Completed for more
// than 7 days — see helps.completed_at, set in PUT /assignments/:id/ack.
// Threads with no help_row_id (REMAR/support threads, not about any one
// help item) are never locked.
async function isHelpLocked(helpRowId) {
  if (!helpRowId) return false;
  const result = await db.query('SELECT status, completed_at FROM helps WHERE id = $1', [helpRowId]);
  const h = result.rows[0];
  if (!h || h.status !== 'completed' || !h.completed_at) return false;
  return (Date.now() - new Date(h.completed_at).getTime()) > SEVEN_DAYS_MS;
}

const LOCKED_ERROR = 'Messaging closed — it has been more than 7 days since this help item was marked Completed.';

// Any existing thread already tied to this help item that involves the
// given person — regardless of which identity (a system account, this
// admin, or a different admin) was on the OTHER side of it before. Used
// only for the admin side of a conversation (see findAdminThreadWith
// below): resolveStoreRecipient already fixes the non-admin side (a
// helper/beneficiary's own thread lookup redirects to whichever real admin
// already replied), but there was no mirror-image check on admin's side —
// an admin replying to someone's first-contact message (still addressed to
// the system account itself, since no admin had redirected it yet) always
// searched only for a thread paired with admin's OWN id, never found the
// person's original thread, and minted a second, disconnected one instead.
// That second thread is where the reply landed while the original sender's
// first message stayed behind in the first thread — from that person's own
// side, their own message then looks like it "never arrived", even though
// it's sitting untouched in a different thread than the one their reply is
// now in.
async function findExistingHelpThread(otherUserId, helpRowId) {
  if (!helpRowId || !otherUserId) return null;
  const result = await db.query(
    `SELECT thread_id FROM messages
     WHERE help_row_id = $1 AND (sender_user_id = $2 OR recipient_user_id = $2)
     ORDER BY created_at DESC LIMIT 1`,
    [helpRowId, otherUserId]
  );
  return result.rows[0]?.thread_id || null;
}

// Resolves (without creating) the thread an ADMIN should continue when
// messaging a given real person, optionally about a specific help item.
// Checks the help-item-wide thread first (see findExistingHelpThread
// above); falls back to the narrower admin's-own-id <-> person pairing,
// which is what still covers general, non-help-item admin messaging (e.g.
// AdminHelpers.jsx's/AdminBeneficiaries.jsx's "Chat" action, which passes
// no help_row_id at all) and is also what the pre-existing code already
// did on its own.
async function findAdminThreadWith(userId, helpRowId, adminId) {
  const viaHelp = await findExistingHelpThread(userId, helpRowId);
  if (viaHelp) return viaHelp;
  const result = await db.query(
    `SELECT thread_id FROM messages
     WHERE ((sender_user_id = $1 AND recipient_user_id = $2) OR (sender_user_id = $2 AND recipient_user_id = $1))
     AND help_row_id IS NOT DISTINCT FROM $3
     ORDER BY created_at DESC LIMIT 1`,
    [adminId, userId, helpRowId]
  );
  return result.rows[0]?.thread_id || null;
}

// Account > Chats — messages exchanged between this person and REMAR
// (sender_user_id NULL) or another user. Each row belongs to a thread
// (thread_id), so a reply chain can be shown in full — see /thread/:id and
// /:id/reply below. Threads started from a specific help item's Chat button
// (the only way a person-to-person thread starts today) carry that help
// item's id (help_row_id) throughout, so the list can show which Help ID
// each conversation is about, and lock sending once that help item has
// been Completed for more than 7 days (see isHelpLocked above).
router.get('/mine', authenticate, async (req, res) => {
  try {
    // Every admin shares one "Remar Store" inbox: a first-contact message
    // from a helper/beneficiary (Chat button on a Store item, before any
    // admin has replied on that specific help item) is stored with
    // recipient_user_id = the system account's own id (see
    // resolveStoreRecipient's comment above — it only redirects to a real
    // admin once one already exists in the thread). Left at just "WHERE
    // recipient/sender = my own id", that message would never match ANY
    // admin's session and sit orphaned forever. Any admin's own query
    // additionally pulls in messages addressed to/from either system
    // account, standing in for that shared inbox.
    const systemIds = req.user.role === 'admin' ? await getStoreSystemUserIds() : [];
    const result = await db.query(
      `SELECT m.*, h.help_id AS help_display_id, h.title AS help_title, h.status AS help_status, h.completed_at AS help_completed_at, h.direction AS help_direction
       FROM messages m
       LEFT JOIN helps h ON h.id = m.help_row_id
       WHERE m.recipient_user_id = $1 OR m.sender_user_id = $1
          OR m.recipient_user_id = ANY($2) OR m.sender_user_id = ANY($2)
       ORDER BY m.created_at ASC`,
      [req.user.id, systemIds]
    );
    const threads = new Map();
    for (const m of result.rows) {
      if (!threads.has(m.thread_id)) threads.set(m.thread_id, []);
      threads.get(m.thread_id).push(m);
    }

    // The "other party" relative to the current viewer is constant across
    // a thread (it's always a 1:1 pairing) — take the first message where
    // it's identifiable rather than trusting sender_name (which only
    // reflects whoever happened to send that particular message, so the
    // thread's last message could just as easily be the viewer's own).
    // For a system-account-addressed thread pulled in above, neither side
    // of the row is literally req.user.id (the admin viewing it stands in
    // for the system account, not the account itself) — the `: m.sender_user_id`
    // branch still resolves correctly since sender_user_id is always the
    // real helper/beneficiary who started it.
    const otherUserIdByThread = new Map();
    for (const [threadId, msgs] of threads) {
      let otherId = null;
      for (const m of msgs) {
        const candidate = m.sender_user_id === req.user.id ? m.recipient_user_id : m.sender_user_id;
        if (candidate) { otherId = candidate; break; }
      }
      otherUserIdByThread.set(threadId, otherId);
    }
    const distinctOtherIds = [...new Set([...otherUserIdByThread.values()].filter(Boolean))];
    const nameMap = await nameForUserIds(distinctOtherIds);
    // A distinctOtherId with no helpers/beneficiaries name could mean two
    // different things: an admin (no profile row, but still a real live
    // account — e.g. an admin-sent message), or someone whose account has
    // since been deleted (see accountDeletion.js — their profile row
    // survives but is detached from user_id, so it no longer matches here
    // either way). Telling them apart needs an actual users-table check.
    const unresolvedIds = distinctOtherIds.filter(id => !nameMap[id]);
    const stillExistsMap = {};
    const roleMap = {};
    if (unresolvedIds.length) {
      const existing = await db.query('SELECT id, role FROM users WHERE id = ANY($1)', [unresolvedIds]);
      for (const row of existing.rows) { stillExistsMap[row.id] = true; roleMap[row.id] = row.role; }
    }

    const now = Date.now();
    const summaries = Array.from(threads.entries()).map(([threadId, msgs]) => {
      const last = msgs[msgs.length - 1];
      // Also counts messages addressed to the system account itself as
      // unread for the admin viewing them (see systemIds above) — those
      // are exactly the "Remar Store never received it" first-contact
      // messages this shared inbox exists to surface.
      const unread_count = msgs.filter(m => !m.is_read
        && (m.recipient_user_id === req.user.id || systemIds.includes(m.recipient_user_id))).length;
      const otherUserId = otherUserIdByThread.get(threadId);
      // An admin with no helpers/beneficiaries row of their own (nameMap
      // lookup fails) who's messaging about a Store item (help_direction
      // set) is standing in for "Remar Store" — see resolveStoreRecipient
      // above and its comment — so label them that way instead of the
      // generic "Member" fallback a real person with no profile would get.
      const isStoreAdmin = !nameMap[otherUserId] && roleMap[otherUserId] === 'admin' && last.help_direction != null;
      const other_name = !otherUserId ? 'REMAR'
        : nameMap[otherUserId] || (isStoreAdmin ? 'Remar Store' : stillExistsMap[otherUserId] ? 'Member' : 'Deleted account');
      const help = last.help_row_id
        ? { row_id: last.help_row_id, help_id: last.help_display_id, title: last.help_title, status: last.help_status }
        : null;
      const locked = !!(help && help.status === 'completed' && last.help_completed_at
        && (now - new Date(last.help_completed_at).getTime()) > SEVEN_DAYS_MS);
      return {
        thread_id: threadId, last_message: last, message_count: msgs.length, unread_count,
        other_user_id: otherUserId, other_name, help, can_send: !locked,
      };
    }).sort((a, b) => new Date(b.last_message.created_at) - new Date(a.last_message.created_at));
    res.json(summaries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full chain for one thread. Also marks any messages addressed to this
// person within it as read (opening the thread is treated as reading it).
router.get('/thread/:threadId', authenticate, async (req, res) => {
  try {
    // Same shared-inbox reasoning as GET /mine above — an admin opening a
    // thread that's still addressed to the system account (first-contact
    // message, no admin redirect yet) doesn't literally appear as sender
    // or recipient on that row, so both the access check and the
    // mark-as-read need to also recognize the system accounts' ids.
    const systemIds = req.user.role === 'admin' ? await getStoreSystemUserIds() : [];
    const result = await db.query('SELECT * FROM messages WHERE thread_id = $1 ORDER BY created_at ASC', [req.params.threadId]);
    const isParty = result.rows.some(m => m.sender_user_id === req.user.id || m.recipient_user_id === req.user.id
      || systemIds.includes(m.sender_user_id) || systemIds.includes(m.recipient_user_id));
    if (result.rows.length === 0 || !isParty) return res.status(404).json({ error: 'Not found' });

    await db.query(
      'UPDATE messages SET is_read = TRUE WHERE thread_id = $1 AND (recipient_user_id = $2 OR recipient_user_id = ANY($3)) AND is_read = FALSE',
      [req.params.threadId, req.user.id, systemIds]
    );
    const refreshed = await db.query('SELECT * FROM messages WHERE thread_id = $1 ORDER BY created_at ASC', [req.params.threadId]);
    res.json(refreshed.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reply within an existing thread. The recipient is whoever the "other
// party" was on the message being replied to. If that's REMAR itself
// (sender_user_id NULL on the original), there's no user inbox to deliver
// to yet, so the reply is still recorded and also emailed to support —
// mirroring the Contact us flow.
router.post('/:id/reply', authenticate, async (req, res) => {
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'body is required' });
  try {
    const original = await db.query('SELECT * FROM messages WHERE id = $1', [req.params.id]);
    const msg = original.rows[0];
    if (!msg) return res.status(404).json({ error: 'Not found' });
    // An admin replying within a thread still addressed to a system account
    // (see getStoreSystemUserIds/GET /mine above) stands in for that
    // account — recognized here the same way, so the access check and the
    // "who am I replying to" direction both treat the system ids as the
    // admin's own identity, not just their literal req.user.id.
    const myIds = req.user.role === 'admin' ? [req.user.id, ...(await getStoreSystemUserIds())] : [req.user.id];
    if (!myIds.includes(msg.sender_user_id) && !myIds.includes(msg.recipient_user_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (await isHelpLocked(msg.help_row_id)) {
      return res.status(403).json({ error: LOCKED_ERROR });
    }

    const recipientId = myIds.includes(msg.recipient_user_id) ? msg.sender_user_id : msg.recipient_user_id;
    const senderName = await senderNameFor(req.user, msg.help_row_id);
    const inserted = await db.query(
      `INSERT INTO messages (recipient_user_id, sender_user_id, sender_name, subject, body, thread_id, help_row_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [recipientId, req.user.id, senderName, msg.subject, body.trim(), msg.thread_id, msg.help_row_id]
    );

    if (!recipientId && process.env.EMAIL_USER) {
      try {
        const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
        await transporter.sendMail({
          from: process.env.EMAIL_USER, to: SUPPORT_EMAIL, replyTo: req.user.email,
          subject: `REMAR Schweiz: Reply to message (${msg.subject || 'no subject'})`,
          text: `${senderName} (${req.user.email}) replied:\n\n${body}\n\n— in reply to thread ${msg.thread_id}`,
        });
      } catch (mailErr) { console.error('Message reply email send failed:', mailErr.message); }
    }

    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Find (but don't create) an existing direct thread between the current
// user and :userId for a specific help item (?help_row_id=, or omitted for
// a general/non-help thread) — used by the Chats page and the Help Status
// page's per-request Chat button to reopen an ongoing helper<->beneficiary
// conversation about that same help item, or to know there isn't one yet
// (thread_id: null) so the client can show an empty, ready-to-send composer
// instead. The same two people can have separate threads per help item, so
// this is always scoped by help_row_id, not just the user pair.
router.get('/with/:userId', authenticate, async (req, res) => {
  try {
    const helpRowId = req.query.help_row_id || null;
    // See resolveStoreRecipient above — a non-admin's own Chat button on a
    // Store item passes that item's system-account id here; redirect to
    // whichever real admin already has a thread going so this reopens the
    // same conversation instead of always reporting "no thread yet".
    const targetUserId = req.user.role === 'admin'
      ? req.params.userId
      : await resolveStoreRecipient(req.params.userId, helpRowId, req.user.id);
    // See findAdminThreadWith above — an admin's own lookup must also catch
    // a thread still addressed to the system account itself, not just one
    // paired with admin's own id, or a first-contact message never gets
    // reopened here at all.
    const threadId = req.user.role === 'admin'
      ? await findAdminThreadWith(targetUserId, helpRowId, req.user.id)
      : (await db.query(
          `SELECT thread_id FROM messages
           WHERE ((sender_user_id = $1 AND recipient_user_id = $2) OR (sender_user_id = $2 AND recipient_user_id = $1))
           AND help_row_id IS NOT DISTINCT FROM $3
           ORDER BY created_at DESC LIMIT 1`,
          [req.user.id, targetUserId, helpRowId]
        )).rows[0]?.thread_id || null;
    res.json({ thread_id: threadId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Direct message to a specific user (any role) — the helper<->beneficiary
// chat's send action (Help Status page's Chat button, and the Chats page's
// composer for a brand-new conversation). Reuses whatever thread already
// exists between the two of them for the same help item (help_row_id)
// unless a thread_id is passed explicitly; starts a fresh one otherwise.
// Distinct from /:id/reply above, which replies within an existing
// REMAR-support-style thread by message id.
router.post('/send', authenticate, async (req, res) => {
  const { recipient_user_id, thread_id, body, help_row_id } = req.body;
  if (!recipient_user_id || !body?.trim()) {
    return res.status(400).json({ error: 'recipient_user_id and body are required' });
  }
  try {
    const finalHelpRowId = help_row_id || null;
    // Resolved on every send (not just when starting a fresh thread) — a
    // reply within an already-known thread_id still passes the session's
    // original recipient_user_id (see ChatWidget.jsx's send()), which for a
    // Store item's non-admin party could still be the system account id;
    // without resolving here too, later replies in the same thread would
    // record a recipient nobody's actually watching for unread messages.
    const targetUserId = req.user.role === 'admin'
      ? recipient_user_id
      : await resolveStoreRecipient(recipient_user_id, finalHelpRowId, req.user.id);
    let finalThreadId = thread_id;
    if (!finalThreadId) {
      // See findAdminThreadWith above — same reasoning as GET /with/:userId:
      // an admin starting a fresh send must also catch a thread still
      // addressed to the system account itself, or a reply forks off a
      // second thread instead of continuing the person's original one.
      const existingThreadId = req.user.role === 'admin'
        ? await findAdminThreadWith(targetUserId, finalHelpRowId, req.user.id)
        : (await db.query(
            `SELECT thread_id FROM messages
             WHERE ((sender_user_id = $1 AND recipient_user_id = $2) OR (sender_user_id = $2 AND recipient_user_id = $1))
             AND help_row_id IS NOT DISTINCT FROM $3
             ORDER BY created_at DESC LIMIT 1`,
            [req.user.id, targetUserId, finalHelpRowId]
          )).rows[0]?.thread_id;
      finalThreadId = existingThreadId || randomUUID();
    }
    if (await isHelpLocked(finalHelpRowId)) {
      return res.status(403).json({ error: LOCKED_ERROR });
    }
    const senderName = await senderNameFor(req.user, finalHelpRowId);
    const inserted = await db.query(
      `INSERT INTO messages (recipient_user_id, sender_user_id, sender_name, body, thread_id, help_row_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [targetUserId, req.user.id, senderName, body.trim(), finalThreadId, finalHelpRowId]
    );
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send a message to a user (admin only) — no admin compose UI wired up yet.
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  const { recipient_user_id, subject, body, sender_name } = req.body;
  if (!recipient_user_id || !body?.trim()) {
    return res.status(400).json({ error: 'recipient_user_id and body are required' });
  }
  try {
    const result = await db.query(
      `INSERT INTO messages (recipient_user_id, sender_user_id, sender_name, subject, body, thread_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [recipient_user_id, req.user.id, sender_name || 'REMAR', subject || null, body.trim(), randomUUID()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
