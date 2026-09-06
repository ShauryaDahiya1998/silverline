// Twilio SMS — same "gracefully no-op if not configured" pattern as
// utils/email.js, so the app still runs before credentials are added.
// Uses the Account SID + Auth Token (full account permissions, no separate
// scoping needed — simpler than a Standard API Key for a single server).
function getClient() {
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) return null;
const twilio = require('twilio');
return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function sendOtpSms(to, code) {
// Always print the code to the server terminal, regardless of whether the
// Twilio send below actually succeeds — lets you complete registration by
// reading the code here while real SMS delivery is unavailable/misconfigured.
console.log(`[OTP] code for ${to} is ${code}`);
const client = getClient();
if (!client) {
console.log('[OTP] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER not set — SMS not attempted');
return;
}
try {
console.log(`Sending OTP SMS to ${to}`);
await client.messages.create({
to,
from: process.env.TWILIO_PHONE_NUMBER,
body: `Your REMAR verification code is ${code}. It expires in 10 minutes.`,
});
} catch (err) {
console.error('SMS send error:', err.message);
}
}

// Sent right after registration completes — mirrors sendWelcomeEmail. Only
// ever called once the account + profile have both been committed to the
// database (see routes/helpers.js / routes/beneficiaries.js POST
// /register), so it never goes out for a registration that didn't actually
// finish.
async function sendWelcomeSms(to) {
  console.log(`Sending registration confirmation SMS to ${to}`);
  const client = getClient();
  if (!client) {
    console.log('[SMS] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER not set — SMS not attempted');
    return;
  }
  try {
    await client.messages.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      body: 'Welcome to REMAR Schweiz — your account is ready to use.',
    });
  } catch (err) {
    console.error('Welcome SMS error:', err.message);
  }
}

// Settings > App preferences > Notifications — WhatsApp channel (see
// utils/notifier.js). Reuses the same Twilio account as SMS: no separate
// integration needed, just a WhatsApp-enabled Twilio sender number
// (TWILIO_WHATSAPP_NUMBER — for testing, Twilio's own sandbox number works)
// and the `whatsapp:` prefix Twilio's API uses to route a message over
// WhatsApp instead of plain SMS. Gracefully no-ops (like every other send
// function here) if that number isn't configured, even if the base Twilio
// credentials are.
async function sendWhatsapp(to, body) {
  if (!process.env.TWILIO_WHATSAPP_NUMBER) {
    console.log('[WhatsApp] TWILIO_WHATSAPP_NUMBER not set — WhatsApp message not attempted');
    return;
  }
  const client = getClient();
  if (!client) {
    console.log('[WhatsApp] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER not set — WhatsApp message not attempted');
    return;
  }
  try {
    await client.messages.create({
      to: `whatsapp:${to}`,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      body,
    });
  } catch (err) {
    console.error('WhatsApp send error:', err.message);
  }
}

module.exports = { sendOtpSms, sendWelcomeSms, sendWhatsapp };
