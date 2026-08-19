import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../../api';

export default function ResetPassword() {
const [searchParams] = useSearchParams();
const token = searchParams.get('token');
const [password, setPassword] = useState('');
const [confirm, setConfirm] = useState('');
const [status, setStatus] = useState('form'); // form | success | error
const [loading, setLoading] = useState(false);

const handleSubmit = async (e) => {
e.preventDefault();
if (password !== confirm) return alert('Passwords do not match');
setLoading(true);
try {
await api.post(`/auth/reset-password/${token}`, { password });
setStatus('success');
} catch (err) {
setStatus('error');
} finally {
setLoading(false);
}
};

return (
<div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
<div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
<h2 className="text-2xl font-bold text-gray-800 mb-1">Set new password</h2>

{status === 'form' && (
<form onSubmit={handleSubmit} className="space-y-4 mt-6">
<div>
<label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
<input type="password" required minLength={6} placeholder="••••••••" value={password}
onChange={e => setPassword(e.target.value)}
className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
</div>
<div>
<label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
<input type="password" required minLength={6} placeholder="••••••••" value={confirm}
onChange={e => setConfirm(e.target.value)}
className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
</div>
<button type="submit" disabled={loading}
className="w-full text-white py-3 rounded-lg font-semibold text-sm transition hover:opacity-90"
style={{ backgroundColor: '#579500' }}>
{loading ? 'Resetting...' : 'Reset Password'}
</button>
</form>
)}

{status === 'success' && (
<div className="mt-6 text-center">
<p className="text-green-700 font-medium mb-4">Password reset successfully!</p>
<Link to="/login"
className="inline-block text-white px-6 py-3 rounded-lg font-semibold text-sm"
style={{ backgroundColor: '#579500' }}>
Go to Login
</Link>
</div>
)}

{status === 'error' && (
<div className="mt-6 text-center">
<p className="text-red-600 font-medium mb-4">This reset link is invalid or has expired.</p>
<Link to="/forgot-password" className="underline text-sm" style={{ color: '#579500' }}>
Request a new one
</Link>
</div>
)}
</div>
</div>
);
}
