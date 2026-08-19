// Shared between Home (Dashboard.jsx) and the Help Status page — a single
// source of truth for the five-stage help lifecycle so both stay in sync:
// Initiated (posted, no request yet) -> Requested (a beneficiary/helper
// select has gone out, pending response) -> Matched (accepted) ->
// Scheduled (matched, with a future date set) -> Completed.
export const STATUS_COLORS = {
  'Initiated': '#9ca3af',
  'Requested': '#f59e0b',
  'Matched': '#579500',
  'Scheduled': '#2563eb',
  'Completed': '#000000',
  'Deleted': '#dc2626',
};

// helps.status doesn't have its own "requested"/"scheduled" values in the
// database — pending assignments read as Requested, confirmed ones read as
// Matched (or Scheduled, derived below).
//
// adminApproved gates the 'confirmed' (assignment-level) case only: a help
// item can only actually become Matched once an admin has signed off on it
// (manually, or via an auto-approval rule) — a party accepting on the Help
// page by itself isn't enough, so until then it still reads as Requested.
// Defaults to true so call sites passing raw helps.status (which is only
// ever set to 'assigned' once that approval has already happened — see
// PUT /assignments/:id/respond) don't need to pass anything extra.
//
// bothScheduled — once admin-approved, the item's creator and the other
// matched party ("consumer") each tick their own "is the delivery
// scheduled?" box on the Help page (PUT /assignments/:id/ack) instead of
// the old Cancel/Modify/Delete row; once BOTH have ticked it, the item
// reads as Scheduled. Purely a display override here — same as the
// scheduledDate check it replaces, it never touches the stored status
// itself (only "completed" does that, for real, once both tick that one).
export function getStatusLabel(status, scheduledDate, adminApproved = true, bothScheduled = false) {
  const map = {
    open: 'Initiated', pending: 'Requested',
    assigned: 'Matched', confirmed: adminApproved ? 'Matched' : 'Requested',
    completed: 'Completed', cancelled: 'Deleted',
  };
  let label = map[status] || status;
  const isApproved = status === 'assigned' || (status === 'confirmed' && adminApproved);
  if (isApproved && (bothScheduled || (scheduledDate && new Date(scheduledDate) > new Date()))) {
    label = 'Scheduled';
  }
  return label;
}

// A viewer's own assignment_status normally takes priority over the help
// item's own status (helps.status lags behind — see the comment on GET
// /help's admin route) so a still-pending request reads as Requested even
// before the item's creator has accepted anyone. But once the help item
// itself is actually Completed, that's real and final — every viewer
// (creator, the matched consumer, admin, and any OTHER requester whose own
// request was simply never accepted) should see the same Completed status,
// not have a losing requester stuck showing their own long-dead 'pending'
// assignment_status forever. Used by every Home/Admin list's own row
// normalizer instead of the old bare `assignment_status || status`.
export function resolveDisplayStatus(assignmentStatus, helpStatus) {
  return helpStatus === 'completed' ? helpStatus : (assignmentStatus || helpStatus);
}

export const formatDate = (d) => d ? new Date(d).toLocaleDateString() : '—';

// "DD Mon HH:MM hours Time Zone", e.g. "14 Aug 14:32 hours GMT+2" — used for
// the Help page's admin Requests list to show exactly when a request was
// approved (see HelpStatus.jsx), rather than just the date.
export const formatDateTime = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleDateString(undefined, { month: 'short' });
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  let tz = '';
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date);
    tz = parts.find(p => p.type === 'timeZoneName')?.value || '';
  } catch { /* Intl.DateTimeFormat's timeZoneName isn't supported everywhere — falls back to no timezone suffix rather than throwing. */ }
  return `${day} ${month} ${time} hours${tz ? ` ${tz}` : ''}`;
};

// Surname derivation shared with MapView.jsx's own copy of this same logic
// (see task history) — last whitespace-split token of the full name. Used
// wherever a person's nickname isn't set and we need something better than
// their full name (privacy — a full name is more than the UI should show by
// default).
export const deriveSurname = (fullName) => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
};

// A person's display name for request/counterpart rows app-wide: nickname
// first, then surname (not the full name), then a generic fallback.
export const displayName = (person) => person?.nickname || deriveSurname(person?.name) || 'Someone';

// Help ID shown in the Help ongoing / Help history tables — X + a 3-letter
// block + a 4-digit counter, e.g. XAAA0001, XAAA0002 ... XAAA9999, XAAB0001,
// ... The letter block only advances once the current one fills up (9999
// items), so it scales to 26^3 x 9999 well beyond any real list length.
// sequence is 1-based (i.e. row index + 1).
export function formatHelpId(sequence) {
  const letterIndex = Math.floor((sequence - 1) / 9999);
  const withinBlock = ((sequence - 1) % 9999) + 1;
  const c1 = String.fromCharCode(65 + (Math.floor(letterIndex / 676) % 26));
  const c2 = String.fromCharCode(65 + (Math.floor(letterIndex / 26) % 26));
  const c3 = String.fromCharCode(65 + (letterIndex % 26));
  return `X${c1}${c2}${c3}${String(withinBlock).padStart(4, '0')}`;
}
