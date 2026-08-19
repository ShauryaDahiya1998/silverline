import { useEffect, useRef, useState } from 'react';

// Custom Date of birth picker — replaces the native <input type="date">.
// Opens a popover with a grid-based Month selector (3 cols x 4 rows) and a
// grid-based Year selector (3x3, paginated 9 years at a time) so long-range
// birth-year selection doesn't require the slow native scroller. Once both
// month and year are chosen it shows a day grid to finish the pick.
// Contract: value/onChange use the same 'YYYY-MM-DD' string as the native
// input, so callers don't need to change how date_of_birth is stored.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function DateOfBirthPicker({ value, onChange, required }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('month'); // 'month' | 'year' | 'day'
  const wrapRef = useRef(null);

  const selected = value ? new Date(value + 'T00:00:00') : null;
  const today = new Date();
  const defaultYear = today.getFullYear() - 25;

  const [cursorYear, setCursorYear] = useState(selected ? selected.getFullYear() : defaultYear);
  const [cursorMonth, setCursorMonth] = useState(selected ? selected.getMonth() : today.getMonth());
  const [yearPageStart, setYearPageStart] = useState(Math.floor((selected ? selected.getFullYear() : defaultYear) / 9) * 9);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

  const openPicker = () => {
    setYearPageStart(Math.floor(cursorYear / 9) * 9);
    setView('year');
    setOpen(true);
  };

  const pickYear = (y) => {
    setCursorYear(y);
    setView('month');
  };

  const pickMonth = (m) => {
    setCursorMonth(m);
    setView('day');
  };

  const pickDay = (d) => {
    const mm = String(cursorMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    onChange(`${cursorYear}-${mm}-${dd}`);
    setOpen(false);
  };

  const displayText = selected
    ? selected.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  const firstWeekday = new Date(cursorYear, cursorMonth, 1).getDay();
  const totalDays = daysInMonth(cursorYear, cursorMonth);
  const dayCells = [];
  for (let i = 0; i < firstWeekday; i++) dayCells.push(null);
  for (let d = 1; d <= totalDays; d++) dayCells.push(d);

  const activeBtn = { backgroundColor: '#3a6b00' };

  return (
    <div className="relative" ref={wrapRef}>
      <button type="button" onClick={openPicker}
        className={`w-full border rounded-lg px-4 py-2 text-left focus:outline-none focus:ring-2 focus:ring-remar ${selected ? 'text-gray-800' : 'text-gray-400'}`}>
        {displayText || 'Select date'}
      </button>
      {required && (
        <input type="text" required value={value || ''} readOnly tabIndex={-1}
          className="absolute inset-0 w-full h-full opacity-0 pointer-events-none" aria-hidden="true" />
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3">

          {view === 'year' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => setYearPageStart(s => s - 9)} className="p-1 text-gray-500 hover:text-gray-700">‹</button>
                <span className="text-sm font-semibold remar-green">{yearPageStart} – {yearPageStart + 8}</span>
                <button type="button" onClick={() => setYearPageStart(s => s + 9)} className="p-1 text-gray-500 hover:text-gray-700">›</button>
              </div>
              <p className="text-[10px] text-gray-400 mb-2 text-center">Select year</p>
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 9 }, (_, i) => yearPageStart + i).map(y => (
                  <button key={y} type="button" onClick={() => pickYear(y)}
                    className={`text-xs py-2 rounded-lg transition ${y === cursorYear ? 'text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                    style={y === cursorYear ? activeBtn : undefined}>
                    {y}
                  </button>
                ))}
              </div>
            </>
          )}

          {view === 'month' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => setView('year')} className="text-sm font-semibold remar-green hover:underline">
                  {cursorYear}
                </button>
                <button type="button" onClick={() => setView('year')} className="text-xs text-gray-400 hover:text-gray-600">change year</button>
              </div>
              <p className="text-[10px] text-gray-400 mb-2 text-center">Select month</p>
              <div className="grid grid-cols-3 gap-1.5">
                {MONTHS.map((m, i) => (
                  <button key={m} type="button" onClick={() => pickMonth(i)}
                    className={`text-xs py-2 rounded-lg transition ${i === cursorMonth ? 'text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                    style={i === cursorMonth ? activeBtn : undefined}>
                    {m}
                  </button>
                ))}
              </div>
            </>
          )}

          {view === 'day' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => setView('month')} className="text-sm font-semibold remar-green hover:underline">
                  {MONTHS[cursorMonth]} {cursorYear}
                </button>
                <button type="button" onClick={() => setView('month')} className="text-xs text-gray-400 hover:text-gray-600">change month</button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-400 mb-1">
                {WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {dayCells.map((d, i) => d === null ? <span key={i} /> : (
                  <button key={i} type="button" onClick={() => pickDay(d)}
                    className={`text-xs py-1.5 rounded-full transition ${
                      selected && selected.getFullYear() === cursorYear && selected.getMonth() === cursorMonth && selected.getDate() === d
                        ? 'text-white' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    style={selected && selected.getFullYear() === cursorYear && selected.getMonth() === cursorMonth && selected.getDate() === d ? activeBtn : undefined}>
                    {d}
                  </button>
                ))}
              </div>
            </>
          )}

        </div>
      )}
    </div>
  );
}
