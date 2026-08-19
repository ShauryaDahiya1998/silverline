import { useEffect, useState } from 'react';
import api from '../../api';
import PageHeader from '../../components/PageHeader';

// Grant/revoke Remar honors — same logic previously inline on the old
// AdminDashboard.jsx "Honors" tab, now its own page reached from Admin
// Home > Services > Honors.
export default function AdminHonors() {
  const [volunteers, setVolunteers] = useState([]);
  const [honors, setHonors] = useState([]);

  const [honorRecipient, setHonorRecipient] = useState('');
  const [honorTitle, setHonorTitle] = useState('');
  const [honorDescription, setHonorDescription] = useState('');
  const [grantingHonor, setGrantingHonor] = useState(false);
  const [honorError, setHonorError] = useState('');

  const loadHonors = () => api.get('/honors').then(res => setHonors(res.data)).catch(() => setHonors([]));

  useEffect(() => {
    api.get('/helpers').then(res => setVolunteers(res.data)).catch(() => {});
    loadHonors();
  }, []);

  const volunteerName = (userId) => {
    const v = volunteers.find(v => v.user_id === userId);
    return v ? `${v.name}${v.member_number ? ` (${v.member_number})` : ''}` : 'Unknown';
  };

  const handleGrantHonor = async (e) => {
    e.preventDefault();
    if (!honorRecipient || !honorTitle.trim()) return;
    setGrantingHonor(true);
    setHonorError('');
    try {
      await api.post('/honors', { user_id: honorRecipient, title: honorTitle.trim(), description: honorDescription.trim() || null });
      setHonorTitle('');
      setHonorDescription('');
      setHonorRecipient('');
      await loadHonors();
    } catch (err) {
      setHonorError(err.response?.data?.error || 'Could not grant honor');
    } finally {
      setGrantingHonor(false);
    }
  };

  const handleRevokeHonor = async (id) => {
    await api.delete(`/honors/${id}`);
    loadHonors();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-2xl mx-auto">
        <PageHeader title="Honors" />

        <div className="bg-white rounded-2xl shadow-lg p-5 mb-4">
          <h2 className="font-semibold remar-green text-sm mb-4">Grant Remar Honor</h2>
          <form onSubmit={handleGrantHonor} className="grid sm:grid-cols-2 gap-3">
            <select value={honorRecipient} onChange={e => setHonorRecipient(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2 focus:outline-none focus:ring-2 focus:ring-remar" required>
              <option value="">Select a helper…</option>
              {volunteers.map(v => (
                <option key={v.id} value={v.user_id}>{v.name}{v.member_number ? ` (${v.member_number})` : ''}</option>
              ))}
            </select>
            <input type="text" value={honorTitle} onChange={e => setHonorTitle(e.target.value)}
              placeholder="Title (e.g. Volunteer of the Month)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar" required />
            <input type="text" value={honorDescription} onChange={e => setHonorDescription(e.target.value)}
              placeholder="Description (optional)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
            <div className="sm:col-span-2 flex items-center gap-3">
              <button type="submit" disabled={grantingHonor}
                className="text-sm text-white px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50"
                style={{ backgroundColor: '#3a6b00' }}>
                {grantingHonor ? 'Granting…' : 'Grant Honor'}
              </button>
              {honorError && <p className="text-xs text-red-500">{honorError}</p>}
            </div>
          </form>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-5">
          <h2 className="font-semibold remar-green text-sm mb-4">Granted Honors ({honors.length})</h2>
          <div className="space-y-2">
            {honors.length === 0 && <p className="text-sm text-gray-400">No honors granted yet.</p>}
            {honors.map(h => (
              <div key={h.id} className="flex items-start justify-between p-3 rounded-lg bg-gray-50">
                <div>
                  <p className="font-medium text-sm text-gray-800">{h.title}</p>
                  <p className="text-sm text-gray-500">{volunteerName(h.user_id)}</p>
                  {h.description && <p className="text-sm text-gray-500 mt-1">{h.description}</p>}
                  <p className="text-xs text-gray-400 mt-1">{new Date(h.awarded_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => handleRevokeHonor(h.id)}
                  className="text-xs text-red-500 hover:underline flex-shrink-0 ml-4">
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
