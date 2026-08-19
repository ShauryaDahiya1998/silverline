import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api, { apiErrorMessage } from '../../api';
import { showAppError } from '../../utils/errorBus';
import ConfirmModal from '../../components/ConfirmModal';

// Same fixed list as server/routes/auth.js's DELETE_REASONS — kept in sync
// by hand since it's only 6 short strings; the server accepts anything if
// this ever drifts (falls back to storing it as 'Other').
const REASONS = [
  'No longer need the app',
  'Privacy concerns',
  'Found help elsewhere',
  'Too many notifications',
  'Difficult to use',
  'Other',
];

// Settings > My account > Delete account. A single page walking through all
// four steps the request asked for, rather than stacking separate modals:
// 'confirm' (are you sure) -> 'reason' (dropdown) -> 'otp' (email/phone
// verification) -> 'success' (5-second popup, then sign out to Login).
export default function DeleteAccount() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [step, setStep] = useState('confirm');
  const [reason, setReason] = useState('');
  // Free-text box that only appears when reason === 'Other' — the person
  // isn't required to fill it in, so a blank box just leaves the reason as
  // the literal string 'Other' at submit time (see effectiveReason below).
  const [otherReasonText, setOtherReasonText] = useState('');
  const [methods, setMethods] = useState(null); // { maskedEmail, maskedPhone }
  const [method, setMethod] = useState('email');
  const [sending, setSending] = useState(false);
  const [sentInfo, setSentInfo] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [verifying, setVerifying] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    api.get('/auth/delete-account/methods').then(res => setMethods(res.data)).catch(() => {});
  }, []);

  const goToReason = () => setStep('reason');
  const cancelToSettings = () => navigate('/settings');

  const sendOtp = async () => {
    setSending(true);
    try {
      const res = await api.post('/auth/delete-account/send-otp', { method });
      setSentInfo(`Code sent to ${res.data.maskedIdentifier}`);
      setDigits(['', '', '', '', '', '']);
      setStep('otp');
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (err) {
      showAppError(apiErrorMessage(err, 'Could not send verification code'));
    } finally {
      setSending(false);
    }
  };

  // If 'Other' is picked and they typed something in the follow-up box,
  // that free text is the actual reason stored server-side — the literal
  // word 'Other' on its own isn't very useful feedback on its own.
  const effectiveReason = reason === 'Other' && otherReasonText.trim() ? otherReasonText.trim() : reason;

  const verifyAndDelete = async (code) => {
    setVerifying(true);
    try {
      await api.post('/auth/delete-account/confirm', { method, otp: code, reason: effectiveReason });
      setStep('success');
      // Give the 5-second confirmation its full time on screen before
      // clearing auth state — logging out immediately would flip
      // ProtectedRoute's `user` check and yank this page away mid-message.
      setTimeout(() => {
        logout();
        navigate('/login');
      }, 5000);
    } catch (err) {
      const data = err.response?.data;
      showAppError(data?.error || 'Incorrect code — please try again');
      if (data?.expired) {
        setStep('reason');
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
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (next.every(Boolean)) verifyAndDelete(next.join(''));
    if (v && i < 5) inputRefs.current[i + 1]?.focus();
  };

  const handleDigitKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputRefs.current[i - 1]?.focus();
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
    if (pasted.length === 6) verifyAndDelete(pasted);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28 flex items-start justify-center">
      {step === 'confirm' ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          {step === 'reason' && (
            <>
              <h1 className="text-lg font-bold text-gray-800 mb-1">Why are you leaving?</h1>
              <p className="text-sm text-gray-500 mb-4">This helps REMAR Schweiz improve — optional, but appreciated.</p>
              <select value={reason} onChange={(e) => setReason(e.target.value)}
                className={`w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${reason === 'Other' ? 'mb-3' : 'mb-6'}`}
                style={{ '--tw-ring-color': '#3a6b00' }}>
                <option value="">Select a reason…</option>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>

              {reason === 'Other' && (
                <textarea value={otherReasonText} onChange={(e) => setOtherReasonText(e.target.value)}
                  placeholder="Tell us more (optional)" rows={3} maxLength={255}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm mb-6 focus:outline-none focus:ring-2 resize-none"
                  style={{ '--tw-ring-color': '#3a6b00' }} />
              )}

              <p className="text-xs text-gray-500 mb-2">Send a verification code to confirm:</p>
              <div className="flex gap-2 mb-6">
                <button type="button" onClick={() => setMethod('email')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${method === 'email' ? 'text-white' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
                  style={method === 'email' ? { backgroundColor: '#3a6b00', borderColor: '#3a6b00' } : {}}>
                  Email {methods?.maskedEmail ? `(${methods.maskedEmail})` : ''}
                </button>
                {methods?.maskedPhone && (
                  <button type="button" onClick={() => setMethod('phone')}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${method === 'phone' ? 'text-white' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
                    style={method === 'phone' ? { backgroundColor: '#3a6b00', borderColor: '#3a6b00' } : {}}>
                    Phone ({methods.maskedPhone})
                  </button>
                )}
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={cancelToSettings}
                  className="flex-1 border border-gray-300 text-gray-600 px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button type="button" onClick={sendOtp} disabled={!reason || sending}
                  className="flex-1 bg-red-600 text-white px-4 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition disabled:opacity-50">
                  {sending ? 'Sending…' : 'Send code'}
                </button>
              </div>
            </>
          )}

          {step === 'otp' && (
            <>
              <h1 className="text-lg font-bold text-gray-800 mb-1">Enter verification code</h1>
              <p className="text-sm text-gray-500 mb-5">{sentInfo}</p>

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

              <button type="button" onClick={() => verifyAndDelete(digits.join(''))}
                disabled={verifying || digits.some((d) => !d)}
                className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold text-sm transition hover:opacity-90 disabled:opacity-60 mb-3">
                {verifying ? 'Deleting account…' : 'Verify & delete account'}
              </button>

              <div className="flex justify-between text-sm">
                <button type="button" onClick={sendOtp} disabled={sending}
                  className="hover:underline disabled:opacity-60" style={{ color: '#3a6b00' }}>
                  Resend code
                </button>
                <button type="button" onClick={cancelToSettings} className="text-gray-400 hover:underline">
                  Cancel
                </button>
              </div>
            </>
          )}

          {step === 'success' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h1 className="text-lg font-bold text-gray-800 mb-2">Account deleted</h1>
              <p className="text-sm text-gray-500">Your REMAR Schweiz account has been permanently deleted. Taking you to the login page…</p>
            </div>
          )}
        </div>
      </div>
      )}

      <ConfirmModal
        open={step === 'confirm'}
        title="Delete your account?"
        message="This permanently deletes your account, profile, help history and messages. This cannot be undone."
        confirmLabel="Yes, delete my account"
        cancelLabel="Cancel"
        danger
        onConfirm={goToReason}
        onCancel={cancelToSettings}
      />
    </div>
  );
}
