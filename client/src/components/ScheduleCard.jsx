import { useEffect, useRef, useState } from 'react';
import api from '../api';
import ConfirmModal from './ConfirmModal';

// Item 12 — optional post-match Schedule, shown on the Help Status page once
// a Help ID is Matched. Date/time + duration (defaulted from the item's own
// quantity when it's in hours/minutes, else 30 min), a Jitsi meeting link for
// an Online item or a venue field for a physical one, and a button to email
// both parties a calendar invite (PUT /assignments/:id/schedule). Once sent,
// the card freezes to a read-only summary with Modify/Delete instead of the
// form — re-opened via Modify, which resends an updated invite on save.
// Once both parties have ticked "Is the delivery completed?" (help.status
// flips to completed — see isCompleted prop), Modify/Delete are dropped too,
// so the card is fully frozen with no further way to change the schedule.
function defaultDurationMinutes(help) {
  if (help?.unit === 'hour(s)' && Number(help.quantity) > 0) return Math.round(Number(help.quantity) * 60);
  if (help?.unit === 'min' && Number(help.quantity) > 0) return Math.round(Number(help.quantity));
  return 30;
}

// Item 4 — the venue field defaults to the creator's own Confirm location
// for this Help ID (same full address New Help's ConfirmLocationField
// collected), falling back to just city/pincode if the fuller address
// wasn't revealed to this viewer.
function defaultVenue(help) {
  if (!help) return '';
  if (help.confirm_street || help.confirm_house_number) {
    return [help.confirm_street, help.confirm_house_number, help.confirm_city, help.confirm_pincode].filter(Boolean).join(', ');
  }
  return [help.location_city, help.location_pincode].filter(Boolean).join(', ');
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:MM" in local time, not
// an ISO string.
function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ScheduleCard({ help, assignmentId, calendarDatetime, calendarDurationMinutes, calendarMeetingLink, calendarVenue, calendarSentAt, isCompleted, onUpdated }) {
  const isSent = !!calendarSentAt;
  const [editing, setEditing] = useState(!isSent);
  const [datetime, setDatetime] = useState(toDatetimeLocalValue(calendarDatetime));
  const [duration, setDuration] = useState(calendarDurationMinutes || defaultDurationMinutes(help));
  const [venue, setVenue] = useState(calendarVenue || defaultVenue(help));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Item 4 — Nominatim type-to-search suggestions once the creator edits
  // the venue away from its default, same pattern as ConfirmLocationField's
  // manual-entry mode.
  const [venueSuggestions, setVenueSuggestions] = useState([]);
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);
  // Seeded with the prefilled default so the suggestions dropdown doesn't
  // pop open on load — only once the creator actually edits the venue away
  // from it does the search kick in.
  const lastPickedVenueRef = useRef(calendarVenue || defaultVenue(help));

  // Re-sync local form state whenever the stored schedule changes (e.g.
  // after a successful send, or the counterpart list refetches).
  useEffect(() => {
    setEditing(!calendarSentAt);
    setDatetime(toDatetimeLocalValue(calendarDatetime));
    setDuration(calendarDurationMinutes || defaultDurationMinutes(help));
    const v = calendarVenue || defaultVenue(help);
    setVenue(v);
    lastPickedVenueRef.current = v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarDatetime, calendarDurationMinutes, calendarVenue, calendarSentAt]);

  useEffect(() => {
    if (!venue.trim() || venue === lastPickedVenueRef.current) {
      setVenueSuggestions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(venue)}`);
        const data = await res.json();
        setVenueSuggestions(data);
        setShowVenueSuggestions(true);
      } catch {
        setVenueSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [venue]);

  const pickVenueSuggestion = (s) => {
    lastPickedVenueRef.current = s.display_name;
    setVenue(s.display_name);
    setVenueSuggestions([]);
    setShowVenueSuggestions(false);
  };

  const handleSend = async () => {
    if (!datetime) { setError('Pick a date and time first.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await api.put(`/assignments/${assignmentId}/schedule`, {
        datetime: new Date(datetime).toISOString(),
        duration_minutes: Number(duration) > 0 ? Number(duration) : 30,
        venue: help?.is_online ? null : (venue || null),
      });
      onUpdated?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send the calendar invite. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/assignments/${assignmentId}/schedule`);
      setConfirmDelete(false);
      onUpdated?.();
    } catch {
      setConfirmDelete(false);
      setError('Could not delete the invite. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const formattedDatetime = calendarDatetime
    ? new Date(calendarDatetime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  return (
    <div className="bg-white rounded-2xl shadow-lg p-5 mb-5 space-y-3">
      <h2 className="font-semibold remar-green text-sm">Schedule <span className="text-xs text-gray-400 font-normal">(optional)</span></h2>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {!editing ? (
        <>
          <p className="text-sm text-gray-700"><span className="text-gray-400">Date &amp; time:</span> {formattedDatetime}</p>
          <p className="text-sm text-gray-700"><span className="text-gray-400">Duration:</span> {calendarDurationMinutes} min</p>
          <p className="text-sm text-gray-700">
            <span className="text-gray-400">{calendarMeetingLink ? 'Meeting link:' : 'Venue:'}</span>{' '}
            {calendarMeetingLink ? <a href={calendarMeetingLink} target="_blank" rel="noreferrer" className="text-remar underline">{calendarMeetingLink}</a> : (calendarVenue || 'Not specified')}
          </p>
          <p className="text-xs text-gray-400">Calendar invite sent.</p>
          {!isCompleted && (
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setEditing(true)}
                className="flex-1 text-sm font-semibold px-4 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                Modify
              </button>
              <button type="button" onClick={() => setConfirmDelete(true)}
                className="flex-1 text-sm font-semibold px-4 py-2 rounded-full border border-red-300 text-red-600 hover:bg-red-50 transition">
                Delete
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Date &amp; time</label>
            <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Duration (minutes)</label>
            <input type="number" min="1" value={duration} onChange={e => setDuration(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
          </div>
          {help?.is_online ? (
            <p className="text-xs text-gray-500">A Google Meet/Zoom-style video link is created automatically for this online Help ID and included in the invite.</p>
          ) : (
            <div className="relative">
              <label className="text-xs text-gray-500 mb-1 block">Venue</label>
              <input type="text" value={venue}
                onChange={e => setVenue(e.target.value)}
                onFocus={() => venueSuggestions.length && setShowVenueSuggestions(true)}
                onBlur={() => setTimeout(() => setShowVenueSuggestions(false), 150)}
                placeholder="Where should this take place?"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
              {showVenueSuggestions && venueSuggestions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {venueSuggestions.map((s, i) => (
                    <button key={i} type="button" onMouseDown={() => pickVenueSuggestion(s)}
                      className="block w-full text-left px-3 py-2 text-[11px] hover:bg-gray-100 truncate">
                      {s.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            {isSent && (
              <button type="button" onClick={() => { setEditing(false); setError(''); }}
                className="flex-1 text-sm font-semibold px-4 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                Cancel
              </button>
            )}
            <button type="button" onClick={handleSend} disabled={submitting}
              className="flex-1 text-white font-semibold text-sm rounded-full py-2 transition disabled:opacity-50"
              style={{ backgroundColor: '#3a6b00' }}>
              {submitting ? 'Sending…' : 'Send calendar invite'}
            </button>
          </div>
        </>
      )}

      <ConfirmModal open={confirmDelete} title="Delete this Schedule?"
        message="Both parties will receive a cancellation email. This can't be undone."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'} danger
        onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} />
    </div>
  );
}
