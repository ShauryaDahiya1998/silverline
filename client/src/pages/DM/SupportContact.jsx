import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { showAppError } from '../../utils/errorBus';

// Contact us (Settings > Support > Contact us, and the Support hub). Emails
// REMAR directly and records a support_tickets row (server/routes/support.js)
// so the submission also shows up under Support > Tickets. If the request
// fails outright, falls back to a prefilled mailto: link so the message
// still gets through.
const SUBJECT_OPTIONS = [
  'General question',
  'Report a problem',
  'Account or login issue',
  'Help request issue',
  'Donation question',
  'App feedback',
  'Other',
];

const mailtoFallback = (subject, description) =>
  `mailto:zubinsarkar@gmail.com?subject=${encodeURIComponent(`REMAR Schweiz Support: ${subject}`)}&body=${encodeURIComponent(description)}`;

export default function SupportContact() {
  const navigate = useNavigate();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject || !description.trim()) return;
    setSending(true);
    try {
      await api.post('/support/contact', { subject, description: description.trim() });
      setSent(true);
      setSubject('');
      setDescription('');
    } catch (err) {
      showAppError((err.response?.data?.error || 'Could not send your message') + ' — opening your email app instead.');
      window.location.href = mailtoFallback(subject, description);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-bold remar-green mb-1">Contact us</h1>
          <p className="text-sm text-gray-500 mb-5">We'll respond within 48 hours.</p>

          {sent ? (
            <div>
              <p className="text-sm remar-green font-medium mb-4">Thanks — your message has been sent. We'll respond within 48 hours.</p>
              <button type="button" onClick={() => navigate('/support/tickets')}
                className="text-xs font-semibold text-gray-500 underline hover:text-[#579500] transition">
                Track it under Tickets
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <select value={subject} onChange={e => setSubject(e.target.value)} required
                className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar">
                <option value="">Select a subject…</option>
                {SUBJECT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <textarea value={description} onChange={e => setDescription(e.target.value)} required rows={4}
                placeholder="Describe your question or issue…"
                className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar resize-none" />
              <button type="submit" disabled={sending}
                className="w-full text-sm font-semibold text-white px-4 py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                style={{ backgroundColor: '#3a6b00' }}>
                {sending ? 'Sending…' : 'Send message'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
