import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { STATUS_COLORS, getStatusLabel, resolveDisplayStatus, formatHelpId } from '../../utils/helpStatus';
import { DUMMY_OPEN_ITEMS } from '../../data/dummyHelp';

// Full, unfiltered list of every open help request/offer — reached by
// tapping the "Help ongoing" label on Home, which only shows a preview.
// Same table shape as Home's Help ongoing table (Date / Help ID / Item /
// Status), just not limited, so nothing gets lost as the list grows.
const formatShortDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
};

export default function HelpOngoingList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isHelper = user?.role === 'helper';

  const [helps, setHelps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const normalize = (row) => ({
      // A helper's own self-created, not-yet-assigned offers have no
      // assignment row, so assignment_id/assignment_status come back null —
      // fall back to the help item's own id/status so those still get a
      // stable key and a correct status dot instead of crashing into
      // "undefined".
      key: isHelper ? (row.assignment_id || row.help_row_id) : row.id,
      helpRowId: isHelper ? row.help_row_id : row.id,
      assignmentId: isHelper ? row.assignment_id : null,
      helpId: row.help_id,
      title: row.title,
      subService: row.required_skills?.[0] || '—',
      scheduledDate: row.scheduled_date,
      createdAt: row.created_at,
      durationHours: row.duration_hours,
      value: row.value,
      status: resolveDisplayStatus(row.assignment_status, row.status),
      adminApproved: row.admin_approved ?? true,
      bothScheduled: !!(row.creator_scheduled && row.consumer_scheduled),
      onTime: row.on_time,
      ratingReceived: row.rating_received,
      ratingGiven: row.rating_given,
    });

    api.get('/help/mine').then(res => {
      setHelps([...DUMMY_OPEN_ITEMS, ...(res.data.open || []).map(normalize)]);
    }).catch(() => setHelps(DUMMY_OPEN_ITEMS))
      .finally(() => setLoading(false));
  }, [isHelper]);

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
