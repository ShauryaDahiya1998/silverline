const nodemailer = require('nodemailer');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

// Same Gmail SMTP pattern already used in routes/assignments.js — reusing it
// here too so there's a single email credential to configure (EMAIL_USER /
// EMAIL_PASS in server/.env, a Gmail address + App Password).
function getTransporter() {
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
return nodemailer.createTransport({
service: 'gmail',
auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});
}

async function sendEmail(to, subject, html) {
const transporter = getTransporter();
if (!transporter) { console.error('EMAIL_USER / EMAIL_PASS are not set — email not sent'); return; }
try {
await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, html });
} catch (err) {
console.error('Email send error:', err.message);
}
}

// Sent right after registration completes. By this point the person has
// already proven they own this email/phone via the OTP step on the
// Verify-to-register page (see RegisterVerify.jsx + routes/otp.js), so this
// is a thank-you, not another verification step — no link to click.
async function sendWelcomeEmail(to) {
console.log(`Sending welcome email to ${to}`);
await sendEmail(to, 'Welcome to REMAR Schweiz', `
<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#3a6b00">Welcome to REMAR Schweiz</h2>
<p>Thank you for registering — your account is ready to use.</p>
<p style="color:#888;font-size:13px">If you did not register for this account, please contact us.</p>
</div>
`);
}

async function sendVerificationEmail(to, token) {
const link = `${BASE_URL}/verify-email?token=${token}`;
console.log(`Sending verification email to ${to}`);
await sendEmail(to, 'Verify your REMAR account', `
<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#3a6b00">Welcome to REMAR Schweiz</h2>
<p>Thank you for registering. Please verify your email address to activate your account.</p>
<a href="${link}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#3a6b00;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">
Verify Email
</a>
<p style="color:#888;font-size:13px">This link expires in 24 hours. If you did not register, ignore this email.</p>
</div>
`);
}

async function sendPasswordResetEmail(to, token) {
const link = `${BASE_URL}/reset-password?token=${token}`;
await sendEmail(to, 'Reset your REMAR password', `
<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#3a6b00">Password Reset</h2>
<p>We received a request to reset your password. Click the button below to set a new password.</p>
<a href="${link}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#3a6b00;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">
Reset Password
</a>
<p style="color:#888;font-size:13px">This link expires in 1 hour. If you did not request this, ignore this email.</p>
</div>
`);
}

async function sendOtpEmail(to, code) {
console.log(`Sending OTP email to ${to}`);
await sendEmail(to, 'Your REMAR verification code', `
<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#3a6b00">Verify your email</h2>
<p>Enter this code to continue registering with REMAR Schweiz:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#3a6b00;margin:16px 0">${code}</p>
<p style="color:#888;font-size:13px">This code expires in 10 minutes. If you did not request this, ignore this email.</p>
</div>
`);
}

// Settings > My account > Delete account's OTP step — same 6-digit-code
// shape as sendOtpEmail, but its own copy since "continue registering" would
// be a confusing thing to tell someone who's trying to delete their account.
async function sendAccountDeletionOtpEmail(to, code) {
console.log(`Sending account-deletion OTP email to ${to}`);
await sendEmail(to, 'Confirm deleting your REMAR account', `
<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#3a6b00">Confirm account deletion</h2>
<p>Enter this code to permanently delete your REMAR Schweiz account:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#3a6b00;margin:16px 0">${code}</p>
<p style="color:#888;font-size:13px">This code expires in 10 minutes. If you did not request this, you can safely ignore this email — your account will not be deleted.</p>
</div>
`);
}

// Item 12's Schedule feature — sends a plain HTML body plus an .ics
// attachment nodemailer knows how to turn into a real calendar invite
// (icalEvent), to whichever emails are passed in `to` (comma-separated).
// method mirrors the .ics's own METHOD (REQUEST for a new/updated invite,
// CANCEL for a deleted Schedule) so calendar apps handle each correctly.
async function sendCalendarInvite(to, subject, html, icsContent, method = 'REQUEST') {
const transporter = getTransporter();
if (!transporter) { console.error('EMAIL_USER / EMAIL_PASS are not set — calendar invite not sent'); return; }
try {
await transporter.sendMail({
from: process.env.EMAIL_USER, to, subject, html,
icalEvent: { method, content: icsContent },
});
} catch (err) {
console.error('Calendar invite email error:', err.message);
}
}

// Admin Home > Contribution certificate service — Issue button (see
// routes/certificates.js POST /requests/:id/issue). Unlike the other emails
// here this carries a real attachment (the generated PDF, see utils/pdf.js)
// rather than just an HTML body, so it uses the same attachments option
// sendCalendarInvite uses icalEvent for. Returns true/false rather than
// throwing so the route can decide whether to mark the request 'issued' —
// no email actually sent should never look like a successful issue.
async function sendCertificateEmail(to, helperName, pdfBuffer, filename) {
const transporter = getTransporter();
if (!transporter) { console.error('EMAIL_USER / EMAIL_PASS are not set — certificate email not sent'); return false; }
try {
await transporter.sendMail({
from: process.env.EMAIL_USER, to,
subject: 'Your REMAR Schweiz Certificate of Service',
html: `
<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#3a6b00">Certificate of Service</h2>
<p>Hi ${helperName},</p>
<p>Thank you for your contribution to REMAR Schweiz. Your Certificate of Service is attached to this email as a PDF.</p>
</div>
`,
attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
});
return true;
} catch (err) {
console.error('Certificate email error:', err.message);
return false;
}
}

module.exports = { sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail, sendOtpEmail, sendAccountDeletionOtpEmail, sendCalendarInvite, sendCertificateEmail };
