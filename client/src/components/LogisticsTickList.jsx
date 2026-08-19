// Read-only display of a Help ID's delivery/collection preference — one row
// per selected option, each with a green ticked box, instead of the old
// single "Pick up from my location + I can drop off" joined line. Shared
// between HelpStatus.jsx (a Help ID's own detail page) and MapView.jsx
// (Universe view's Help detail popup) so both read the exact same way.
export default function LogisticsTickList({ label, values, valueLabels }) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return (
    <div>
      {label && <p className="text-xs text-gray-400 mb-1.5">{label}</p>}
      <div className="space-y-1.5">
        {values.map(v => (
          <div key={v} className="flex items-center gap-2">
            <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 text-white text-[10px] leading-none"
              style={{ backgroundColor: '#3a6b00' }}>
              ✓
            </span>
            <span className="text-sm font-semibold text-gray-800">{valueLabels[v] || v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
