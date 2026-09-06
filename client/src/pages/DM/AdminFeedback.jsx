import { useEffect, useState } from 'react';
import api from '../../api';
import PageHeader from '../../components/PageHeader';

// Every app feedback submission (Settings > Support > Give App Feedback,
// server/routes/feedback.js), newest first. Reached from Settings > My
// account > Feedback (admin only). Read-only — there's no action to take
// here beyond reading; publicConsent just tells the admin whether this
// 5-star review is also live somewhere public.
const Stars = ({ rating }) => (
  <span className="text-sm leading-none">
    {[1, 2, 3, 4, 5].map(n => (
      <span key={n} style={{ color: n <= rating ? '#d97706' : '#e5e7eb' }}>★</span>
    ))}
  </span>
);

const PublicBadge = ({ rating, consent }) => {
  if (rating !== 5) return null;
  if (consent === true) return <span className="text-xs px-2 py-1 rounded-full bg-remar-light remar-green">Posted publicly</span>;
  if (consent === false) return <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500">Kept private</span>;
  return <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">Awaiting response</span>;
};

export default function AdminFeedback() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/feedback').then(res => setItems(res.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-2xl mx-auto">
        <PageHeader title="Feedback" />

        <div className="bg-white rounded-2xl shadow-lg p-5">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No app feedback submitted yet.</p>
          ) : (
            <div className="space-y-2">
              {items.map(f => (
                <div key={f.id} className="p-3 rounded-lg bg-gray-50">
                  <div className="flex items-start justify-between gap-3">
                    <Stars rating={f.rating} />
                    <PublicBadge rating={f.rating} consent={f.public_consent} />
                  </div>
                  <p className="text-sm text-gray-700 mt-1.5 whitespace-pre-line">{f.feedback_text}</p>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {f.user_email} ({f.user_role}) · {new Date(f.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
