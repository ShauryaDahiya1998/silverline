import { useEffect, useState } from 'react';
import api from '../api';
import { formatDate } from '../utils/helpStatus';
import PhotoLightbox from './PhotoLightbox';
import ConfirmModal from './ConfirmModal';

// Same role-worded logistics wording as MapView.jsx's own copy (kept local
// rather than shared — small, page-specific constant, same pattern as
// HelpStatus.jsx's own duplicate of this).
const LOGISTICS_OPTION_LABEL = {
  helper: { pickup: 'Pick up from my location', dropoff: 'I can drop off' },
  beneficiary: { pickup: 'I can pick up', dropoff: 'Drop off at my location' },
};
const LOGISTICS_SECTION_LABEL = { helper: 'Delivery preference', beneficiary: 'Collection preference' };

// Help detail popup — Help ID, Date created, Item, Description, Quantity,
// New/Used (if applicable), Photos, Location, and Cancel/Request actions.
// Mirrors MapView.jsx's own detailHelp popup (same fields, same Select ->
// Request flow via POST /assignments/apply|request) so a help item reads
// the same way everywhere it can be requested from — Map View's "In this
// map view" list/selected-person panel, and now the Remar Store category
// list (see StoreCategoryList.jsx). Unlike Map View's version this one has
// no "person it belongs to" field, since every Store item's creator is the
// same fixed Remar Store account — nothing per-item to show there.
// isAdmin: every Store item's creator is (one of) Remar Store's own system
// accounts, which admin acts as — so admin browsing the Store is always
// looking at their own items, and gets no Request/Apply button, just Close
// (see StoreCategoryList.jsx).
export default function HelpDetailPopup({ help, onClose, isHelper, isAdmin, onSent }) {
  const [acceptedLogistics, setAcceptedLogistics] = useState([]);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState(null);
  // Confirm-before-send (item 4) — Request/Apply now asks "are you sure?"
  // first rather than firing straight off the button, same ConfirmModal
  // pattern already used app-wide for Delete/Revoke/Withdraw.
  const [confirmSend, setConfirmSend] = useState(false);

  useEffect(() => { setAcceptedLogistics([]); setError(''); }, [help?.id]);

  if (!help) return null;

  const toggleLogistics = (v) => setAcceptedLogistics((prev) =>
    (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const handleRequest = async () => {
    setSelecting(true);
    setError('');
    try {
      const endpoint = isHelper ? '/assignments/apply' : '/assignments/request';
      await api.post(endpoint, { help_row_id: help.id, logistics_preference: acceptedLogistics.length ? acceptedLogistics : undefined });
      onSent && onSent({ type: 'sent', text: isHelper ? 'Application sent.' : 'Request sent.' });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send this request — please try again.');
    } finally {
      setSelecting(false);
    }
  };

  const hasLogisticsOptions = Array.isArray(help.logistics_preference) && help.logistics_preference.length > 0;
  // my_assignment_status (see GET /help/store) is this viewer's own latest
  // assignment on the item, if any — once it exists, a second Request/Apply
  // from the same person is blocked, while other viewers who haven't
  // applied yet are untouched (they have no my_assignment_status at all).
  const alreadyRequested = Boolean(help.my_assignment_status);
  const canRequest = help.status === 'open' && !alreadyRequested;
  const requestDisabled = selecting || !canRequest || (hasLogisticsOptions && acceptedLogistics.length === 0);
  // Item 5: Online items show as such; otherwise city/pincode (GET
  // /help/store already strips the full confirm_street address here — this
  // popup is reached from browsing, before any request exists).
  const location = help.is_online ? 'Online' : [help.location_city, help.location_pincode].filter(Boolean).join(', ');

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] px-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-sm font-semibold remar-green mb-4">Help details</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Help ID</p>
                <p className="text-sm font-semibold text-gray-800">{help.help_id || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Date created</p>
                <p className="text-sm font-semibold text-gray-800">{formatDate(help.created_at)}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Item</p>
              <p className="text-sm font-semibold text-gray-800">{help.title || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Description</p>
              <p className="text-sm text-gray-700">{help.description || 'No additional description provided'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Quantity</p>
                <p className="text-sm font-semibold text-gray-800">
                  {help.quantity != null ? `${help.quantity} ${help.unit || ''}`.trim() : '—'}
                </p>
              </div>
              {help.condition && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">New / Used</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {help.condition}
                    {help.condition === 'Used' && help.age_value ? ` — ${help.age_value} ${help.age_unit || ''}`.trim() : ''}
                  </p>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Location</p>
              <p className="text-sm font-semibold text-gray-800">{location || 'Not specified'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Photos</p>
              {Array.isArray(help.photo_urls) && help.photo_urls.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {help.photo_urls.map((src, idx) => (
                    <button key={idx} type="button" onClick={() => setLightboxSrc(src)} className="block">
                      <img src={src} alt={`Photo ${idx + 1}`}
                        className="w-16 h-16 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition cursor-zoom-in" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No photos uploaded</p>
              )}
            </div>
            {hasLogisticsOptions && (
              <div>
                <p className="text-xs text-gray-400 mb-1.5">
                  {LOGISTICS_SECTION_LABEL[isHelper ? 'helper' : 'beneficiary']} — select the one(s) that work for you
                </p>
                <div className="space-y-1.5">
                  {help.logistics_preference.map((v) => (
                    <label key={v} className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={acceptedLogistics.includes(v)}
                        onChange={() => toggleLogistics(v)} className="w-4 h-4 accent-[#3a6b00]" />
                      <span className="text-sm text-gray-700">
                        {LOGISTICS_OPTION_LABEL[isHelper ? 'helper' : 'beneficiary'][v] || v}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {alreadyRequested ? (
              <p className="text-xs text-amber-600">
                {isHelper ? "You've already applied for this item." : "You've already requested this item."}
              </p>
            ) : !canRequest && (
              <p className="text-xs text-amber-600">This item is no longer available to request.</p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          {/* Admin is this item's own creator (see isAdmin note above) —
              clicking outside the popup already dismisses it, so no button
              row at all here, not even a Close button. */}
          {!isAdmin && (
            <div className="flex items-center gap-3 mt-5">
              <button type="button" onClick={onClose} disabled={selecting}
                className="flex-1 text-sm font-semibold rounded-lg py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={() => setConfirmSend(true)} disabled={requestDisabled}
                className="flex-1 text-white font-semibold text-sm rounded-lg py-2.5 transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#3a6b00' }}>
                {selecting ? 'Sending…' : (isHelper ? 'Apply' : 'Request')}
              </button>
            </div>
          )}
        </div>
      </div>
      <ConfirmModal open={confirmSend}
        title={isHelper ? 'Are you sure you want to apply?' : 'Are you sure you want to request?'}
        confirmLabel={isHelper ? 'Apply' : 'Request'}
        onConfirm={() => { setConfirmSend(false); handleRequest(); }}
        onCancel={() => setConfirmSend(false)} />
      <PhotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </>
  );
}
