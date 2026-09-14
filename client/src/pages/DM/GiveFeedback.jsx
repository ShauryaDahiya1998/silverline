import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import ConfirmModal from '../../components/ConfirmModal';

// Settings > Support > Give App Feedback (replaces the old mailto: link —
// see routes/feedback.js). Star rating + free text; submitting always
// emails REMAR and stores the row for the admin Feedback page (Settings >
// My account > Feedback, admin only). A 5-star rating additionally offers
// to post the same feedback publicly — see PUBLIC_POST_LINKS below.

// TODO: these three need real values once the app has live store listings —
// APP_STORE_ID is the numeric App Store id (from App Store Connect) and
// GOOGLE_PLACE_ID is REMAR's Google Business Profile place id (from Google
// Business Profile / Maps). The Play Store link already works today since
// it only needs the Android package name, which is fixed
// (capacitor.config.json's appId).
const APP_STORE_ID = '';
const GOOGLE_PLACE_ID = '';
const ANDROID_PACKAGE = 'silverline.remar.app.ch';

const PUBLIC_POST_LINKS = [
  {
    key: 'ios',
    label: 'Rate us on the App Store',
    href: APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review` : null,
  },
  {
    key: 'android',
    label: 'Rate us on Google Play',
    href: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}&showAllReviews=true`,
  },
  {
    key: 'google',
    label: 'Leave a Google review',
    href: GOOGLE_PLACE_ID ? `https://search.google.com/local/writereview?placeid=${GOOGLE_PLACE_ID}` : null,
  },
];

export default function GiveFeedback() {
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);
  const [showPublicPrompt, setShowPublicPrompt] = useState(false);
  const [showPublicLinks, setShowPublicLinks] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rating) { setError('Please select a star rating'); return; }
    if (!text.trim()) { setError('Please enter your feedback'); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('/feedback', { rating, text: text.trim() });
      setSubmittedId(res.data.feedback.id);
      if (rating === 5) {
        setShowPublicPrompt(true);
      } else {
        setDone(true);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit feedback — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const answerPublicPrompt = async (consent) => {
    setShowPublicPrompt(false);
    try {
      await api.put(`/feedback/${submittedId}/public-consent`, { consent });
    } catch { /* best-effort — the feedback itself is already saved */ }
    if (consent) setShowPublicLinks(true);
    else setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28 flex items-center justify-center">
        <div className="max-w-lg w-full mx-auto bg-white rounded-2xl shadow-lg p-6 text-center">
          <h1 className="text-lg font-bold remar-green mb-2">Thank you!</h1>
          <p className="text-sm text-gray-500">Your feedback has been sent to the REMAR team.</p>
        </div>
      </div>
    );
  }

  if (showPublicLinks) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28 flex items-center justify-center">
        <div className="max-w-lg w-full mx-auto bg-white rounded-2xl shadow-lg p-6 text-center">
          <h1 className="text-lg font-bold remar-green mb-2">Thank you!</h1>
          <p className="text-sm text-gray-500 mb-6">Pick a place to leave your public review — it'll only take a moment.</p>
          <div className="space-y-2.5">
            {PUBLIC_POST_LINKS.map(link => link.href ? (
              <a key={link.key} href={link.href} target="_blank" rel="noopener noreferrer"
                className="block w-full text-center text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition hover:opacity-90"
                style={{ backgroundColor: '#3a6b00' }}>
                {link.label}
              </a>
            ) : (
              // Not configured yet (see APP_STORE_ID/GOOGLE_PLACE_ID above) —
              // shown disabled rather than hidden, so it's clear this option
              // exists and will work once REMAR is listed there.
              <span key={link.key}
                className="block w-full text-center text-gray-400 bg-gray-100 px-5 py-2.5 rounded-lg font-semibold text-sm cursor-not-allowed">
                {link.label} (coming soon)
              </span>
            ))}
          </div>
          <button type="button" onClick={() => navigate('/support')}
            className="mt-5 text-xs text-gray-500 underline hover:text-[#579500] transition">
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-bold remar-green mb-1">Give App Feedback</h1>
          <p className="text-sm text-gray-500 mb-5">Tell us what's working and what isn't — it goes straight to the REMAR team.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-xs text-red-600">{error}</p>}

            <div>
              <p className="text-xs text-gray-500 mb-1.5">Your rating</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => setRating(n)}
                    className="text-3xl leading-none" style={{ color: n <= rating ? '#d97706' : '#e5e7eb' }}>
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1.5">Your feedback</p>
              <textarea rows={5} value={text} onChange={e => setText(e.target.value)}
                placeholder="What do you like? What could be better?"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-remar" />
            </div>

            <button type="submit" disabled={submitting}
              className="w-full text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#3a6b00' }}>
              {submitting ? 'Sending…' : 'Send feedback'}
            </button>
          </form>
        </div>
      </div>

      <ConfirmModal
        open={showPublicPrompt}
        title="Post this publicly?"
        message="Thank you for the 5-star rating! Would you like to share it as a public review on the App Store, Google Play, or Google?"
        confirmLabel="Yes, post it"
        cancelLabel="No thanks"
        onConfirm={() => answerPublicPrompt(true)}
        onCancel={() => answerPublicPrompt(false)}
      />
    </div>
  );
}
