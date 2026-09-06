const db = require('../database/db');
const nodemailer = require('nodemailer');
const { sendWhatsapp } = require('./sms');

// Settings > App preferences > Notifications — per-event-type Email/SMS/
// WhatsApp dispatch. Reads the target user's own notification_channels
// preference (see routes/preferences.js / db.js's users migration) and fans
// the same message out over whichever channels they've turned on for this
// event type. Every send is best-effort and independent of the others — one
// channel failing (e.g. WhatsApp not configured) never blocks the rest, and
// this never throws back into the calling route, so a notification problem
// can't turn into a failed help-status-change or failed message-send.
//
// eventType is one of NOTIFICATION_EVENTS in routes/preferences.js:
//   'help_status' — a help item's status changed (see routes/assignments.js
//                    PUT /:id/respond).
//   'messages'    — a new chat message arrived (see routes/messages.js POST
//                    /send and /:id/reply).
//
// content: { subject, text } — subject is used for email only; text is used
// as-is for the email body (plain text, wrapped minimally) and verbatim for
// SMS/WhatsApp.
async function notifyUser(userId, eventType, content) {
  if (!userId) return;
  try {
    const result = await db.query(
      'SELECT email, phone, notification_channels FROM users WHERE id = $1',
      [userId]
    );
    const user = result.rows[0];
    if (!user) return;
    const channels = user.notification_channels?.[eventType];
    if (!channels) return;

    const jobs = [];
    if (channels.email && user.email) jobs.push(sendPlainEmail(user.email, content.subject, content.text));
    if (channels.sms && user.phone) jobs.push(sendPlainSms(user.phone, content.text));
    if (channels.whatsapp && user.phone) jobs.push(sendWhatsapp(user.phone, content.text));
    await Promise.allSettled(jobs);
  } catch (err) {
    // Never let a notification failure surface to the caller — see comment
    // above. Logged only.
    console.error('notifyUser error:', err.message);
  }
}

// A minimal plain-text-in-HTML email, separate from utils/email.js's
// templated sends (welcome/verify/reset/etc.) since these are short,
// dynamic, per-event notices rather than fixed templates.
async function sendPlainEmail(to, subject, text) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('[Notify] EMAIL_USER / EMAIL_PASS not set — notification email not sent');
    return;
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto"><p>${text}</p></div>`,
    });
  } catch (err) {
    console.error('Notification email send error:', err.message);
  }
}

// Separate from utils/sms.js's sendOtpSms/sendWelcomeSms (fixed-copy sends)
// — this one carries whatever short dynamic text notifyUser was given.
async function sendPlainSms(to, text) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    console.log('[Notify] Twilio SMS env vars not set — notification SMS not sent');
    return;
  }
  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ to, from: process.env.TWILIO_PHONE_NUMBER, body: text });
  } catch (err) {
    console.error('Notification SMS send error:', err.message);
  }
}

module.exports = { notifyUser };
