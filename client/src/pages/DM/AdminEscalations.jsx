import { useEffect, useState } from 'react';
import api from '../../api';
import PageHeader from '../../components/PageHeader';
import { showAppError } from '../../utils/errorBus';

// Escalations — every support ticket submitted via Settings > Support >
// Contact us (server/routes/support.js), across every user, with open ones
// surfaced first. Reached from Admin Home > Services > Escalations.
export default function AdminEscalations() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const load = () => api.get('/support/tickets').then(res => setTickets(res.data)).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => {
    load();
    // Clears the "new" highlight on this service's Admin Home tile — see
    // support.js's /tickets/unseen (read on AdminHome) and /tickets/mark-seen (here).
    api.post('/support/tickets/mark-seen').catch(() => {});
  }, []);

  const handleResolve = async (id) => {
    setBusyId(id);
    try {
      await api.put(`/support/tickets/${id}/resolve`);
      load();
    } catch (err) {
      showAppError(err.response?.data?.error || 'Could not resolve this ticket');
    } finally {
      setBusyId('');
    }
  };

  const openCount = tickets.filter(t => t.status === 'open').length;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-2xl mx-auto">
        <PageHeader title={`Escalations${openCount ? ` (${openCount} open)` : ''}`} />

        <div className="bg-white rounded-2xl shadow-lg p-5">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No escalations — nothing waiting on admin.</p>
          ) : (
            <div className="space-y-2">
              {tickets.map(t => (
                <div key={t.id} className="flex items-start justify-between p-3 rounded-lg bg-gray-50">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-gray-800">{t.subject}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{t.description}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {t.user_email} ({t.user_role}) · {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0 ml-4">
                    <span className={`text-xs px-2 py-1 rounded-full capitalize ${
                      t.status === 'open' ? 'bg-yellow-100 text-yellow-700' : 'bg-remar-light remar-green'
                    }`}>
                      {t.status}
                    </span>
                    {t.status === 'open' && (
                      <button type="button" disabled={busyId === t.id} onClick={() => handleResolve(t.id)}
                        className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: '#3a6b00' }}>
                        {busyId === t.id ? 'Working…' : 'Resolve'}
                      </button>
                    )}
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
