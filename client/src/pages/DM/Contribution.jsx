import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import { usePreferences } from '../../context/PreferencesContext';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The month this per-month filter went live — the month dropdown starts
// here (Aug 2026) rather than backfilling Jan–Jul 2026. Every January after
// this, the month list resets and starts counting from January instead.
const MONTH_FILTER_START_YEAR = 2026;
const MONTH_FILTER_START_MONTH = 7; // 0-indexed: August

// The date a completed help item actually counts toward — when it was
// marked completed (the assignment's updated_at), falling back to when the
// help item itself was created for the rare case that's missing.
const rowDate = (row) => new Date(row.assignmentUpdatedAt || row.createdAt);

// Summary of a helper's completed help — reuses the same GET /help/mine
// data as the Home page's history table, just aggregated. Reachable from
// Home's "My Contribution" button (helper only). A period dropdown lets the
// helper view Lifetime totals, a specific year, or a specific month of the
// current year — years/months are derived from real data plus today's date,
// so 2027 (or September once it arrives) shows up on its own with no code
// changes needed.
const CERT_STATUS_STYLE = {
  pending: 'bg-yellow-100 text-yellow-700',
  issued: 'bg-remar-light remar-green',
  rejected: 'bg-red-100 text-red-600',
};

const formatRequestDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

export default function Contribution() {
  const { currency } = usePreferences();
  const [completed, setCompleted] = useState([]);
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('lifetime');

  const [certRequests, setCertRequests] = useState([]);
  const [certLoading, setCertLoading] = useState(false);
  const [certError, setCertError] = useState('');

  const loadCertRequests = () => api.get('/certificates/requests/mine').then(res => setCertRequests(res.data)).catch(() => {});

  useEffect(() => {
    Promise.all([
      api.get('/help/mine'),
      // Donations this helper has personally made (logged by admin once
      // received — see donations.js), aggregated the same period-aware way
      // as the completed-help stats below.
      api.get('/donations/mine').catch(() => ({ data: [] })),
    ]).then(([helpRes, donationsRes]) => {
      const rows = (helpRes.data.history || [])
        .filter(row => row.assignment_status === 'completed')
        .map(row => ({
          durationHours: Number(row.duration_hours) || 0,
          value: Number(row.value) || 0,
          onTime: row.on_time,
          // Whichever of creator_rating/consumer_rating the *other* party
          // on this assignment actually submitted (see GET /help/mine) —
          // this helper's own rating of the transaction doesn't count as
          // a rating "received".
          ratingReceived: row.rating_received,
          createdAt: row.created_at,
          assignmentUpdatedAt: row.assignment_updated_at,
        }));
      setCompleted(rows);
      setDonations((donationsRes.data || []).map(d => ({ amount: Number(d.amount) || 0, donatedAt: d.donated_at })));
    }).catch(() => {
      setCompleted([]);
      setDonations([]);
    }).finally(() => setLoading(false));

    loadCertRequests();
  }, []);

  // Period options: Lifetime, then every year that has data (plus the
  // current year even with none yet), then the current year's months —
  // starting from MONTH_FILTER_START_MONTH in MONTH_FILTER_START_YEAR, or
  // from January in any later year (each new year wipes the month list and
  // starts over), growing by one as each new month begins.
  const periodOptions = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const years = new Set([currentYear]);
    [...completed.map(rowDate), ...donations.map(d => new Date(d.donatedAt))].forEach(d => {
      if (!isNaN(d)) years.add(d.getFullYear());
    });
    const yearOptions = [...years].sort((a, b) => b - a).map(y => ({ value: `year:${y}`, label: `${y}` }));

    const startMonth = currentYear === MONTH_FILTER_START_YEAR ? MONTH_FILTER_START_MONTH
      : currentYear > MONTH_FILTER_START_YEAR ? 0
      : currentMonth; // current year is before the filter's start year — shouldn't happen, but stay safe
    const monthOptions = [];
    for (let m = currentMonth; m >= startMonth; m--) {
      monthOptions.push({ value: `month:${currentYear}-${String(m + 1).padStart(2, '0')}`, label: `${MONTH_NAMES[m]} ${currentYear}` });
    }

    return [{ value: 'lifetime', label: 'Lifetime' }, ...yearOptions, ...monthOptions];
  }, [completed, donations]);

  // Keep the selection valid if the underlying data changes out from under it.
  useEffect(() => {
    if (!periodOptions.some(o => o.value === period)) setPeriod('lifetime');
  }, [periodOptions, period]);

  const selectedPeriodLabel = periodOptions.find(o => o.value === period)?.label || 'Lifetime';

  const handleRequestCertificate = async () => {
    setCertError('');
    setCertLoading(true);
    try {
      const [periodType, periodValue] = period === 'lifetime' ? ['lifetime', null] : period.split(':');
      await api.post('/certificates/request', {
        period_type: periodType,
        period_value: periodValue,
        period_label: selectedPeriodLabel,
      });
      await loadCertRequests();
    } catch (err) {
      setCertError(err.response?.data?.error || 'Could not send the request. Please try again.');
    } finally {
      setCertLoading(false);
    }
  };

  const inPeriod = (date) => {
    if (isNaN(date)) return period === 'lifetime';
    if (period === 'lifetime') return true;
    if (period.startsWith('year:')) return date.getFullYear() === Number(period.slice(5));
    if (period.startsWith('month:')) {
      const [y, m] = period.slice(6).split('-').map(Number);
      return date.getFullYear() === y && date.getMonth() + 1 === m;
    }
    return true;
  };

  const stats = useMemo(() => {
    const rows = completed.filter(row => inPeriod(rowDate(row)));
    const totalHelps = rows.length;
    const totalHours = rows.reduce((sum, row) => sum + row.durationHours, 0);
    const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
    const onTimeCount = rows.filter(row => row.onTime === true).length;
    const onTimeRated = rows.filter(row => row.onTime !== null && row.onTime !== undefined).length;
    const ratings = rows.map(row => row.ratingReceived).filter(r => r != null);
    const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;
    const totalDonations = donations.filter(d => inPeriod(new Date(d.donatedAt))).reduce((sum, d) => sum + d.amount, 0);

    return {
      totalHelps, totalHours, totalValue,
      onTimePct: onTimeRated ? Math.round((onTimeCount / onTimeRated) * 100) : null,
      avgRating, totalDonations,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, donations, period]);

  const CurrencyIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 8.5c-.7-.8-1.8-1.3-3-1.3-2.2 0-4 1.7-4 3.8s1.8 3.8 4 3.8c1.2 0 2.3-.5 3-1.3" />
      <line x1="7" y1="10" x2="13" y2="10" />
      <line x1="7" y1="13" x2="13" y2="13" />
    </svg>
  );
  const HandshakeIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m11 17 2 2a1 1 0 1 0 3-3" />
      <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
      <path d="m21 3 1 11h-2" />
      <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
      <path d="M3 4h8" />
    </svg>
  );
  const ClockIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
  const TargetIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
  const StarIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
  const GiftIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M19 12v9H5v-9" />
      <path d="M12 8c-1.5 0-3-1.2-3-3a2.5 2.5 0 0 1 5 0c0-1.8-1.5-3-3-3M12 8c1.5 0 3-1.2 3-3a2.5 2.5 0 0 0-5 0c0-1.8 1.5-3 3-3" />
    </svg>
  );

  const tiles = [
    { label: 'Helps', value: stats.totalHelps, Icon: HandshakeIcon },
    { label: 'On-time', value: stats.onTimePct != null ? `${stats.onTimePct}%` : '—', Icon: TargetIcon },
    { label: 'Value', value: `${currency} ${stats.totalValue}`, Icon: CurrencyIcon },
    { label: 'Hours', value: stats.totalHours, Icon: ClockIcon },
    { label: 'Donations', value: `${currency} ${stats.totalDonations}`, Icon: GiftIcon },
    { label: 'Rating', value: stats.avgRating != null ? `${stats.avgRating.toFixed(1)}/5` : '—', Icon: StarIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h1 className="text-lg font-bold remar-green">My Contribution</h1>
            <select value={period} onChange={e => setPeriod(e.target.value)}
              className="text-xs font-semibold border border-gray-300 rounded-full px-3 py-1.5 text-gray-600 flex-shrink-0">
              {periodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <p className="text-sm text-gray-500 mb-5">A summary of the help you've completed as a REMAR volunteer.</p>

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {tiles.map(({ label, value, Icon }) => (
                <div key={label}
                  className="flex flex-col items-center text-center gap-2 rounded-2xl bg-remar-mid border-2 border-remar-mid px-3 py-4 hover:border-remar transition">
                  <Icon className="w-7 h-7 text-white" />
                  <p className="text-xs font-medium text-white leading-tight">{label}</p>
                  <p className="text-2xl font-bold text-white">{value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Request Certificate</h2>
            <p className="text-xs text-gray-500 mb-3">
              Sends a request to REMAR to issue a Certificate of Service for <span className="font-medium text-gray-700">{selectedPeriodLabel}</span> (the period selected above).
            </p>
            <button type="button" onClick={handleRequestCertificate} disabled={certLoading}
              className="w-full text-sm font-semibold text-white px-4 py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50"
              style={{ backgroundColor: '#3a6b00' }}>
              {certLoading ? 'Sending…' : `Request certificate for ${selectedPeriodLabel}`}
            </button>
            {certError && <p className="text-xs text-red-500 mt-2">{certError}</p>}

            {certRequests.length > 0 && (
              <div className="mt-4 divide-y divide-gray-100">
                {certRequests.map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700 truncate">{r.period_label}</p>
                      <p className="text-xs text-gray-400">{formatRequestDate(r.created_at)}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0 capitalize ${CERT_STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-600'}`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
