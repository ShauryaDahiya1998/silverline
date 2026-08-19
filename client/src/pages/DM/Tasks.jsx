import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';

export default function Tasks() {
const { user } = useAuth();
const [searchParams] = useSearchParams();
const [tasks, setTasks] = useState([]);
const [myAssignments, setMyAssignments] = useState([]);
// ?new=1 still opens this inline form directly if linked to explicitly,
// though the bottom nav / Home's "New Help" buttons now go to the
// dedicated /help/new page (client/src/pages/NewHelp.jsx) instead.
const [showForm, setShowForm] = useState(searchParams.get('new') === '1');
const [form, setForm] = useState({ title: '', description: '', location: '', scheduled_date: '', duration_hours: '', required_skills: '' });

const [applications, setApplications] = useState([]);

const load = async () => {
const res = await api.get('/help');
setTasks(res.data);
if (user?.role === 'helper') {
const aRes = await api.get('/assignments/my');
setMyAssignments(aRes.data);
}
if (user?.role === 'beneficiary') {
const aRes = await api.get('/assignments/for-me');
setApplications(aRes.data);
}
};

useEffect(() => { load(); }, []);

const handleRespond = async (assignmentId, status) => {
try {
await api.put(`/assignments/${assignmentId}/respond`, { status });
load();
} catch (err) {
alert(err.response?.data?.error || 'Failed to respond');
}
};

const handleApply = async (helpRowId) => {
try {
await api.post('/assignments/apply', { help_row_id: helpRowId });
load();
} catch (err) {
alert(err.response?.data?.error || 'Failed to apply');
}
};

const handleCreate = async (e) => {
e.preventDefault();
await api.post('/help', {
...form,
required_skills: form.required_skills.split(',').map(s => s.trim()).filter(Boolean)
});
setForm({ title: '', description: '', location: '', scheduled_date: '', duration_hours: '', required_skills: '' });
setShowForm(false);
load();
};

const updateStatus = async (id, status) => {
const task = tasks.find(t => t.id === id);
await api.put(`/help/${id}`, { ...task, status });
load();
};

return (
<div className="min-h-screen bg-green-50 p-6">
<div className="max-w-4xl mx-auto">
<div className="flex justify-between items-center mb-6">
<h1 className="text-2xl font-bold remar-green">
{user?.role === 'beneficiary' ? 'Available Tasks' : 'Volunteer Opportunities'}
</h1>
{(user?.role === 'admin' || user?.role === 'beneficiary' || user?.role === 'helper') && (
<button onClick={() => setShowForm(!showForm)}
className="bg-remar text-white px-4 py-2 rounded-lg font-semibold text-sm whitespace-nowrap hover:bg-remar transition">
+ New Task
</button>
)}
</div>

{showForm && (
<div className="bg-white rounded-xl shadow p-6 mb-6">
<h2 className="font-semibold remar-green mb-4">Create New Task</h2>
<form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
<input required placeholder="Task title" value={form.title}
onChange={e => setForm({ ...form, title: e.target.value })}
className="col-span-2 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar" />
<textarea placeholder="Description" value={form.description}
onChange={e => setForm({ ...form, description: e.target.value })}
className="col-span-2 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar resize-none" rows={3} />
<input placeholder="Location" value={form.location}
onChange={e => setForm({ ...form, location: e.target.value })}
className="border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar" />
<input type="datetime-local" value={form.scheduled_date}
onChange={e => setForm({ ...form, scheduled_date: e.target.value })}
className="border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar" />
<input placeholder="Duration (hours)" type="number" step="0.5" value={form.duration_hours}
onChange={e => setForm({ ...form, duration_hours: e.target.value })}
className="border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar" />
<input placeholder="Required skills (comma separated)" value={form.required_skills}
onChange={e => setForm({ ...form, required_skills: e.target.value })}
className="border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-remar" />
<div className="col-span-2 flex gap-2">
<button type="submit" className="bg-remar text-white px-6 py-2 rounded-lg font-semibold text-sm hover:bg-remar transition">
Create
</button>
<button type="button" onClick={() => setShowForm(false)}
className="border px-6 py-2 rounded-lg hover:bg-gray-50 transition">
Cancel
</button>
</div>
</form>
</div>
)}

{user?.role === 'beneficiary' && applications.length > 0 && (
<div className="mb-6">
<h2 className="text-lg font-bold text-gray-800 mb-3">Volunteer Applications</h2>
<div className="space-y-3">
{applications.map(app => (
<div key={app.id} className="bg-white rounded-xl shadow p-4 flex items-center justify-between">
<div>
<p className="font-semibold text-gray-800">{app.volunteer_name}</p>
<p className="text-sm text-gray-500">Applied for: {app.task_title}</p>
{app.volunteer_phone && <p className="text-xs text-gray-400">{app.volunteer_phone}</p>}
</div>
<div className="flex gap-2">
<button onClick={() => handleRespond(app.id, 'confirmed')}
className="text-xs text-white px-3 py-1.5 rounded-full font-semibold"
style={{ backgroundColor: '#579500' }}>
Accept
</button>
<button onClick={() => handleRespond(app.id, 'cancelled')}
className="text-xs text-white px-3 py-1.5 rounded-full font-semibold bg-red-500">
Reject
</button>
</div>
</div>
))}
</div>
</div>
)}

<div className="space-y-3">
{tasks.map(task => (
<div key={task.id} className="bg-white rounded-xl shadow p-5">
<div className="flex justify-between items-start">
<div className="flex-1">
<h3 className="font-semibold text-lg">{task.title}</h3>
<p className="text-gray-500 text-sm mt-1">{task.description}</p>
<div className="flex gap-4 mt-2 text-xs text-gray-400">
{task.location && <span>📍 {task.location}</span>}
{task.scheduled_date && <span>📅 {new Date(task.scheduled_date).toLocaleDateString()}</span>}
{task.duration_hours && <span>⏱ {task.duration_hours}h</span>}
</div>
{task.required_skills?.length > 0 && (
<div className="flex gap-1 mt-2 flex-wrap">
{task.required_skills.map(s => (
<span key={s} className="bg-remar-light remar-green text-xs px-2 py-0.5 rounded-full">{s}</span>
))}
</div>
)}
</div>
<div className="ml-4 flex flex-col items-end gap-2">
<span className={`text-xs px-2 py-1 rounded-full ${
task.status === 'open' ? 'bg-remar-light remar-green' :
task.status === 'assigned' ? 'bg-yellow-100 text-yellow-700' :
task.status === 'completed' ? 'bg-blue-100 text-blue-700' :
'bg-gray-100 text-gray-600'
}`}>{task.status}</span>
{user?.role === 'admin' && task.status !== 'completed' && (
<button onClick={() => updateStatus(task.id, 'completed')}
className="text-xs remar-green hover:underline">
Mark complete
</button>
)}
{user?.role === 'helper' && task.status === 'open' && (() => {
const applied = myAssignments.find(a => a.help_row_id === task.id);
return applied ? (
<span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
{applied.status === 'pending' ? 'Applied' : applied.status}
</span>
) : (
<button onClick={() => handleApply(task.id)}
className="text-xs text-white px-3 py-1 rounded-full font-semibold"
style={{ backgroundColor: '#579500' }}>
Apply
</button>
);
})()}
</div>
</div>
</div>
))}
{tasks.length === 0 && (
<div className="text-center py-12 text-gray-400">No tasks yet. Create the first one!</div>
)}
</div>
</div>
</div>
);
}
