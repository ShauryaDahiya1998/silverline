import { useEffect, useState } from 'react';
import api from '../../api';
import PageHeader from '../../components/PageHeader';

const STATUS_LABELS = { open: 'Open', assigned: 'Assigned', completed: 'Completed', cancelled: 'Deleted' };

// Row/column options for the custom pivot report below — values match what
// GET /api/reports/pivot expects, labels are what the admin sees. Row
// dimensions group completed help activity by either the help item itself
// (category/sub-category/item) or a person/location; column options pick
// the metric measured within each group — see reports.js for exactly how
// each combination is computed (and which ones return a "note" instead of
// a table, e.g. Donation x Category, since donations aren't tied to a
// specific help item).
const ROW_OPTIONS = [
  { value: 'category', label: 'Category' },
  { value: 'sub_category', label: 'Sub-category' },
  { value: 'item', label: 'Item' },
  { value: 'all_beneficiaries', label: 'All beneficiaries' },
  { value: 'all_helpers', label: 'All helpers' },
  { value: 'id', label: 'ID' },
  { value: 'pincode', label: 'Pincode' },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
  { value: 'continent', label: 'Continent' },
];

const COLUMN_OPTIONS = [
  { value: 'tat', label: 'TAT' },
  { value: 'value', label: 'Value' },
  { value: 'hours', label: 'Hour(s)' },
  { value: 'donation', label: 'Donation' },
  { value: 'helps', label: 'Helps' },
];

// Platform-wide numbers for admin — reached from Admin Home > Services >
// Reports. Reuses the same counts the old AdminDashboard.jsx stat cards
// showed, plus a status breakdown of every help item, and the existing
// Volunteers/Beneficiaries CSV exports in one place.
export default function AdminReports() {
  const [volunteers, setVolunteers] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [helps, setHelps] = useState([]);
  const [loading, setLoading] = useState(true);

  // Site-wide summary tiles (Helpers/Beneficiaries/Donations/Value/Hours/
  // Helps/TAT/On-time) — the counts/totals not already covered by
  // volunteers/beneficiaries/helps above come from GET /reports/summary.
  const [summary, setSummary] = useState(null);

  // Custom pivot report — row/column choices below drive GET
  // /api/reports/pivot. pivotRows is the resulting table (or null while
  // loading), pivotNote is set instead whenever the chosen combination isn't
  // meaningful (e.g. Donation x Category — see reports.js).
  const [pivotRow, setPivotRow] = useState('category');
  const [pivotColumn, setPivotColumn] = useState('helps');
  const [pivotRows, setPivotRows] = useState(null);
  const [pivotNote, setPivotNote] = useState(null);
  const [pivotLoading, setPivotLoading] = useState(true);
  const [pivotError, setPivotError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/helpers').then(res => setVolunteers(res.data)).catch(() => {}),
      api.get('/beneficiaries').then(res => setBeneficiaries(res.data)).catch(() => {}),
      api.get('/help').then(res => setHelps(res.data)).catch(() => {}),
      api.get('/reports/summary').then(res => setSummary(res.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setPivotLoading(true);
    setPivotError('');
    api.get('/reports/pivot', { params: { row: pivotRow, column: pivotColumn } })
      .then(res => {
        setPivotRows(res.data.rows);
        setPivotNote(res.data.note);
      })
      .catch(err => setPivotError(err.response?.data?.error || 'Could not load this report.'))
      .finally(() => setPivotLoading(false));
  }, [pivotRow, pivotColumn]);

  const statusCounts = helps.reduce((acc, h) => {
    acc[h.status] = (acc[h.status] || 0) + 1;
    return acc;
  }, {});

  // Compact tile sized for an 8-item, 4-across grid (see the summary grid
  // below) — smaller padding/font than a typical single-row stat card so
  // values like "Fr 1234.00" or "3.2 h" stay on one line on a phone screen.
  const StatCard = ({ label, value, color }) => (
    <div className={`rounded-xl px-2 py-3 text-white text-center ${color} shadow`}>
      <p className="text-base font-bold truncate">{value}</p>
      <p className="mt-1 text-[10px] opacity-90">{label}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-2xl mx-auto">
        <PageHeader title="Reports" />

        {loading ? (
          <p className="text-sm text-gray-400 text-center py-10">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <StatCard label="Helpers" value={volunteers.length} color="bg-remar" />
              <StatCard label="Beneficiaries" value={beneficiaries.length} color="bg-remar" />
              <StatCard label="Donations" value={summary ? `${summary.currency} ${summary.donations.toFixed(2)}` : '—'} color="bg-remar" />
              <StatCard label="Value" value={summary ? `${summary.currency} ${summary.value.toFixed(2)}` : '—'} color="bg-remar" />
              <StatCard label="Hours" value={summary ? summary.hours.toFixed(1) : '—'} color="bg-remar" />
              <StatCard label="Helps" value={summary ? summary.helps : '—'} color="bg-remar" />
              <StatCard label="TAT" value={summary && summary.tatHours != null ? `${summary.tatHours.toFixed(1)} h` : '—'} color="bg-remar" />
              <StatCard label="On-time" value={summary && summary.onTimePct != null ? `${summary.onTimePct}%` : '—'} color="bg-remar" />
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-5 mb-4">
              <div className="flex items-end justify-between mb-3">
                <h2 className="font-semibold remar-green text-sm">Help items by status</h2>
                <span className="font-semibold text-gray-800 text-sm">{helps.length}</span>
              </div>
              <div className="space-y-2">
                {Object.keys(STATUS_LABELS).map(status => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{STATUS_LABELS[status]}</span>
                    <span className="font-semibold text-gray-800">{statusCounts[status] || 0}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-5 mb-4">
              <h2 className="font-semibold remar-green text-sm mb-1">Custom report</h2>
              <p className="text-xs text-gray-500 mb-3">Group completed help activity by a dimension, and measure it with a metric.</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <label className="block">
                  <span className="block text-xs text-gray-500 mb-1">Row</span>
                  <select value={pivotRow} onChange={e => setPivotRow(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-700">
                    {ROW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs text-gray-500 mb-1">Column</span>
                  <select value={pivotColumn} onChange={e => setPivotColumn(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-700">
                    {COLUMN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>

              {pivotLoading ? (
                <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
              ) : pivotError ? (
                <p className="text-sm text-red-500 text-center py-6">{pivotError}</p>
              ) : pivotNote ? (
                <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-3">{pivotNote}</p>
              ) : pivotRows && pivotRows.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No completed help activity for this combination yet.</p>
              ) : (
                <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                  {pivotRows?.map(row => (
                    <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-sm text-gray-700 truncate">{row.label}</span>
                      <span className="text-sm font-semibold text-gray-800 flex-shrink-0">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-5">
              <h2 className="font-semibold remar-green text-sm mb-3">Export</h2>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => window.open('/api/helpers/export/csv', '_blank')}
                  className="text-sm bg-yellow-400 text-green-900 px-4 py-1.5 rounded-lg font-semibold hover:bg-yellow-300 transition">
                  Helpers CSV
                </button>
                <button type="button" onClick={() => window.open('/api/beneficiaries/export/csv', '_blank')}
                  className="text-sm bg-yellow-400 text-green-900 px-4 py-1.5 rounded-lg font-semibold hover:bg-yellow-300 transition">
                  Beneficiaries CSV
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
