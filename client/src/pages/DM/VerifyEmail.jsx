import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../../api';

export default function VerifyEmail() {
const [searchParams] = useSearchParams();
const token = searchParams.get('token');
const [status, setStatus] = useState(token ? 'loading' : 'waiting');
const [email, setEmail] = useState('');
const [resent, setResent] = useState(false);

useEffect(() => {
if (!token) return;
api.get(`/auth/verify-email/${token}`)
.then(() => setStatus('success'))
.catch(() => setStatus('error'));
}, [token]);

const handleResend = async (e) => {
e.preventDefault();
try {
await api.post('/auth/resend-verification', { email });
setResent(true);
} catch (err) {
alert(err.response?.data?.error || 'Failed to resend');
}
};

return (
<div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
<div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
<div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
style={{ backgroundColor: '#f0f8e8' }}>
<svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#579500" strokeWidth={2}>
<path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
</svg>
</div>

{status === 'waiting' && (
<>
<h2 className="text-xl font-bold text-gray-800 mb-2">Check your email</h2>
<p className="text-gray-500 text-sm mb-6">
We've sent a verification link to your email address. Click the link to activate your account.
</p>
<p className="text-gray-400 text-xs mb-4">Didn't receive it?</p>
{resent ? (
<p className="text-green-600 text-sm font-medium">Verification email resent!</p>
) : (
<form onSubmit={handleResend} className="flex gap-2">
<input type="email" required placeholder="Enter your email" value={email}
onChange={e => setEmail(e.target.value)}
className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
<button type="submit"
className="text-white px-4 py-2 rounded-lg text-sm font-semibold"
style={{ backgroundColor: '#579500' }}>
Resend
</button>
</form>
)}
</>
)}

{status === 'loading' && (
<p className="text-gray-500">Verifying your email...</p>
)}

{status === 'success' && (
<>
<h2 className="text-xl font-bold text-gray-800 mb-2">Email verified!</h2>
<p className="text-gray-500 text-sm mb-6">Your account is now active. You can log in.</p>
<Link to="/login"
className="inline-block text-white px-6 py-3 rounded-lg font-semibold text-sm"
style={{ backgroundColor: '#579500' }}>
Go to Login
</Link>
</>
)}

{status === 'error' && (
<>
<h2 className="text-xl font-bold text-gray-800 mb-2">Link invalid or expired</h2>
<p className="text-gray-500 text-sm mb-6">Please request a new verification email.</p>
<Link to="/login" className="text-sm underline" style={{ color: '#579500' }}>Back to Login</Link>
</>
)}
</div>
</div>
);
}
