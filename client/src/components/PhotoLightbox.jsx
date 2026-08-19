// Full-size photo viewer — tapping any help-item photo thumbnail (Help
// Status, Map View's detail popup) opens the same image here instead of
// staying stuck at the small 80x80/64x64 grid size. Click anywhere (or the
// close button) to dismiss.
export default function PhotoLightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2300] px-4 py-8" onClick={onClose}>
      <button type="button" onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      <img src={src} alt="Full size" className="max-w-full max-h-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
