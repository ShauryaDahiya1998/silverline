import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';

export default function ForgotPassword() {
const [email, setEmail] = useState('');
const [sent, setSent] = useState(false);
const [loading, setLoading] = useState(false);

const handleSubmit = async (e) => {
e.preventDefault();
setLoading(true);
try {
await api.post('/auth/forgot-password', { email });
setSent(true);
} catch {
setSent(true); // Show same message regardless to avoid exposing emails
} finally {
setLoading(false);
}
};

return (
<div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
<div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
<h2 className="text-2xl font-bold text-gray-800 mb-1">Forgot password?</h2>
<p className="text-gray-500 text-sm mb-6">Enter your email and we'll send you a reset link.</p>

{sent ? (
<div className="text-center">
<p className="text-green-700 font-medium mb-4">
If that email is registered, a reset link has been sent.
</p>
<Link to="/login" className="text-sm underline" style={{ color: '#579500' }}>Back to Login</Link>
</div>
) : (
<form onSubmit={handleSubmit} className="space-y-4">
<input type="email" required placeholder="you@example.com" value={email}
onChange={e => setEmail(e.target.value)}
className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
<button type="submit" disabled={loading}
className="w-full text-white py-3 rounded-lg font-semibold text-sm transition hover:opacity-90"
style={{ backgroundColor: '#579500' }}>
{loading ? 'Sending...' : 'Send Reset Link'}
</button>
<p className="text-center text-sm text-gray-500">
<Link to="/login" className="underline" style={{ color: '#579500' }}>Back to Login</Link>
</p>
</form>
)}
</div>
</div>
);
}
