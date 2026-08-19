import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { STATUS_COLORS, getStatusLabel, formatDate } from '../../utils/helpStatus';
import { DUMMY_HISTORY_ITEMS, DUMMY_HISTORY_EXTRA } from '../../data/dummyHelp';
import StatusDot from '../../components/StatusDot';

const SORT_FIELDS = ['Number', 'Value', 'Helper', 'Hours'];
const SUPPORT_MAILTO = 'mailto:zubinsarkar@gmail.com?subject=REMAR%20Schweiz%20Support';

// Help History page — reached by clicking a row in Home's Help history
// table. Shows the completed request's full detail plus prev/next paging
// through the list that was open on Home, and Sort for reordering it.
export default function HelpHistory() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHelper = user?.role === 'helper';
  const demoRow = DUMMY_HISTORY_ITEMS.find(r => r.helpRowId === id);
  const isDemo = !!demoRow;

  const passedRow = location.state?.row;
  const passedList = location.state?.list;
  const passedIndex = location.state?.index;

  const [row, setRow] = useState(isDemo ? demoRow : passedRow || null);
  const [extra, setExtra] = useState(isDemo ? DUMMY_HISTORY_EXTRA[id] : {});
  const [counterpart, setCounterpart] = useState(null);
  const [loading, setLoading] = useState(!isDemo && !passedRow);
  const [notFound, setNotFound] = useState(false);
  const [list, setList] = useState(passedList || (row ? [row] : []));
  const [index, setIndex] = useState(passedIndex ?? 0);
  const [sortField, setSortField] = useState(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filterHint, setFilterHint] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;
    setLoading(!row);
    Promise.all([
      api.get(`/help/${id}`).then(res => !cancelled && setExtra(e => ({ ...e, category: res.data.category, description: res.data.description }))).catch(() => !cancelled && !row && setNotFound(true)),
      api.get(`/help/${id}/counterpart`).then(res => !cancelled && setCounterpart(res.data)).catch(() => {}),
    ]).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const goTo = (newIndex, newList) => {
    const l = newList || list;
    if (newIndex < 0 || newIndex >= l.length) return;
    const target = l[newIndex];
    navigate(`/help/history/${target.helpRowId}`, { state: { row: target, index: newIndex, list: l }, replace: true });
    setRow(target);
    setIndex(newIndex);
    setList(l);
    setCounterpart(null);
    setExtra(DUMMY_HISTORY_EXTRA[target.helpRowId] || {});
  };

  const handleSort = (field) => {
    setSortField(field);
    setSortMenuOpen(false);
    const cmp = {
      Number: (a, b) => list.indexOf(a) - list.indexOf(b),
      Value: (a, b) => (b.value || 0) - (a.value || 0),
      Helper: (a, b) => (a.title || '').localeCompare(b.title || ''),
      Hours: (a, b) => (b.durationHours || 0) - (a.durationHours || 0),
    }[field];
    const sorted = [...list].sort(cmp);
    const newIndex = sorted.findIndex(h => h.helpRowId === row.helpRowId);
    goTo(newIndex, sorted);
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }

  if (notFound || !row) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-sm text-gray-500 mb-4">This help request couldn't be found.</p>
        </div>
      </div>
    );
  }

  const label = getStatusLabel(row.status, row.scheduledDate);
  // The real, permanent Help ID assigned at creation — same value shown in
  // the Help ongoing/history tables. Previously this showed a truncated
  // internal UUID instead, which never matched.
  const shortId = isDemo ? 'DEMO' : (row.helpId || `#${row.helpRowId.slice(0, 6).toUpperCase()}`);
  const counterpartName = isDemo ? DUMMY_HISTORY_EXTRA[id].counterpartName : (counterpart?.nickname || counterpart?.name || '—');
  const counterpartFieldLabel = isHelper ? 'Beneficiary' : 'Helper';
  const counterpartPath = counterpart ? (counterpart.role === 'helper' ? `/helper/profile/${counterpart.id}` : `/beneficiary/profile/${counterpart.id}`) : null;

  const chip = (label, value) => (
    <div className="text-center">
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
      <p className="text-xs font-semibold text-gray-700">{value}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-3xl mx-auto">

        {/* Title bar with prev/next paging through the list from Home */}
        <div className="flex items-center justify-between mb-5">
          <button type="button" onClick={() => goTo(index - 1)} disabled={index <= 0}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-lg font-bold remar-green">Help History{isHelper ? ' — Helper' : ' — Beneficiary'}</h1>
          <button type="button" onClick={() => goTo(index + 1)} disabled={index >= list.length - 1}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Summary chips + Filter/Sort */}
        <div className="bg-white rounded-2xl shadow-lg p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            {chip('Number', `#${index + 1}`)}
            {chip('Value', row.value != null ? row.value : '—')}
            {chip('Hours', row.durationHours != null ? `${row.durationHours}h` : '—')}
            {chip('On Time %', row.onTime === true ? '100%' : row.onTime === false ? '0%' : '—')}
            {chip('Service Rating', row.ratingReceived != null ? `${row.ratingReceived}★` : '—')}
            {chip('Your Rating', row.ratingGiven != null ? `${row.ratingGiven}★` : '—')}
          </div>
          <div className="flex items-center gap-2 relative">
            <button type="button" onClick={() => { setFilterHint(true); setTimeout(() => setFilterHint(false), 1600); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 transition">
              Filter
            </button>
            {filterHint && (
              <span className="absolute top-full right-14 mt-1 text-[10px] text-gray-400 whitespace-nowrap">Filters (Date, Type, Rating, On Time) — coming soon</span>
            )}
            <button type="button" onClick={() => setSortMenuOpen(o => !o)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 transition">
              Sort{sortField ? `: ${sortField}` : ''}
            </button>
            {sortMenuOpen && (
              <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10 w-32">
                {SORT_FIELDS.map(f => (
                  <button key={f} type="button" onClick={() => handleSort(f)}
                    className="w-full text-left text-xs px-3 py-1.5 hover:bg-gray-50 text-gray-600">
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* # / Date / Service Type / Sub-Type / Helper / Status / Rating */}
        <div className="bg-white rounded-2xl shadow-lg p-5 mb-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><p className="text-xs text-gray-400 mb-1">#</p><p className="text-sm font-semibold text-gray-800">{shortId}</p></div>
          <div><p className="text-xs text-gray-400 mb-1">Date</p><p className="text-sm font-semibold text-gray-800">{formatDate(row.scheduledDate)}</p></div>
          <div><p className="text-xs text-gray-400 mb-1">Service Type</p><p className="text-sm font-semibold text-gray-800">{extra.category || '—'}</p></div>
          <div><p className="text-xs text-gray-400 mb-1">Service Sub-Type</p><p className="text-sm font-semibold text-gray-800">{row.subService || '—'}</p></div>
          <div>
            <p className="text-xs text-gray-400 mb-1">{counterpartFieldLabel}</p>
            {counterpartPath ? (
              <button type="button" onClick={() => navigate(counterpartPath)} className="text-sm font-semibold text-[#3a6b00] hover:underline">{counterpartName}</button>
            ) : (
              <p className="text-sm font-semibold text-gray-800">{counterpartName}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Status</p>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: STATUS_COLORS[label] }}>
              <StatusDot label={label} />
              {label}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Rating</p>
            <p className="text-sm font-semibold text-gray-800">
              {row.ratingReceived != null ? `Received ${row.ratingReceived}★` : 'Received —'}
              {' · '}
              {row.ratingGiven != null ? `Given ${row.ratingGiven}★` : 'Given —'}
            </p>
          </div>
        </div>

        {/* Value / Hours / On Time / Feedback */}
        <div className="bg-white rounded-2xl shadow-lg p-5 mb-5">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><p className="text-xs text-gray-400 mb-1">Value</p><p className="text-sm font-semibold text-gray-800">{row.value != null ? row.value : '—'}</p></div>
            <div><p className="text-xs text-gray-400 mb-1">Hours</p><p className="text-sm font-semibold text-gray-800">{row.durationHours != null ? `${row.durationHours}h` : '—'}</p></div>
            <div><p className="text-xs text-gray-400 mb-1">On Time</p><p className="text-sm font-semibold text-gray-800">{row.onTime === true ? 'Yes' : row.onTime === false ? 'No' : '—'}</p></div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Feedback</p>
            <p className="text-sm text-gray-600">{isDemo ? 'Great, friendly exchange — thank you!' : 'No feedback recorded yet.'}</p>
          </div>
        </div>

        {/* Description + Help */}
        <div className="bg-white rounded-2xl shadow-lg p-5 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <p className="text-xs text-gray-400 mb-1">Description</p>
            <p className="text-sm text-gray-700">{row.title}{extra.description ? ` — ${extra.description}` : ''}</p>
          </div>
          <a href={SUPPORT_MAILTO} className="text-sm font-semibold px-4 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition flex-shrink-0">
            Help
          </a>
        </div>

      </div>
    </div>
  );
}
