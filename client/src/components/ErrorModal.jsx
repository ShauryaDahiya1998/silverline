import { useEffect, useState } from 'react';
import { subscribeAppError } from '../utils/errorBus';

// App-wide error popup — mounted once near the root (see App.jsx). Any
// page's validation/submit code, or the shared axios instance in api.js
// (for failed API calls in general), triggers it via showAppError(message)
// instead of managing its own inline red-text banner. Dismissing it — OK,
// clicking the backdrop, or Escape — just clears the message; nothing else
// on the page needs to know it happened.
export default function ErrorModal() {
  const [message, setMessage] = useState('');

  useEffect(() => subscribeAppError(setMessage), []);

  useEffect(() => {
    if (!message) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMessage(''); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [message]);

  if (!message) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999] p-4"
      onClick={() => setMessage('')}>
      <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-6 text-center"
        onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-gray-700 mb-5 whitespace-pre-line">{message}</p>
        <button type="button" onClick={() => setMessage('')}
          className="bg-remar text-white px-8 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition">
          OK
        </button>
      </div>
    </div>
  );
}
