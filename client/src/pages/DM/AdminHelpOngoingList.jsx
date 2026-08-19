import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { STATUS_COLORS, getStatusLabel, resolveDisplayStatus, formatHelpId } from '../../utils/helpStatus';

const formatShortDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
};

// Full, unfiltered list of every open/assigned help item system-wide —
// reached by tapping "Help ongoing" on Admin Home, which only shows a
// preview of the 3 most recent. Admin's own equivalent of
// HelpOngoingList.jsx (that page is scoped to the logged-in helper/
// beneficiary's own items via GET /help/mine, which returns nothing useful
// for an admin session).
export default function AdminHelpOngoingList() {
  const navigate = useNavigate();
  const [helps, setHelps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Same latest-assignment status derivation as AdminHome.jsx — see the
    // comment there. GET /help now folds in assignment_status/admin_approved
    // so a not-yet-admin-approved request reads as "Requested" here too,
    // same as it does on its own creator's Home.
    // A completed item stays out of history for 3 days after completion
    // (see matching comment in server/routes/help.js) so it doesn't vanish
    // from view the instant it's marked done.
    const HISTORY_DELAY_MS = 3 * 24 * 60 * 60 * 1000;
    const isHistoryRow = (row) => {
      if (row.status === 'cancelled') return true;
      if (row.status === 'completed') {
        if (!row.completed_at) return true;
        return Date.now() - new Date(row.completed_at).getTime() >= HISTORY_DELAY_MS;
      }
      return row.assignment_status ? ['completed', 'cancelled'].includes(row.assignment_status) : false;
    };
    api.get('/help').then(res => {
      const rows = res.data
        .filter(h => !isHistoryRow(h))
        .map(row => ({
          key: row.id,
          helpRowId: row.id,
          helpId: row.help_id,
          title: row.title,
          scheduledDate: row.scheduled_date,
          createdAt: row.created_at,
          status: resolveDisplayStatus(row.assignment_status, row.status),
          adminApproved: row.admin_approved ?? true,
          bothScheduled: !!(row.creator_scheduled && row.consumer_scheduled),
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
        <h1 className="text-lg font-bold remar-green mb-5">Help ongoing</h1>

        <div className="bg-white rounded-2xl shadow-lg p-5">
          {/* Single light-green background across the whole list (no
              alternating row colors — matches Home's Help ongoing table),
              with an inset divider line below the header and a darker-green
              hover so a row under the cursor/finger is easy to spot while
              scrolling on a touchpad or phone. */}
          <div className="rounded-lg overflow-hidden" style={{ backgroundColor: '#e8f5df' }}>
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
                  const label = getStatusLabel(h.status, h.scheduledDate, h.adminApproved, h.bothScheduled);
                  const helpId = h.helpId || formatHelpId(i + 1);
                  return (
                    <tr key={h.key} onClick={() => navigate(`/help/${h.helpRowId}`)}
                      className="cursor-pointer hover:bg-[#c8e6ae] transition">
                      <td className="px-1.5 py-1 text-gray-600 whitespace-nowrap">{formatShortDate(h.createdAt)}</td>
                      <td className="px-1.5 py-1 text-gray-500 truncate">{helpId}</td>
                      <td className="px-3 py-1 text-gray-700 truncate">{h.title}</td>
                      <td className="px-2 py-1">
                        <span className="flex items-center justify-center" title={label}>
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[label] }} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {helps.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400 text-sm">No help ongoing</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
