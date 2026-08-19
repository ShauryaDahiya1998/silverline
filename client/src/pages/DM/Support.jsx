import { useNavigate } from 'react-router-dom';

// Landing page reached from the bottom nav's Support icon — a simple menu
// into the four Support destinations (also reachable individually from
// Settings > Support): Bot, Contact us, Chats, Tickets.
const ITEMS = [
  {
    key: 'bot', label: 'Bot', path: '/support/chatbot',
    description: 'Get an instant answer from our chat bot.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0">
        <rect x="3" y="8" width="18" height="12" rx="2" />
        <circle cx="8.5" cy="14" r="1.25" />
        <circle cx="15.5" cy="14" r="1.25" />
        <path d="M12 8V4" /><circle cx="12" cy="3" r="1" />
      </svg>
    ),
  },
  {
    key: 'contact', label: 'Contact us', path: '/support/contact',
    description: 'Send us a message — we respond within 48 hours.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0">
        <path d="M4 4h16v16H4z" /><path d="M4 6l8 7 8-7" />
      </svg>
    ),
  },
  {
    key: 'chats', label: 'Support chats', path: '/support/chats',
    description: 'Your past conversations with the Bot.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    key: 'tickets', label: 'Tickets', path: '/support/tickets',
    description: 'Track the status of what you’ve sent us.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0">
        <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" />
      </svg>
    ),
  },
];

export default function Support() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-bold remar-green mb-1">Support</h1>
          <p className="text-sm text-gray-500 mb-5">How can we help?</p>

          <div className="space-y-2">
            {ITEMS.map(item => (
              <button key={item.key} type="button" onClick={() => navigate(item.path)}
                className="w-full flex items-center gap-3 text-left p-3 rounded-xl hover:bg-gray-50 transition">
                <span className="remar-green">{item.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-800">{item.label}</span>
                  <span className="block text-xs text-gray-400">{item.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
