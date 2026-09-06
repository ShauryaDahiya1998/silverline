require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Safety net — every route handler already has its own try/catch, and the
// PG pool has its own 'error' listener (see database/db.js), but this stops
// any error that still slips through from silently killing the whole server
// (Node's default behavior for an unhandled promise rejection is to exit).
process.on('unhandledRejection', (err) => {
console.error('Unhandled promise rejection (server kept running):', err);
});
process.on('uncaughtException', (err) => {
console.error('Uncaught exception (server kept running):', err);
});

const app = express();

// Ensure exports directory exists
const exportsDir = path.join(__dirname, 'exports');
if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir);

app.use(cors());
// Registration payloads can include base64 photo/voice-note data URLs, which
// comfortably exceed Express's 100kb default JSON body limit.
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Apple App Site Association — required at this exact root path (no
// extension, served over HTTPS) for the native iOS app's "Associated
// Domains: webcredentials:" entitlement to be verified by iOS. This is what
// lets the iOS app's own Face ID/Touch ID passkey ceremony (see
// client/ios/App/App/PasskeyPlugin.swift) operate against this same
// WEBAUTHN_RP_ID domain that the browser/web version already uses (see
// routes/webauthn.js) — same server-side verification code handles both,
// no server logic differs between a browser-originated and an
// app-originated credential. Team ID + bundle ID below must match
// DEVELOPMENT_TEAM / PRODUCT_BUNDLE_IDENTIFIER in
// client/ios/App/App.xcodeproj/project.pbxproj.
app.get('/.well-known/apple-app-site-association', (req, res) => {
res.json({ webcredentials: { apps: ['ZJZWP62F7S.ch.remarschweiz.app'] } });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/helpers', require('./routes/helpers'));
app.use('/api/beneficiaries', require('./routes/beneficiaries'));
app.use('/api/help', require('./routes/help'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/drafts', require('./routes/drafts'));
app.use('/api/otp', require('./routes/otp'));
app.use('/api/webauthn', require('./routes/webauthn'));
app.use('/api/certificates', require('./routes/certificates'));
app.use('/api/honors', require('./routes/honors'));
app.use('/api/support', require('./routes/support'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/auto-match-rules', require('./routes/autoMatch'));
app.use('/api/donations', require('./routes/donations'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/preferences', require('./routes/preferences'));
app.use('/api/push-tokens', require('./routes/pushTokens'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/bank-accounts', require('./routes/bankAccounts'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Serve React frontend in production
const clientBuild = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientBuild)) {
app.use(express.static(clientBuild));
app.get('*', (req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`REMAR server running on port ${PORT}`));
