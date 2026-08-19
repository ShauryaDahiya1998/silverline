import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../../api';
import { showAppError } from '../../utils/errorBus';

const ROLE_LABELS = { helper: 'helper', beneficiary: 'beneficiary' };

export default function RegisterVerify() {
  const { role } = useParams();
  const navigate = useNavigate();
  const roleLabel = ROLE_LABELS[role] || 'account';

  const [method, setMethod] = useState('email'); // 'email' | 'phone'
  const [identifier, setIdentifier] = useState('');
  const [step, setStep] = useState('enter'); // 'enter' | 'verify'
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [info, setInfo] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const inputRefs = useRef([]);

  const sendOtp = async (e) => {
    e?.preventDefault();
    setInfo('');
    if (!identifier.trim()) {
      showAppError(`Enter your ${method === 'email' ? 'email address' : 'phone number'}`);
      return;
    }
    setSending(true);
    try {
      const res = await api.post('/otp/send', { identifier: identifier.trim(), method });
      setInfo(res.data.message);
      setDigits(['', '', '', '', '', '']);
      setStep('verify');
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (err) {
      showAppError(err.response?.data?.error || 'Could not send verification code');
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async (code) => {
    setVerifying(true);
    try {
      const res = await api.post('/otp/verify', { identifier: identifier.trim(), method, otp: code });
      if (res.data.verified) {
        navigate(`/register/${role}`, { state: { verifiedIdentifier: identifier.trim(), verifiedMethod: method } });
      }
    } catch (err) {
      const data = err.response?.data;
      showAppError(data?.error || 'Incorrect code — please try again');
      if (data?.expired) {
        setStep('enter');
      } else {
        setDigits(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleDigitChange = (i, value) => {
    const v = value.replace(/\D/g, '').slice(-1);
    // Build the next array and call verifyOtp() here, outside setDigits —
    // not inside a functional updater. React (in Strict Mode, dev only)
    // intentionally invokes updater functions twice to catch impure ones;
    // verifyOtp() living inside one meant it fired twice per completed
    // code — the 2nd call always failed ("No pending verification code",
    // since the 1st call had already marked it verified) and popped a
    // confusing error right after the 1st call's own successful redirect.
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (next.every(Boolean)) verifyOtp(next.join(''));
    if (v && i < 5) inputRefs.current[i + 1]?.focus();
  };

  const handleDigitKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = pasted.split('');
    while (next.length < 6) next.push('');
    setDigits(next);
    const lastIndex = Math.min(pasted.length, 6) - 1;
    inputRefs.current[lastIndex]?.focus();
    if (pasted.length === 6) verifyOtp(pasted);
  };

  // WebOTP API — on supporting mobile browsers, automatically reads a code
  // texted to the phone and fills it in without the user typing it.
  useEffect(() => {
    if (step !== 'verify' || method !== 'phone' || !('OTPCredential' in window)) return;
    const ac = new AbortController();
    navigator.credentials.get({ otp: { transport: ['sms'] }, signal: ac.signal })
      .then((otp) => {
        const code = otp?.code?.replace(/\D/g, '');
        if (code?.length === 6) {
          setDigits(code.split(''));
          verifyOtp(code);
        }
      })
      .catch(() => {});
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, method]);

  const cancelRegistration = () => navigate('/login');

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#f5f9f0' }}>
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Verify to register</h2>
          <p className="text-gray-500 text-sm mb-6">
            Confirm your {method === 'email' ? 'email address' : 'phone number'} to continue registering as a {roleLabel}
          </p>

          {info && (
            <div className="bg-gray-50 border border-gray-200 text-gray-600 p-3 rounded-lg mb-4 text-sm">
              {info}
            </div>
          )}

          {step === 'enter' && (
            <form onSubmit={sendOtp}>
              <div className="flex gap-2 mb-4">
                <button type="button" onClick={() => setMethod('email')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
                    method === 'email' ? 'text-white' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                  }`}
                  style={method === 'email' ? { backgroundColor: '#3a6b00', borderColor: '#3a6b00' } : {}}>
                  Email address
                </button>
                <button type="button" onClick={() => setMethod('phone')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
                    method === 'phone' ? 'text-white' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                  }`}
                  style={method === 'phone' ? { backgroundColor: '#3a6b00', borderColor: '#3a6b00' } : {}}>
                  Phone number
                </button>
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-1">
                {method === 'email' ? 'Email address' : 'Phone number'}
              </label>
              <input type={method === 'email' ? 'email' : 'tel'} value={identifier} autoFocus
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={method === 'email' ? 'you@example.com' : '+41 79 123 45 67'}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 mb-5"
                style={{ '--tw-ring-color': '#3a6b00' }} />

              <button type="submit" disabled={sending}
                className="w-full text-white py-3 rounded-lg font-semibold text-sm transition hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: '#3a6b00' }}>
                {sending ? 'Sending code…' : 'Send verification code'}
              </button>
            </form>
          )}

          {step === 'verify' && (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                Enter the 6-digit code sent to <span className="font-semibold text-gray-700">{identifier}</span>
              </p>

              <div className="flex justify-between gap-2 mb-5" onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input key={i} ref={(el) => (inputRefs.current[i] = el)}
                    type="text" inputMode="numeric" maxLength={1} value={d}
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(i, e)}
                    disabled={verifying}
                    className="w-11 h-12 text-center text-lg font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': '#3a6b00' }} />
                ))}
              </div>

              <button type="button" onClick={() => verifyOtp(digits.join(''))}
                disabled={verifying || digits.some((d) => !d)}
                className="w-full text-white py-3 rounded-lg font-semibold text-sm transition hover:opacity-90 disabled:opacity-60 mb-3"
                style={{ backgroundColor: '#3a6b00' }}>
                {verifying ? 'Verifying…' : 'Verify'}
              </button>

              <div className="flex justify-between text-sm">
                <button type="button" onClick={sendOtp} disabled={sending}
                  className="hover:underline disabled:opacity-60" style={{ color: '#3a6b00' }}>
                  Resend code
                </button>
                <button type="button" onClick={cancelRegistration} className="text-gray-400 hover:underline">
                  Cancel registration
                </button>
              </div>
            </div>
          )}

          <p className="text-sm text-center text-gray-500 mt-6 pt-5 border-t border-gray-100">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold hover:underline" style={{ color: '#3a6b00' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
