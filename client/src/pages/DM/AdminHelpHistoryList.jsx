import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { formatHelpId, getStatusLabel } from '../../utils/helpStatus';
import StatusDot from '../../components/StatusDot';

const formatShortDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
};

// Full, unfiltered list of every completed/cancelled help item system-wide —
// reached by tapping "Help history" on Admin Home, which only shows a
// preview of the 3 most recent. Admin's own equivalent of
// HelpHistoryList.jsx (that page is scoped to the logged-in helper/
// beneficiary's own items via GET /help/mine, which returns nothing useful
// for an admin session).
export default function AdminHelpHistoryList() {
  const navigate = useNavigate();
  const [helps, setHelps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // A completed item only counts as "history" 3 days after its
    // completed_at (see matching comment in server/routes/help.js) — a
    // just-completed item stays out of this list until then.
    const HISTORY_DELAY_MS = 3 * 24 * 60 * 60 * 1000;
    const isHistoryNow = (h) => {
      if (h.status === 'cancelled') return true;
      if (h.status !== 'completed') return false;
      if (!h.completed_at) return true;
      return Date.now() - new Date(h.completed_at).getTime() >= HISTORY_DELAY_MS;
    };
    api.get('/help').then(res => {
      const rows = res.data
        .filter(isHistoryNow)
        .map(row => ({
          key: row.id,
          helpRowId: row.id,
          helpId: row.help_id,
          title: row.title,
          scheduledDate: row.scheduled_date,
          createdAt: row.created_at,
          value: row.value,
          status: row.status,
          onTime: row.on_time,
        }));
      setHelps(rows);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-lg font-bold remar-green mb-5">Help history</h1>

        <div className="bg-white rounded-2xl shadow-lg p-5">
          {/* Single light-grey background across the whole list (no
              alternating row colors — matches Home's Help history table),
              with an inset divider line below the header and a darker-grey
              hover so a row under the cursor/finger is easy to spot while
              scrolling on a touchpad or phone. */}
          <div className="rounded-lg overflow-hidden" style={{ backgroundColor: '#f0f0f1' }}>
            <table className="w-full text-xs table-fixed">
              <thead>
                <tr className="text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-1.5 py-1 w-[61px]">Date</th>
                  <th className="text-left font-medium px-1.5 py-1 w-[77px]">Help ID</th>
                  <th className="text-left font-medium px-3 py-1">Item</th>
                  <th className="text-center font-medium px-2 py-1 w-16">Status</th>
                </tr>
              </thead>
              <tbody>
                {helps.map((h, i) => {
                  const helpId = h.helpId || formatHelpId(i + 1);
                  const label = getStatusLabel(h.status, h.scheduledDate);
                  return (
                    <tr key={h.key}
                      onClick={() => navigate(`/help/${h.helpRowId}`)}
                      className="cursor-pointer hover:bg-[#d6d6d8] transition">
                      <td className="px-1.5 py-1 text-gray-600 whitespace-nowrap">{formatShortDate(h.createdAt)}</td>
                      <td className="px-1.5 py-1 text-gray-500 truncate">{helpId}</td>
                      <td className="px-3 py-1 text-gray-700 truncate">{h.title}</td>
                      <td className="px-2 py-1">
                        <span className="flex items-center justify-center" title={label}>
                          <StatusDot label={label} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {helps.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400 text-sm">No help history yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
