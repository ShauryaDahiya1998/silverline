const express = require('express');
const { randomUUID } = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'zubinsarkar@gmail.com';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Look up a display name for the current user (helper/beneficiary), falling
// back to their email if no profile row is found (e.g. admin accounts).
async function senderNameFor(user) {
  const result = await db.query(
    `SELECT name FROM helpers WHERE user_id = $1
     UNION ALL
     SELECT name FROM beneficiaries WHERE user_id = $1
     LIMIT 1`,
    [user.id]
  );
  return result.rows[0]?.name || user.email;
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
    const result = await db.query(
      `SELECT m.*, h.help_id AS help_display_id, h.title AS help_title, h.status AS help_status, h.completed_at AS help_completed_at
       FROM messages m
       LEFT JOIN helps h ON h.id = m.help_row_id
       WHERE m.recipient_user_id = $1 OR m.sender_user_id = $1
       ORDER BY m.created_at ASC`,
      [req.user.id]
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
    if (unresolvedIds.length) {
      const existing = await db.query('SELECT id FROM users WHERE id = ANY($1)', [unresolvedIds]);
      for (const row of existing.rows) stillExistsMap[row.id] = true;
    }

    const now = Date.now();
    const summaries = Array.from(threads.entries()).map(([threadId, msgs]) => {
      const last = msgs[msgs.length - 1];
      const unread_count = msgs.filter(m => m.recipient_user_id === req.user.id && !m.is_read).length;
      const otherUserId = otherUserIdByThread.get(threadId);
      const other_name = !otherUserId ? 'REMAR'
        : nameMap[otherUserId] || (stillExistsMap[otherUserId] ? 'Member' : 'Deleted account');
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
    const result = await db.query('SELECT * FROM messages WHERE thread_id = $1 ORDER BY created_at ASC', [req.params.threadId]);
    const isParty = result.rows.some(m => m.sender_user_id === req.user.id || m.recipient_user_id === req.user.id);
    if (result.rows.length === 0 || !isParty) return res.status(404).json({ error: 'Not found' });

    await db.query(
      'UPDATE messages SET is_read = TRUE WHERE thread_id = $1 AND recipient_user_id = $2 AND is_read = FALSE',
      [req.params.threadId, req.user.id]
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
    if (msg.sender_user_id !== req.user.id && msg.recipient_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (await isHelpLocked(msg.help_row_id)) {
      return res.status(403).json({ error: LOCKED_ERROR });
    }

    const recipientId = req.user.id === msg.recipient_user_id ? msg.sender_user_id : msg.recipient_user_id;
    const senderName = await senderNameFor(req.user);
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
    const existing = await db.query(
      `SELECT thread_id FROM messages
       WHERE ((sender_user_id = $1 AND recipient_user_id = $2) OR (sender_user_id = $2 AND recipient_user_id = $1))
       AND help_row_id IS NOT DISTINCT FROM $3
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id, req.params.userId, helpRowId]
    );
    res.json({ thread_id: existing.rows[0]?.thread_id || null });
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
    let finalThreadId = thread_id;
    if (!finalThreadId) {
      const existing = await db.query(
        `SELECT thread_id FROM messages
         WHERE ((sender_user_id = $1 AND recipient_user_id = $2) OR (sender_user_id = $2 AND recipient_user_id = $1))
         AND help_row_id IS NOT DISTINCT FROM $3
         ORDER BY created_at DESC LIMIT 1`,
        [req.user.id, recipient_user_id, finalHelpRowId]
      );
      finalThreadId = existing.rows[0]?.thread_id || randomUUID();
    }
    if (await isHelpLocked(finalHelpRowId)) {
      return res.status(403).json({ error: LOCKED_ERROR });
    }
    const senderName = await senderNameFor(req.user);
    const inserted = await db.query(
      `INSERT INTO messages (recipient_user_id, sender_user_id, sender_name, body, thread_id, help_row_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [recipient_user_id, req.user.id, senderName, body.trim(), finalThreadId, finalHelpRowId]
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
