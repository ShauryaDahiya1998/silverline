// Generic "are you sure?" popup — Cancel/Confirm, same rounded-card style as
// ErrorModal.jsx so every app-wide dialog looks like one family. Used by
// Settings.jsx (Logout) and DeleteAccount.jsx's first step; render with
// `open` false/true rather than mounting/unmounting so callers can keep
// state simple.
// `danger` (red) vs `warning` (lighter amber) give the confirm button a
// severity that matches the action — red for something destructive like
// Delete account, a lighter amber (deliberately further from red than a
// straight orange) for something disruptive-but-reversible like Logout so
// the two never read as the same "danger" color, plain green for everything
// else.
export default function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, warning, onConfirm, onCancel }) {
  if (!open) return null;
  const confirmBg = danger ? 'bg-red-600' : warning ? 'bg-amber-500' : '';
  // z-[2400] — must outrank every popup it can be triggered from while that
  // popup is still open (HelpDetailPopup/MapView detail popup are z-[2000],
  // HelpStatus modals/ProfilePopup/TermsModal are z-[2200], PhotoLightbox is
  // z-[2300]). At the old z-[999] this rendered behind those popups —
  // invisible and unclickable, just an extra dark backdrop stacking
  // underneath — which is what made Apply/Request look like it silently
  // did nothing.
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2400] p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
        {title && <h3 className="text-base font-bold text-gray-800 mb-2">{title}</h3>}
        {message && <p className="text-sm text-gray-600 mb-6 whitespace-pre-line">{message}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onCancel}
            className="flex-1 border border-gray-300 text-gray-600 px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-gray-50 transition">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm text-white transition hover:opacity-90 ${confirmBg}`}
            style={confirmBg ? {} : { backgroundColor: '#3a6b00' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
