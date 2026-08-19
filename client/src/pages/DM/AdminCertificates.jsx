import { useEffect, useState } from 'react';
import api from '../../api';
import PageHeader from '../../components/PageHeader';
import { showAppError } from '../../utils/errorBus';

const STATUS_STYLE = {
  pending: 'bg-yellow-100 text-yellow-700',
  issued: 'bg-remar-light remar-green',
  rejected: 'bg-gray-100 text-gray-500',
};

// Contribution certificate requests, submitted by helpers from My
// Contribution > Request Certificate (server/routes/certificates.js
// POST /request). Admin reviews and either issues the PDF — emailed
// straight to the requesting helper (covering every completed help item on
// record for them), not downloaded to the admin's own browser — or rejects
// the request.
export default function AdminCertificates() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  // Brief "Emailed to <address>" confirmation shown next to the row that was
  // just issued — the status badge itself flips to "issued" too, but this
  // makes clear where it actually went.
  const [issuedNote, setIssuedNote] = useState(null);

  const load = () => api.get('/certificates/requests').then(res => setRequests(res.data)).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => {
    load();
    // Clears the "new" highlight on this service's Admin Home tile — see
    // certificates.js's /unseen (read on AdminHome) and /mark-seen (here).
    api.post('/certificates/mark-seen').catch(() => {});
  }, []);

  const handleIssue = async (id) => {
    setBusyId(id);
    setIssuedNote(null);
    try {
      const res = await api.post(`/certificates/requests/${id}/issue`);
      setIssuedNote({ id, email: res.data.emailedTo });
      load();
    } catch (err) {
      showAppError(err.response?.data?.error || 'Could not issue this certificate');
    } finally {
      setBusyId('');
    }
  };

  const handleReject = async (id) => {
    setBusyId(id);
    try {
      await api.put(`/certificates/requests/${id}/reject`);
      load();
    } catch (err) {
      showAppError(err.response?.data?.error || 'Could not reject this request');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-2xl mx-auto">
        <PageHeader title="Certificates" />

        <div className="bg-white rounded-2xl shadow-lg p-5">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No certificate requests yet.</p>
          ) : (
            <div className="space-y-2">
              {requests.map(r => (
                <div key={r.id} className="flex items-start justify-between p-3 rounded-lg bg-gray-50">
                  <div>
                    <p className="font-medium text-sm text-gray-800">
                      {r.helper_name || 'Unknown helper'}{r.member_number ? ` (${r.member_number})` : ''}
                    </p>
                    <p className="text-sm text-gray-500">{r.period_label}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0 ml-4">
                    <span className={`text-xs px-2 py-1 rounded-full capitalize ${STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-500'}`}>
                      {r.status}
                    </span>
                    {r.status === 'pending' && (
                      <div className="flex gap-2">
                        <button type="button" disabled={busyId === r.id} onClick={() => handleIssue(r.id)}
                          className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: '#3a6b00' }}>
                          {busyId === r.id ? 'Emailing…' : 'Issue'}
                        </button>
                        <button type="button" disabled={busyId === r.id} onClick={() => handleReject(r.id)}
                          className="text-xs text-red-500 hover:underline">
                          Reject
                        </button>
                      </div>
                    )}
                    {issuedNote?.id === r.id && (
                      <p className="text-[10px] text-gray-400 text-right">Emailed to {issuedNote.email}</p>
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
