import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

const formatDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Past Bot conversations (Settings > Support > Chats / Support hub). Each
// session is saved once when the person navigates away from the Bot page
// (see SupportChatbot.jsx) — tapping a row expands its full transcript
// in place rather than opening a separate detail page.
export default function SupportChats() {
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    api.get('/support/chats/mine').then(res => setChats(res.data)).catch(() => setChats([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-bold remar-green mb-1">Support chats</h1>
          <p className="text-sm text-gray-500 mb-5">Your past conversations with the Bot.</p>

          <button type="button" onClick={() => navigate('/support/chatbot')}
            className="w-full text-sm font-semibold text-white px-4 py-2.5 rounded-lg hover:opacity-90 transition mb-5"
            style={{ backgroundColor: '#3a6b00' }}>
            Start a new chat
          </button>

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
          ) : chats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No past chats yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {chats.map(chat => {
                const isOpen = openId === chat.id;
                const firstUserMsg = chat.messages.find(m => m.from === 'user');
                return (
                  <div key={chat.id} className="py-2.5">
                    <button type="button" onClick={() => setOpenId(isOpen ? null : chat.id)}
                      className="w-full flex items-center justify-between gap-3 text-left">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-800 truncate">{firstUserMsg?.text || 'Chat'}</span>
                        <span className="block text-xs text-gray-400">{formatDate(chat.updated_at)} · {chat.messages.length} messages</span>
                      </span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="mt-3 space-y-2 bg-gray-50 rounded-xl p-3">
                        {chat.messages.map((m, i) => (
                          <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] text-xs rounded-2xl px-3 py-1.5 leading-snug ${m.from === 'user' ? 'bg-remar-light text-gray-800' : 'bg-white text-gray-700 shadow-sm'}`}>
                              {m.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
