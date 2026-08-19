-- REMAR Database Schema

-- Users table (admins, helpers, beneficiaries)
CREATE TABLE IF NOT EXISTS users (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
email VARCHAR(255) UNIQUE NOT NULL,
phone VARCHAR(20) UNIQUE,
password_hash VARCHAR(255) NOT NULL,
role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'helper', 'beneficiary')),
created_at TIMESTAMP DEFAULT NOW(),
-- Admin-only "seen" markers for the Donation/Escalations "new" highlight on
-- Admin Home > Services — see db.js's migration comment.
donations_seen_at TIMESTAMP,
escalations_seen_at TIMESTAMP,
-- Settings > App preferences (per-user, cosmetic/display only — see
-- server/routes/preferences.js). currency is a label swap, not real FX
-- conversion; language picks which translation dictionary the client uses;
-- font_size (%) scales the client's root font-size, which every rem-based
-- Tailwind text utility scales off; color_theme picks a CSS filter applied
-- app-wide on the client.
currency VARCHAR(5) NOT NULL DEFAULT 'Fr',
language VARCHAR(10) NOT NULL DEFAULT 'en',
font_size INTEGER NOT NULL DEFAULT 100,
color_theme VARCHAR(10) NOT NULL DEFAULT 'standard'
);

-- Helpers (formerly "volunteers" — renamed for consistency with the app's
-- "Helper" role/terminology. See db.js's one-time table rename)
CREATE TABLE IF NOT EXISTS helpers (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
-- SET NULL (not CASCADE) — deleting the login/users row detaches this
-- profile rather than destroying it, so completed matches, donations, and
-- chat history that reference this helper by id keep working and can show
-- "Deleted account" instead of silently losing the other party's history.
-- See server/utils/accountDeletion.js, which anonymizes this row's PII and
-- nulls user_id itself before the users row is deleted.
user_id UUID REFERENCES users(id) ON DELETE SET NULL,
name VARCHAR(255) NOT NULL,
nickname VARCHAR(100),
photo_url TEXT,
voice_note_url TEXT,
date_of_birth DATE,
age_group VARCHAR(20),
gender VARCHAR(20),
address TEXT,
street VARCHAR(255),
house_number VARCHAR(20),
city VARCHAR(100),
pincode VARCHAR(20),
latitude DECIMAL(10,8),
longitude DECIMAL(11,8),
skills TEXT[],
availability JSONB,
phone VARCHAR(20),
personality_notes TEXT,
about_me TEXT,
contact_preference JSONB,
preferred_regions JSONB,
-- Only populated when 'Professional services' is one of this helper's
-- skills — collected at registration (and editable via profile later),
-- shown to the admin viewing this helper's profile. Free text, capped at
-- 100 chars client-side.
professional_license VARCHAR(100),
professional_experience VARCHAR(100),
created_at TIMESTAMP DEFAULT NOW()
);

-- Beneficiaries
CREATE TABLE IF NOT EXISTS beneficiaries (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
-- SET NULL — see the matching comment on helpers.user_id above.
user_id UUID REFERENCES users(id) ON DELETE SET NULL,
name VARCHAR(255) NOT NULL,
nickname VARCHAR(100),
photo_url TEXT,
voice_note_url TEXT,
date_of_birth DATE,
age_group VARCHAR(20),
gender VARCHAR(20),
address TEXT,
street VARCHAR(255),
house_number VARCHAR(20),
city VARCHAR(100),
pincode VARCHAR(20),
latitude DECIMAL(10,8),
longitude DECIMAL(11,8),
support_needs TEXT[],
time_preferences JSONB,
phone VARCHAR(20),
personality_notes TEXT,
about_me TEXT,
contact_preference JSONB,
preferred_regions JSONB,
created_at TIMESTAMP DEFAULT NOW()
);

-- Help requests/offers (formerly "tasks" — renamed for consistency with the
-- app's "Help" terminology. See db.js's one-time table rename)
CREATE TABLE IF NOT EXISTS helps (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
title VARCHAR(255) NOT NULL,
description TEXT,
created_by UUID REFERENCES users(id) ON DELETE CASCADE,
status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'completed', 'cancelled')),
required_skills TEXT[],
location TEXT,
scheduled_date TIMESTAMP,
duration_hours DECIMAL(4,1),
value DECIMAL(10,2),
category VARCHAR(100),
sub_category VARCHAR(100),
quantity DECIMAL(10,2),
unit VARCHAR(20),
condition VARCHAR(10),
age_value DECIMAL(10,2),
age_unit VARCHAR(10),
help_id VARCHAR(20) UNIQUE,
created_ip VARCHAR(64),
created_user_agent TEXT,
device_type VARCHAR(20),
device_brand VARCHAR(50),
photo_urls TEXT[],
-- Delivery/Collection preference (Food/Toiletries/Clothes only) — canonical
-- 'pickup'/'dropoff' values, see db.js's migration comment for the full
-- helper-vs-beneficiary label mapping.
logistics_preference TEXT[],
-- Set once (assignments.status flips both parties' completed flags true —
-- see PUT /assignments/:id/ack), cleared again if either side unchecks.
-- Only real, meaningful value: starts the 7-day window after which the
-- Chats thread tied to this help item can no longer send messages (see
-- messages.help_row_id below).
completed_at TIMESTAMP,
created_at TIMESTAMP DEFAULT NOW(),
updated_at TIMESTAMP DEFAULT NOW()
);

-- Helper registration drafts (no account exists yet at draft time, so these
-- are gated by an opaque token rather than a user id)
CREATE TABLE IF NOT EXISTS helper_drafts (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
token VARCHAR(64) UNIQUE NOT NULL,
email VARCHAR(255),
data JSONB NOT NULL,
created_at TIMESTAMP DEFAULT NOW(),
updated_at TIMESTAMP DEFAULT NOW()
);

-- One-time passwords sent to verify an email address or phone number before
-- registration begins. code_hash is bcrypt-hashed, never stored in plaintext.
CREATE TABLE IF NOT EXISTS otp_codes (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
identifier VARCHAR(255) NOT NULL,
method VARCHAR(10) NOT NULL CHECK (method IN ('email', 'phone')),
code_hash VARCHAR(255) NOT NULL,
attempts INT DEFAULT 0,
verified BOOLEAN DEFAULT FALSE,
expires_at TIMESTAMP NOT NULL,
created_at TIMESTAMP DEFAULT NOW()
);

-- WebAuthn (Face ID / Fingerprint / platform authenticator) credentials —
-- one row per device a user has enrolled. public_key_jwk is the device's
-- public key only — the private key never leaves the device. (Comments in
-- this file must never contain a semicolon character — db.js splits
-- schema.sql on every literal one to run each statement separately, so one
-- here would break this CREATE TABLE in half.)
CREATE TABLE IF NOT EXISTS webauthn_credentials (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID REFERENCES users(id) ON DELETE CASCADE,
credential_id TEXT UNIQUE NOT NULL,
public_key_jwk JSONB NOT NULL,
sign_count BIGINT DEFAULT 0,
device_label VARCHAR(20),
created_at TIMESTAMP DEFAULT NOW()
);

-- Short-lived challenges for the WebAuthn registration/login ceremonies —
-- same disposable-row pattern as otp_codes above.
CREATE TABLE IF NOT EXISTS webauthn_challenges (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
identifier VARCHAR(255) NOT NULL,
challenge TEXT NOT NULL,
purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('register', 'login')),
expires_at TIMESTAMP NOT NULL,
created_at TIMESTAMP DEFAULT NOW()
);

-- Remar honors — real awards/recognitions granted to a helper by a REMAR
-- admin (e.g. "Volunteer of the month"), not something derived from ratings
-- or completed-help counts. Shown as a count on the helper's My Contribution
-- page. Admins grant/revoke rows via the admin dashboard.
CREATE TABLE IF NOT EXISTS honors (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID REFERENCES users(id) ON DELETE CASCADE,
title VARCHAR(255) NOT NULL,
description TEXT,
awarded_by UUID REFERENCES users(id) ON DELETE SET NULL,
awarded_at TIMESTAMP DEFAULT NOW()
);

-- Past Bot conversations (Settings > Support > Chats). One row per chat
-- session — id is client-generated (crypto.randomUUID()) so the same
-- session can be saved once when the person navigates away without a
-- separate "create" round-trip. messages holds the full transcript.
-- (Comments in this file must never contain a semicolon — db.js splits
-- schema.sql on every literal one to run each statement separately.)
CREATE TABLE IF NOT EXISTS support_chats (
id UUID PRIMARY KEY,
user_id UUID REFERENCES users(id) ON DELETE CASCADE,
messages JSONB NOT NULL,
created_at TIMESTAMP DEFAULT NOW(),
updated_at TIMESTAMP DEFAULT NOW()
);

-- Contact us submissions, tracked as tickets so a person can see whether
-- theirs has been resolved (Settings > Support > Tickets), not just that an
-- email was sent.
CREATE TABLE IF NOT EXISTS support_tickets (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID REFERENCES users(id) ON DELETE CASCADE,
subject VARCHAR(255) NOT NULL,
description TEXT NOT NULL,
status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
created_at TIMESTAMP DEFAULT NOW(),
resolved_at TIMESTAMP
);

-- Messages sent to a person from REMAR (sender_user_id NULL) or from
-- another user (sender_user_id set) — shown under Account > Messages.
-- Nothing sends these yet (no admin compose UI has been requested), so the
-- inbox is honestly empty until that's built.
CREATE TABLE IF NOT EXISTS messages (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
-- SET NULL (not CASCADE) — deleting a user shouldn't destroy the other
-- party's copy of a conversation with them; it just becomes unattributable
-- (see accountDeletion.js/messages.js's "Deleted account" fallback).
recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
sender_name VARCHAR(100) NOT NULL DEFAULT 'REMAR',
subject VARCHAR(255),
body TEXT NOT NULL,
is_read BOOLEAN DEFAULT FALSE,
thread_id UUID,
-- Which help item this thread belongs to — set whenever the conversation
-- was started from a specific help item's Chat button (the only way a
-- person-to-person thread starts today), NULL for REMAR/support threads
-- that aren't about any particular help item. Powers showing the Help ID
-- alongside the other party's name in Settings > My account > Chats, and
-- the 7-day post-completion send lock (see messages.js's isHelpLocked).
help_row_id UUID REFERENCES helps(id) ON DELETE SET NULL,
created_at TIMESTAMP DEFAULT NOW()
);

-- Certificate of Service requests (My Contribution > Request Certificate).
-- Clicking the button no longer self-issues a PDF instantly — it sends a
-- request, scoped to whichever period the person had selected on that
-- page, for a REMAR admin to review and issue.
CREATE TABLE IF NOT EXISTS certificate_requests (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID REFERENCES users(id) ON DELETE CASCADE,
period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('lifetime', 'year', 'month')),
period_value VARCHAR(20),
period_label VARCHAR(50) NOT NULL,
status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'rejected')),
created_at TIMESTAMP DEFAULT NOW(),
resolved_at TIMESTAMP
);

-- Assignments
CREATE TABLE IF NOT EXISTS assignments (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
-- Named help_row_id (not help_id) to stay distinct from helps.help_id, the
-- human-readable code like XAAA0001 — this column is a plain UUID FK.
help_row_id UUID REFERENCES helps(id) ON DELETE CASCADE,
volunteer_id UUID REFERENCES helpers(id) ON DELETE CASCADE,
beneficiary_id UUID REFERENCES beneficiaries(id) ON DELETE CASCADE,
status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
notes TEXT,
on_time BOOLEAN,
rating_received SMALLINT,
rating_given SMALLINT,
admin_approved BOOLEAN NOT NULL DEFAULT FALSE,
-- Mutual post-approval confirmation (Help Status page, once admin-approved):
-- each side independently ticks its own box for each question. 'creator' is
-- whoever created the help item (h.created_by), 'consumer' is the other
-- matched party — same terminology as the admin Requests row's
-- Creator/Consumer labels. Both true for 'scheduled' reads as the Scheduled
-- status (purely derived, like the old scheduled_date-based check); both
-- true for 'completed' actually flips this row's own status (and the help
-- item's) to 'completed' for real — see PUT /assignments/:id/ack.
creator_scheduled BOOLEAN NOT NULL DEFAULT FALSE,
consumer_scheduled BOOLEAN NOT NULL DEFAULT FALSE,
creator_completed BOOLEAN NOT NULL DEFAULT FALSE,
consumer_completed BOOLEAN NOT NULL DEFAULT FALSE,
-- Post-completion feedback + rating (Help Status page's "Help feedback"
-- card, once a match is Completed) — same creator/consumer split as the
-- scheduled/completed acks above, set via PUT /assignments/:id/feedback.
-- Both sides' values live on this one row so GET /help/:id/counterpart can
-- return them together, letting admin see both parties' feedback at once
-- instead of either party being asked to submit on someone else's behalf.
creator_feedback TEXT,
creator_rating SMALLINT,
consumer_feedback TEXT,
consumer_rating SMALLINT,
-- The consumer's own accepted subset of the help item's logistics_preference
-- (Universe view's Select/Request popup) — see db.js's migration comment.
logistics_preference TEXT[],
created_at TIMESTAMP DEFAULT NOW(),
updated_at TIMESTAMP DEFAULT NOW()
);

-- is_active lets an admin switch a rule off without deleting it (its
-- applied_count history stays on record either way). Numbering shown in
-- the UI (Rule 1, Rule 2, ...) is derived from created_at order, not stored
-- here — a rule always keeps the same number relative to the others.
CREATE TABLE IF NOT EXISTS auto_match_rules (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
logic TEXT NOT NULL,
applied_count INTEGER NOT NULL DEFAULT 0,
is_active BOOLEAN NOT NULL DEFAULT TRUE,
created_at TIMESTAMP DEFAULT NOW()
);

-- Donations (Admin Home > Services > Donation) — a helper pays REMAR
-- directly (bank transfer etc., see Donate.jsx); nothing today captures
-- that automatically (no payment processor is wired up), so an admin logs
-- each one manually once it's actually received. helper_id is who gave it;
-- logged_by is which admin recorded it (kept for accountability, not shown
-- in the UI today).
CREATE TABLE IF NOT EXISTS donations (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
helper_id UUID REFERENCES helpers(id) ON DELETE CASCADE,
amount DECIMAL(10,2) NOT NULL,
donated_at DATE NOT NULL,
logged_by UUID REFERENCES users(id) ON DELETE SET NULL,
created_at TIMESTAMP DEFAULT NOW()
);

-- Caches Country/Continent lookups for a given (pincode, city) pair (see
-- server/utils/geo.js) so the admin Reports pivot's Country/Continent row
-- options don't re-hit Nominatim's free postcode-search API on every report
-- load — that API is rate-limited to roughly 1 request/sec and this table
-- lets a pair seen once answer instantly from then on. Keyed on pincode +
-- city together, not pincode alone — the same pincode format recurs across
-- unrelated countries, so pincode-only lookups previously misresolved
-- (Zurich's 8007, Munich's 81243) to the wrong country.
CREATE TABLE IF NOT EXISTS pincode_geo_cache (
pincode VARCHAR(20) NOT NULL,
city VARCHAR(100) NOT NULL,
country VARCHAR(100),
continent VARCHAR(20),
resolved_at TIMESTAMP DEFAULT NOW(),
PRIMARY KEY (pincode, city)
);

-- Settings > My account > Delete account. Deliberately not linked to the
-- user by a foreign key — the whole point is the account row is gone right
-- after this is written, so there's nothing left to reference. Just enough
-- to see why people are leaving, with no PII retained.
CREATE TABLE IF NOT EXISTS account_deletion_feedback (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
role VARCHAR(20),
reason VARCHAR(255),
created_at TIMESTAMP DEFAULT NOW()
);
