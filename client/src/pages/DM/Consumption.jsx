import { useEffect, useState } from 'react';
import api from '../../api';

// Summary of a beneficiary's completed help — reuses the same GET /help/mine
// data as the Home page's history table, just aggregated. Reachable from
// Home's "My Consumption" button (beneficiary only).
export default function Consumption() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/help/mine').then(res => {
      const completed = (res.data.history || []).filter(row => row.status === 'completed');
      const totalHelps = completed.length;
      const totalHours = completed.reduce((sum, row) => sum + (Number(row.duration_hours) || 0), 0);
      const totalValue = completed.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
      const ratings = completed.map(row => row.rating_given).filter(r => r != null);
      const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;

      setStats({ totalHelps, totalHours, totalValue, avgRating });
    }).catch(() => setStats({ totalHelps: 0, totalHours: 0, totalValue: 0, avgRating: null }))
      .finally(() => setLoading(false));
  }, []);

  const cards = stats ? [
    { label: 'Helps received', value: stats.totalHelps },
    { label: 'Total hours received', value: stats.totalHours },
    { label: 'Total value received', value: stats.totalValue },
    { label: 'Average rating given', value: stats.avgRating != null ? stats.avgRating.toFixed(1) : '—' },
  ] : [];

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-bold remar-green mb-1">My Consumption</h1>
          <p className="text-sm text-gray-500 mb-5">A summary of the help you've received through REMAR.</p>

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
          ) : (
            <div className="bg-gray-50 rounded-xl px-4">
              {cards.map((c) => (
                <div key={c.label} className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
                  <p className="text-sm text-gray-600">{c.label}</p>
                  <p className="text-sm font-semibold text-gray-900">{c.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
