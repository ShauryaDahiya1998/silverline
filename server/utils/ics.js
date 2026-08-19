// Hand-rolled .ics (iCalendar) builder for the Help Status page's optional
// post-match Schedule feature (item 12) — no calendar API is wired into this
// app (no Zoom/Google Calendar OAuth), so a standards-compliant VEVENT
// attached to a normal email is what actually gets an invite into someone's
// calendar app without any extra integration. Kept dependency-free since the
// format itself is small and stable.

function toIcsUtc(date) {
  return new Date(date).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// Per RFC 5545 §3.3.11 — backslash, semicolon, comma, and newline all need
// escaping in TEXT values (SUMMARY/DESCRIPTION/LOCATION).
function escapeIcsText(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// uid should stay the same across REQUEST -> updated REQUEST -> CANCEL for
// one Schedule so calendar apps treat them as the same event rather than
// three unrelated ones; sequence must increase by at least 1 each time the
// event's details (or method) change, per RFC 5545 §3.8.7.4.
function buildIcs({ uid, sequence = 0, method = 'REQUEST', start, durationMinutes = 30, summary, description, location, organizerEmail, attendeeEmails = [] }) {
  const dtStart = toIcsUtc(start);
  const dtEnd = toIcsUtc(new Date(new Date(start).getTime() + durationMinutes * 60000));
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//REMAR Schweiz//Help Schedule//EN',
    'VERSION:2.0',
    `METHOD:${method}`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    description ? `DESCRIPTION:${escapeIcsText(description)}` : null,
    location ? `LOCATION:${escapeIcsText(location)}` : null,
    organizerEmail ? `ORGANIZER:mailto:${organizerEmail}` : null,
    ...attendeeEmails.map(e => `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${e}`),
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}

module.exports = { buildIcs };
