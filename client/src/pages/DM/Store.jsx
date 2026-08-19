import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { HELP_CATEGORIES_ORDER } from '../../data/helpTaxonomy';

// Emoji per category — same mapping PublicProfile.jsx uses for a person's
// help categories, kept in sync here rather than shared so this file has no
// dependency on a profile-page-specific module.
const CATEGORY_ICONS = {
  'Food': '🍎',
  'Toiletries': '🧴',
  'Clothes': '👕',
  'Social services': '🤝',
  'Professional services': '💼',
  'Money': '💰',
};

// Remar Store: one page, all three roles. GET /help/store already scopes the
// rows server-side per viewer — admin gets everything (both directions),
// helpers only "Help Required" (direction 'request', fronted by the BRR0000
// system account), beneficiaries only "Help Available" (direction 'offer',
// fronted by HRR0000) — see help.js. Only admin gets the New Help button and
// the All/Available/Required filter dropdown; helpers/beneficiaries just
// browse their pre-filtered set and respond to a Help ID normally from its
// detail page, same as any other helper/beneficiary-created item.
export default function Store() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // admin only: all | available | required

  useEffect(() => {
    api.get('/help/store')
      .then(res => setItems(res.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = isAdmin
    ? items.filter(h => filter === 'all' ? true : filter === 'available' ? h.direction === 'offer' : h.direction === 'request')
    : items;

  const byCategory = HELP_CATEGORIES_ORDER.map(cat => ({
    category: cat,
    rows: filtered.filter(h => h.category === cat).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  }));

  // Helpers only ever see "Help Required" rows here (direction 'request')
  // and beneficiaries only "Help Available" (direction 'offer') — see the
  // GET /help/store scoping comment above — so each gets the subtitle
  // phrased for what they're actually looking at; admin sees both
  // directions and keeps the general wording.
  const subtitle = isAdmin
    ? 'Help offered or requested directly by Remar Schweiz'
    : user?.role === 'beneficiary'
    ? 'Help offered directly by Remar Schweiz'
    : 'Help requested directly by Remar Schweiz';

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-1 gap-2">
          <h1 className="text-lg font-bold remar-green">Remar Store</h1>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <select value={filter} onChange={e => setFilter(e.target.value)}
                className="text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-2 focus:outline-none">
                <option value="all">All</option>
                <option value="available">Help Available</option>
                <option value="required">Help Required</option>
              </select>
              <button type="button" onClick={() => navigate('/admin/store/new')}
                className="flex items-center gap-1.5 text-xs font-semibold text-white rounded-lg px-3 py-2 transition hover:opacity-90"
                style={{ backgroundColor: '#3a6b00' }}>
                <img src="/plus-icon.png" alt="" className="w-4 h-4 object-contain" />
                New Help
              </button>
            </div>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-5">{subtitle}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {byCategory.map(({ category, rows }) => (
            <button key={category} type="button"
              onClick={() => navigate(`/store/${encodeURIComponent(category)}`)}
              className="text-left bg-white rounded-2xl shadow-lg p-5 transition hover:shadow-xl hover:-translate-y-0.5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{CATEGORY_ICONS[category] || '📦'}</span>
                <span className="font-bold text-gray-800">{category}</span>
                <span className="ml-auto text-xs font-semibold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                  {rows.length}
                </span>
              </div>
              {rows.length === 0 ? (
                <p className="text-xs text-gray-400">Nothing here right now.</p>
              ) : (
                <ul className="space-y-1.5">
                  {rows.slice(0, 3).map(h => (
                    <li key={h.id} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400 flex-shrink-0">{h.help_id}</span>
                      <span className="text-gray-700 truncate">{h.title}</span>
                    </li>
                  ))}
                </ul>
              )}
              {rows.length > 3 && (
                <p className="text-xs font-semibold mt-2" style={{ color: '#579500' }}>
                  See all {rows.length} →
                </p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
