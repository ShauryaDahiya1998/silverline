import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

// In-app Help bot — reachable from the Support hub (Support.jsx) and
// Settings > Support > Help bot. Answers common questions with simple
// keyword matching (no external AI service wired up); anything it can't
// answer routes the person to Contact us.
// The full transcript is saved as one Chats entry (support_chats) when the
// person navigates away, as long as they actually said something.

const FAQ = [
  { keywords: ['password', 'reset', 'forgot'], reply: "You can reset your password from Settings → Change password, or on the Login page via “Forgot password?”." },
  { keywords: ['edit profile', 'profile', 'update my details', 'change my info'], reply: 'Go to Settings → Edit profile to update your details anytime — it’s the same form as registration, just without the password fields.' },
  { keywords: ['new help', 'request help', 'offer help', 'submit'], reply: 'Tap the + icon in the bottom navigation, or the “New Help” button on Home, to submit a new help request or offer.' },
  { keywords: ['status', 'ongoing', 'track'], reply: 'Check Home → Help ongoing to see the status of your requests — tap any row for the full timeline.' },
  { keywords: ['history', 'past', 'completed'], reply: 'Home → Help history lists everything that’s been completed, with ratings and hours.' },
  { keywords: ['donate', 'donation', 'bank transfer'], reply: 'You can donate via Home → Donate, using the bank transfer details shown there.' },
  { keywords: ['certificate'], reply: 'Request your volunteering certificate from Home → Request Certificate.' },
  { keywords: ['map', 'nearby', 'area'], reply: 'Map View (bottom nav) shows help available near your preferred regions.' },
  { keywords: ['contact', 'human', 'agent', 'person', 'talk to someone'], reply: "I'll get you to a real person — tap “Contact us” below, or email zubinsarkar@gmail.com." },
];

const getBotReply = (text) => {
  const lower = text.toLowerCase();
  const match = FAQ.find(f => f.keywords.some(k => lower.includes(k)));
  if (match) return match.reply;
  return "I'm not sure about that one yet. Try asking about a help request, your profile, password reset, or donations — or tap “Contact us” below to reach a real person.";
};

const SUGGESTIONS = ['How do I request help?', 'How do I reset my password?', 'How do I edit my profile?', 'Talk to a human'];

// crypto.randomUUID() only exists in secure contexts (HTTPS, or Capacitor's
// own local scheme) — on a plain-http origin (e.g. local dev testing over a
// LAN IP) it's undefined, and calling it threw uncaught here, which is what
// produced the blank screen: React has no error boundary around this page,
// so an error thrown during the initial render (in the useRef initializer
// below) unmounts the whole tree instead of just this component. This
// fallback keeps the page working regardless of secure-context support.
const makeSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const INITIAL_MESSAGES = [
  { from: 'bot', text: "Hi! I'm the REMAR Help bot. Ask me about requesting help, your profile, donations, or anything else — or tap “Contact us” any time to reach a real person." },
];

export default function SupportChatbot() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);
  const sessionIdRef = useRef(makeSessionId());
  const messagesRef = useRef(messages);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Save the transcript once, when the person leaves this page — only if
  // they actually exchanged at least one message beyond the bot's opener.
  useEffect(() => {
    return () => {
      const msgs = messagesRef.current;
      if (msgs.length > INITIAL_MESSAGES.length) {
        api.post('/support/chats', { id: sessionIdRef.current, messages: msgs }).catch(() => {});
      }
    };
  }, []);

  const send = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages(prev => [...prev, { from: 'user', text: trimmed }]);
    setInput('');
    setTyping(true);
    // Simulated "thinking" delay so it reads like a chat, not an instant lookup.
    setTimeout(() => {
      setMessages(prev => [...prev, { from: 'bot', text: getBotReply(trimmed) }]);
      setTyping(false);
    }, 500);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-32 flex flex-col">
      <div className="max-w-lg mx-auto w-full flex-1 flex flex-col">
        <div ref={scrollRef} className="bg-white rounded-2xl shadow-lg p-4 flex-1 overflow-y-auto space-y-3 mb-3" style={{ maxHeight: '55vh' }}>
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] text-sm rounded-2xl px-3.5 py-2 leading-snug ${
                  m.from === 'user' ? 'bg-remar-light text-gray-800' : 'bg-white text-gray-700 shadow-sm'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex justify-start">
              <div className="bg-white text-gray-400 text-sm rounded-2xl px-3.5 py-2 shadow-sm">…</div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {SUGGESTIONS.map(s => (
            <button key={s} type="button" onClick={() => send(s)}
              className="text-xs font-medium remar-green bg-white border border-gray-200 rounded-full px-3 py-1.5 hover:bg-gray-50 transition">
              {s}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 mb-3">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask a question…"
            className="flex-1 border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
          <button type="submit"
            className="text-white px-5 rounded-lg font-semibold text-sm whitespace-nowrap hover:opacity-90 transition"
            style={{ backgroundColor: '#3a6b00' }}>
            Send
          </button>
        </form>

        <button type="button" onClick={() => navigate('/support/contact')}
          className="text-xs text-gray-500 underline hover:text-[#579500] transition text-center">
          Not what you needed? Contact us
        </button>
      </div>
    </div>
  );
}
