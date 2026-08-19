import { useEffect, useState } from 'react';
import api from '../../api';
import PageHeader from '../../components/PageHeader';

export default function AdminDashboard() {
const [stats, setStats] = useState({ volunteers: 0, beneficiaries: 0, helps: 0, assignments: 0 });
const [volunteers, setVolunteers] = useState([]);
const [beneficiaries, setBeneficiaries] = useState([]);
const [helps, setHelps] = useState([]);
const [honors, setHonors] = useState([]);
const [tab, setTab] = useState('overview');

// Grant Honor form (Remar honors — real awards/recognitions given to a
// helper by an admin; shown as a count on the helper's My Contribution page)
const [honorRecipient, setHonorRecipient] = useState('');
const [honorTitle, setHonorTitle] = useState('');
const [honorDescription, setHonorDescription] = useState('');
const [grantingHonor, setGrantingHonor] = useState(false);
const [honorError, setHonorError] = useState('');

const loadHonors = () => api.get('/honors').then(res => setHonors(res.data)).catch(() => setHonors([]));

useEffect(() => {
const load = async () => {
const [v, b, h, a] = await Promise.all([
api.get('/helpers'),
api.get('/beneficiaries'),
api.get('/help'),
api.get('/assignments'),
]);
setVolunteers(v.data);
setBeneficiaries(b.data);
setHelps(h.data);
setStats({
volunteers: v.data.length,
beneficiaries: b.data.length,
helps: h.data.length,
assignments: a.data.length,
});
};
load();
loadHonors();
}, []);

const exportCSV = (type) => {
window.open(`/api/${type}/export/csv`, '_blank');
};

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

const StatCard = ({ label, value, color }) => (
<div className={`rounded-xl p-6 text-white ${color} shadow`}>
<p className="text-4xl font-bold">{value}</p>
<p className="mt-1 text-sm opacity-90">{label}</p>
</div>
);

return (
<div className="min-h-screen bg-green-50 p-6">
<div className="max-w-6xl mx-auto">
<PageHeader title="Admin Dashboard" titleClassName="text-2xl font-bold remar-green" />

{/* Stats */}
<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
<StatCard label="Volunteers" value={stats.volunteers} color="bg-remar" />
<StatCard label="Beneficiaries" value={stats.beneficiaries} color="bg-remar" />
<StatCard label="Help items" value={stats.helps} color="bg-yellow-500" />
<StatCard label="Assignments" value={stats.assignments} color="bg-remar" />
</div>

{/* Tabs */}
<div className="flex gap-2 mb-4">
{['overview', 'volunteers', 'beneficiaries', 'help', 'honors'].map(t => (
<button key={t} onClick={() => setTab(t)}
className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${
tab === t ? 'bg-remar text-white' : 'bg-white text-gray-600 hover:bg-remar-light border'
}`}>
{t}
</button>
))}
</div>

<div className="bg-white rounded-xl shadow p-6">
{tab === 'overview' && (
<div>
<h2 className="font-semibold remar-green mb-4">Recent Help</h2>
<div className="space-y-2">
{helps.slice(0, 5).map(help => (
<div key={help.id} className="flex items-center justify-between p-3 border rounded-lg">
<span className="font-medium">{help.title}</span>
<span className={`text-xs px-2 py-1 rounded-full ${
help.status === 'open' ? 'bg-remar-light remar-green' :
help.status === 'assigned' ? 'bg-yellow-100 text-yellow-700' :
'bg-gray-100 text-gray-600'
}`}>{help.status}</span>
</div>
))}
</div>
</div>
)}

{tab === 'volunteers' && (
<div>
<div className="flex justify-between items-center mb-4">
<h2 className="font-semibold remar-green">Volunteers ({volunteers.length})</h2>
<button onClick={() => exportCSV('volunteers')}
className="text-sm bg-yellow-400 text-green-900 px-4 py-1 rounded font-semibold hover:bg-yellow-300 transition">
Export CSV
</button>
</div>
<div className="overflow-x-auto">
<table className="w-full text-sm">
<thead><tr className="text-left text-gray-500 border-b">
<th className="pb-2">Name</th><th className="pb-2">Gender</th>
<th className="pb-2">Age Group</th><th className="pb-2">Phone</th><th className="pb-2">Skills</th>
</tr></thead>
<tbody>
{volunteers.map(v => (
<tr key={v.id} className="border-b hover:bg-green-50">
<td className="py-2 font-medium">{v.name}</td>
<td className="py-2">{v.gender}</td>
<td className="py-2">{v.age_group}</td>
<td className="py-2">{v.phone}</td>
<td className="py-2">{v.skills?.join(', ')}</td>
</tr>
))}
</tbody>
</table>
</div>
</div>
)}

{tab === 'beneficiaries' && (
<div>
<div className="flex justify-between items-center mb-4">
<h2 className="font-semibold remar-green">Beneficiaries ({beneficiaries.length})</h2>
<button onClick={() => exportCSV('beneficiaries')}
className="text-sm bg-yellow-400 text-green-900 px-4 py-1 rounded font-semibold hover:bg-yellow-300 transition">
Export CSV
</button>
</div>
<div className="overflow-x-auto">
<table className="w-full text-sm">
<thead><tr className="text-left text-gray-500 border-b">
<th className="pb-2">Name</th><th className="pb-2">Gender</th>
<th className="pb-2">Age Group</th><th className="pb-2">Phone</th><th className="pb-2">Support Needs</th>
</tr></thead>
<tbody>
{beneficiaries.map(b => (
<tr key={b.id} className="border-b hover:bg-green-50">
<td className="py-2 font-medium">{b.name}</td>
<td className="py-2">{b.gender}</td>
<td className="py-2">{b.age_group}</td>
<td className="py-2">{b.phone}</td>
<td className="py-2">{b.support_needs?.join(', ')}</td>
</tr>
))}
</tbody>
</table>
</div>
</div>
)}

{tab === 'help' && (
<div>
<h2 className="font-semibold remar-green mb-4">All Help ({helps.length})</h2>
<div className="space-y-3">
{helps.map(help => (
<div key={help.id} className="border rounded-lg p-4">
<div className="flex justify-between items-start">
<div>
<h3 className="font-medium">{help.title}</h3>
<p className="text-sm text-gray-500 mt-1">{help.description}</p>
{help.scheduled_date && (
<p className="text-xs text-gray-400 mt-1">
{new Date(help.scheduled_date).toLocaleDateString()}
</p>
)}
</div>
<span className={`text-xs px-2 py-1 rounded-full ml-4 ${
help.status === 'open' ? 'bg-remar-light remar-green' :
help.status === 'assigned' ? 'bg-yellow-100 text-yellow-700' :
help.status === 'completed' ? 'bg-blue-100 text-blue-700' :
'bg-gray-100 text-gray-600'
}`}>{help.status}</span>
</div>
</div>
))}
</div>
</div>
)}

{tab === 'honors' && (
<div>
<h2 className="font-semibold remar-green mb-4">Grant Remar Honor</h2>
<form onSubmit={handleGrantHonor} className="grid sm:grid-cols-2 gap-3 mb-6">
<select value={honorRecipient} onChange={e => setHonorRecipient(e.target.value)}
className="border rounded-lg px-3 py-2 text-sm sm:col-span-2" required>
<option value="">Select a helper…</option>
{volunteers.map(v => (
<option key={v.id} value={v.user_id}>{v.name}{v.member_number ? ` (${v.member_number})` : ''}</option>
))}
</select>
<input type="text" value={honorTitle} onChange={e => setHonorTitle(e.target.value)}
placeholder="Title (e.g. Volunteer of the Month)" className="border rounded-lg px-3 py-2 text-sm" required />
<input type="text" value={honorDescription} onChange={e => setHonorDescription(e.target.value)}
placeholder="Description (optional)" className="border rounded-lg px-3 py-2 text-sm" />
<div className="sm:col-span-2 flex items-center gap-3">
<button type="submit" disabled={grantingHonor}
className="text-sm bg-remar text-white px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50">
{grantingHonor ? 'Granting…' : 'Grant Honor'}
</button>
{honorError && <p className="text-xs text-red-500">{honorError}</p>}
</div>
</form>

<h2 className="font-semibold remar-green mb-4">Granted Honors ({honors.length})</h2>
<div className="space-y-2">
{honors.length === 0 && <p className="text-sm text-gray-400">No honors granted yet.</p>}
{honors.map(h => (
<div key={h.id} className="flex items-start justify-between p-3 border rounded-lg">
<div>
<p className="font-medium">{h.title}</p>
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
)}
</div>
</div>
</div>
);
}
