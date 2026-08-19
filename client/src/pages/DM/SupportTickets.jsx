import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

const formatDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

const STATUS_STYLE = {
  open: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-remar-light remar-green',
};

// Past Contact us submissions and their resolution status (Settings >
// Support > Tickets / Support hub). Created by server/routes/support.js
// POST /contact — resolving a ticket isn't wired to any admin UI yet, so
// every ticket starts and stays "open" until that's built.
export default function SupportTickets() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/support/tickets/mine').then(res => setTickets(res.data)).catch(() => setTickets([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-bold remar-green mb-1">Tickets</h1>
          <p className="text-sm text-gray-500 mb-5">Track the status of what you've sent us via Contact us.</p>

          <button type="button" onClick={() => navigate('/support/contact')}
            className="w-full text-sm font-semibold text-white px-4 py-2.5 rounded-lg hover:opacity-90 transition mb-5"
            style={{ backgroundColor: '#3a6b00' }}>
            New message
          </button>

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No tickets yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {tickets.map(t => (
                <div key={t.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{t.subject}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(t.created_at)}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0 capitalize ${STATUS_STYLE[t.status] || 'bg-gray-100 text-gray-600'}`}>
                      {t.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
