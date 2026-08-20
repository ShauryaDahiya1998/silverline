import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { STATUS_COLORS, getStatusLabel, resolveDisplayStatus } from '../../utils/helpStatus';
import HelpDetailPopup from '../../components/HelpDetailPopup';

const formatShortDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
};

// Full list of Remar Store items for one category — reached by tapping that
// category's box on the Store page. Same Date/Help ID/Item/Status table
// shape as Help ongoing (HelpOngoingList.jsx), just scoped to GET
// /help/store items in this category instead of the signed-in person's own.
// Tapping a row: for helpers/beneficiaries, opens the same Cancel/Request
// popup Map View uses (see HelpDetailPopup.jsx) — they can only request a
// Store item, not act as its "owner", so the fuller Help Status page
// doesn't apply the way it does for a real person-created item. For admin,
// though, admin effectively IS the owner of every Store item (fronted by
// the HRR0000/BRR0000 system accounts — see db.js), so tapping instead goes
// straight to the same Help Status page (/help/:id, HelpStatus.jsx) a Help
// ongoing row opens, giving admin the full Requests list (accept/reject/
// chat), withdraw-an-approved-match, Modify, and Delete — not just a
// read-only popup.
export default function StoreCategoryList() {
  const { category } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isHelper = user?.role === 'helper';
  // Admin is the creator of every Remar Store item (fronted by one of two
  // system accounts — see AdminStoreNewHelp.jsx) — no Request/Apply button
  // makes sense for the item's own creator, so HelpDetailPopup hides it
  // entirely for admin.
  const isAdmin = user?.role === 'admin';

  const [helps, setHelps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHelp, setSelectedHelp] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const load = () => {
    api.get('/help/store')
      .then(res => {
        const rows = (res.data || [])
          .filter(h => h.category === category)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setHelps(rows);
      })
      .catch(() => setHelps([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [category]);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [feedback]);

  const handleSent = (fb) => {
    setSelectedHelp(null);
    setFeedback(fb);
    load();
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-lg font-bold remar-green mb-5">{category}</h1>

        <div className="bg-white rounded-2xl shadow-lg p-5">
          <div className="rounded-lg overflow-hidden">
            <table className="w-full text-xs table-fixed">
              <thead>
                <tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-1.5 py-1 w-[61px]">Date</th>
                  <th className="text-left font-medium px-1.5 py-1 w-[77px]">Help ID</th>
                  <th className="text-left font-medium px-3 py-1">Item</th>
                  <th className="text-center font-medium px-2 py-1 w-16">Status</th>
                </tr>
              </thead>
              <tbody>
                {helps.map((h, i) => {
                  // Same status a requester sees on their own Help ongoing
                  // list (resolveDisplayStatus prefers the latest
                  // assignment's status over the item's own raw status once
                  // one exists — see GET /help/store's assignment_status).
                  const label = getStatusLabel(resolveDisplayStatus(h.assignment_status, h.status), h.scheduled_date, true);
                  return (
                    <tr key={h.id} onClick={() => isAdmin ? navigate(`/help/${h.id}`) : setSelectedHelp(h)}
                      className={`cursor-pointer hover:bg-remar-light/40 transition ${i % 2 ? 'bg-gray-50/50' : 'bg-white'}`}>
                      <td className="px-1.5 py-1 text-gray-600 whitespace-nowrap">{formatShortDate(h.created_at)}</td>
                      <td className="px-1.5 py-1 text-gray-500 truncate">
                        <span className="hover:bg-remar-light/60 hover:text-gray-800 rounded px-1 -mx-1 transition">{h.help_id}</span>
                      </td>
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
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400 text-sm">Nothing in this category right now</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedHelp && (
        <HelpDetailPopup help={selectedHelp} isHelper={isHelper} isAdmin={isAdmin}
          onClose={() => setSelectedHelp(null)} onSent={handleSent} />
      )}

      {feedback && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[2100] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white ${feedback.type === 'error' ? 'bg-red-600' : 'bg-[#3a6b00]'}`}>
          {feedback.text}
        </div>
      )}
    </div>
  );
}
