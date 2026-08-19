import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import PasswordInput from '../../components/PasswordInput';
import { showAppError } from '../../utils/errorBus';

// Settings > Account > Change password. Standard rule: at least 8
// characters with 1 letter and 1 number (enforced client- and server-side —
// server/routes/auth.js PUT /auth/change-password).
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export default function ChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const ruleError = newPassword && (newPassword.length < 8 || !PASSWORD_RULE.test(newPassword))
    ? 'Must be at least 8 characters with at least 1 letter and 1 number'
    : '';
  const matchError = retypePassword && retypePassword !== newPassword ? 'Passwords do not match' : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (ruleError || matchError) return;
    setSaving(true);
    try {
      await api.put('/auth/change-password', { currentPassword, newPassword });
      setSaved(true);
      setCurrentPassword('');
      setNewPassword('');
      setRetypePassword('');
    } catch (err) {
      showAppError(err.response?.data?.error || 'Could not change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-bold remar-green mb-1">Change password</h1>
          <p className="text-sm text-gray-500 mb-5">Use at least 8 characters, with 1 letter and 1 number.</p>

          {saved ? (
            <div>
              <p className="text-sm remar-green font-medium mb-4">Your password has been changed.</p>
              <button type="button" onClick={() => navigate('/settings')}
                className="text-xs font-semibold text-gray-500 underline hover:text-[#579500] transition">
                Back to Settings
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Current password</label>
                <PasswordInput required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">New password</label>
                <PasswordInput required minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
                {ruleError && <p className="text-xs text-red-500 mt-1">{ruleError}</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Retype new password</label>
                <PasswordInput required minLength={8} value={retypePassword} onChange={e => setRetypePassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
                {matchError && <p className="text-xs text-red-500 mt-1">{matchError}</p>}
              </div>
              <button type="submit" disabled={saving || !!ruleError || !!matchError}
                className="w-full text-sm font-semibold text-white px-4 py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                style={{ backgroundColor: '#3a6b00' }}>
                {saving ? 'Saving…' : 'Change password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
