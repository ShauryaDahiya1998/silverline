import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const keyFor = (userId, helpRowId) => `${userId}:${helpRowId || 'none'}`;
const formatTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

// Chat widget (item 2) — chats now live right on the Help ID page itself,
// right above the bottom nav, instead of navigating away to Account >
// Chats. Multiple people can each have their own chat going against the
// same help item (e.g. several requesters — see item 3's admin use too) —
// every one opened stays around as a minimized header stacked above the
// nav; only one can be expanded (open) at a time, same as a typical
// messenger's "chat heads". A minimized header lights up once a new
// message arrives on it (polled — no websocket infra in this app, so
// "real-time" here means every 6s). Every message still lands in the same
// `messages` table (see messages.js) Account > Chats already reads from —
// nothing here is a separate/parallel history, it's the same conversations,
// just reachable inline from wherever they're actually relevant.
//
// Mounted once per page (see HelpStatus.jsx) and driven via a ref: call
// `ref.current.open({ userId, name, helpRowId, helpDisplayId })` from any
// Chat button instead of navigating to /messages.
const ChatWidget = forwardRef(function ChatWidget({ onHeightChange }, ref) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [expandedKey, setExpandedKey] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [sending, setSending] = useState(false);
  const rootRef = useRef(null);

  // Mirrors of the two pieces of state the polling interval (below) needs
  // to read without going stale inside its own closure.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const expandedKeyRef = useRef(expandedKey);
  expandedKeyRef.current = expandedKey;

  // Reports this widget's actual rendered height to whoever's hosting it
  // (see HelpStatus.jsx) so the page can reserve enough scroll room below
  // its own content — the widget floats via position:fixed right above the
  // bottom nav, so nothing in normal page flow accounts for it otherwise,
  // and its height changes constantly (more sessions stack it taller, an
  // expanded chat is much taller than a minimized header row). A
  // ResizeObserver catches every one of those cases without having to hand
  // -calculate row/gap pixel math here that could drift from the actual
  // rendered CSS. Reports 0 once every session is closed.
  useEffect(() => {
    if (!onHeightChange) return undefined;
    if (sessions.length === 0) { onHeightChange(0); return undefined; }
    const el = rootRef.current;
    if (!el) return undefined;
    const report = () => onHeightChange(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sessions.length, expandedKey, onHeightChange]);

  const loadChain = async (threadId) => (await api.get(`/messages/thread/${threadId}`)).data;

  const refreshSession = async (key, threadId) => {
    if (!threadId) return;
    try {
      const chain = await loadChain(threadId);
      setSessions(prev => prev.map(s => (s.key === key ? { ...s, chain, threadId } : s)));
    } catch { /* best-effort poll/refresh — silently skip on failure */ }
  };

  const open = async ({ userId, name, helpRowId, helpDisplayId }) => {
    if (!userId || userId === user?.id) return;
    const key = keyFor(userId, helpRowId);
    const existing = sessionsRef.current.find(s => s.key === key);
    if (existing) {
      setExpandedKey(key);
      setSessions(prev => prev.map(s => (s.key === key ? { ...s, unread: false } : s)));
      refreshSession(key, existing.threadId);
      return;
    }
    // Resolve the thread BEFORE creating a session under `key`, so a
    // session already open under a DIFFERENT key for the same underlying
    // thread can be found and reused instead — e.g. a Store item's
    // creator resolves to a stable system account for display, but the
    // server may redirect an actual lookup/send to whichever real admin
    // already has a thread going (see resolveStoreRecipient in
    // messages.js); without this cross-check that mismatch would open a
    // second, duplicate chat window for what's really one conversation.
    try {
      const res = await api.get(`/messages/with/${userId}`, { params: helpRowId ? { help_row_id: helpRowId } : {} });
      const threadId = res.data.thread_id;
      const byThread = threadId ? sessionsRef.current.find(s => s.threadId === threadId) : null;
      if (byThread) {
        setExpandedKey(byThread.key);
        setSessions(prev => prev.map(s => (s.key === byThread.key ? { ...s, unread: false } : s)));
        refreshSession(byThread.key, threadId);
        return;
      }
      setExpandedKey(key);
      const chain = threadId ? await loadChain(threadId) : [];
      setSessions(prev => [...prev, {
        key, userId, name: name || 'Chat', helpRowId: helpRowId || null, helpDisplayId: helpDisplayId || null,
        threadId, chain, unread: false, loading: false,
      }]);
    } catch {
      setExpandedKey(key);
      setSessions(prev => [...prev, {
        key, userId, name: name || 'Chat', helpRowId: helpRowId || null, helpDisplayId: helpDisplayId || null,
        threadId: null, chain: [], unread: false, loading: false,
      }]);
    }
  };

  // Silently adds a session that already has a known thread, minimized (no
  // expandedKey change) and pre-seeded with whatever unread state the
  // caller already knows — used by HelpStatus.jsx to auto-surface a chat
  // that started before the viewer ever hit the page (e.g. the other party
  // messaged first), so it shows up here every time this Help ID page
  // loads rather than only after someone taps Chat. A no-op if a session
  // for this key already exists, so it never clobbers one the person is
  // already looking at or has already read.
  const ensureSession = async ({ userId, name, helpRowId, helpDisplayId, threadId, unread }) => {
    if (!userId || userId === user?.id) return;
    const key = keyFor(userId, helpRowId);
    if (sessionsRef.current.find(s => s.key === key)) return;
    // Same cross-key guard as open(): if a session for this exact thread
    // already exists under a different key (e.g. the person already hit
    // Chat and opened it under the system-account key), just bump its
    // unread flag instead of adding a second window for the same thread.
    if (threadId) {
      const byThread = sessionsRef.current.find(s => s.threadId === threadId);
      if (byThread) {
        if (unread) setSessions(prev => prev.map(s => (s.key === byThread.key ? { ...s, unread: true } : s)));
        return;
      }
    }
    setSessions(prev => [...prev, {
      key, userId, name: name || 'Chat', helpRowId: helpRowId || null, helpDisplayId: helpDisplayId || null,
      threadId: threadId || null, chain: [], unread: !!unread, loading: true,
    }]);
    try {
      const chain = threadId ? await loadChain(threadId) : [];
      setSessions(prev => prev.map(s => (s.key === key ? { ...s, chain, loading: false } : s)));
    } catch {
      setSessions(prev => prev.map(s => (s.key === key ? { ...s, loading: false } : s)));
    }
  };

  useImperativeHandle(ref, () => ({ open, ensureSession }));

  const close = (key) => {
    setSessions(prev => prev.filter(s => s.key !== key));
    setDrafts(prev => { const n = { ...prev }; delete n[key]; return n; });
    setExpandedKey(prev => (prev === key ? null : prev));
  };

  // Only one chat can be expanded at a time (item 2) — expanding a
  // different one implicitly minimizes whichever was open, since
  // expandedKey is a single value, not a set.
  const toggleMinimize = (key) => {
    const wasOpen = expandedKeyRef.current === key;
    setExpandedKey(wasOpen ? null : key);
    if (!wasOpen) {
      const s = sessionsRef.current.find(x => x.key === key);
      if (s) refreshSession(key, s.threadId);
      setSessions(prev => prev.map(x => (x.key === key ? { ...x, unread: false } : x)));
    }
  };

  const send = async (session) => {
    const text = (drafts[session.key] || '').trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await api.post('/messages/send', {
        recipient_user_id: session.userId, body: text,
        help_row_id: session.helpRowId || undefined,
        thread_id: session.threadId || undefined,
      });
      const threadId = res.data.thread_id;
      const chain = await loadChain(threadId);
      setSessions(prev => prev.map(s => (s.key === session.key ? { ...s, threadId, chain } : s)));
      setDrafts(prev => ({ ...prev, [session.key]: '' }));
    } catch {
      /* best-effort — draft stays put so they can retry */
    } finally {
      setSending(false);
    }
  };

  // Polls for new messages across every open session every 6s — highlights
  // a minimized header once its thread's unread_count rises above 0, and
  // silently pulls the latest chain for whichever one is currently
  // expanded (so an incoming reply shows up without needing a manual
  // reopen).
  useEffect(() => {
    if (sessions.length === 0) return undefined;
    const tick = async () => {
      try {
        const threads = (await api.get('/messages/mine')).data;
        const curExpanded = expandedKeyRef.current;
        setSessions(prev => prev.map(s => {
          if (s.key === curExpanded) return s;
          const t = threads.find(th => th.thread_id === s.threadId);
          return t && t.unread_count > 0 ? { ...s, unread: true } : s;
        }));
        const exp = sessionsRef.current.find(s => s.key === curExpanded);
        if (exp?.threadId) refreshSession(exp.key, exp.threadId);
      } catch { /* best-effort */ }
    };
    const id = setInterval(tick, 6000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length]);

  if (sessions.length === 0) return null;

  return (
    <div ref={rootRef} className="fixed left-0 right-0 z-40 pointer-events-none" style={{ bottom: '76px' }}>
      {/* items-end (was items-stretch inside a centered max-w-3xl mx-auto
          column) — dropped that centering cap so the half-width chat window
          right-aligns against the actual screen edge rather than the edge
          of an invisible centered box. */}
      <div className="px-4 flex flex-col items-end gap-1.5">
        {sessions.map((s) => {
          const isOpen = s.key === expandedKey;
          return (
            <div key={s.key} className="pointer-events-auto">
              {isOpen ? (
                <div className="bg-white shadow-2xl border border-gray-200 flex flex-col overflow-hidden w-[50vw]" style={{ height: '340px' }}>
                  {/* Header — square corners (no rounding, unlike the rest of
                      the app's cards) and half the previous height: was
                      ~56px (px-4 py-2.5 plus a two-line name/ID stack), now a
                      fixed 28px with everything on one line to fit. */}
                  <div onClick={() => toggleMinimize(s.key)}
                    className="flex items-center justify-between gap-2 px-3 flex-shrink-0 cursor-pointer"
                    style={{ backgroundColor: '#3a6b00', height: '28px' }}>
                    <span className="min-w-0 text-left flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-white truncate">{s.name}</span>
                      {s.helpDisplayId && <span className="text-[9px] text-white/80 flex-shrink-0">{s.helpDisplayId}</span>}
                    </span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleMinimize(s.key); }}
                        className="w-4 h-4 flex items-center justify-center rounded hover:bg-white/20 text-white text-xs leading-none" title="Minimize">
                        &#8212;
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); close(s.key); }}
                        className="w-4 h-4 flex items-center justify-center rounded hover:bg-white/20 text-white text-[10px] leading-none" title="Close">
                        &#10005;
                      </button>
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 bg-gray-50">
                    {s.loading ? (
                      <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
                    ) : s.chain.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">No messages yet — say hello.</p>
                    ) : s.chain.map(m => {
                      const mine = m.sender_user_id === user?.id;
                      return (
                        <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] text-xs rounded-2xl px-3 py-1.5 leading-snug ${mine ? 'bg-remar-light text-gray-800' : 'bg-white text-gray-700 shadow-sm'}`}>
                            <p className={`text-[10px] mb-0.5 ${mine ? 'text-gray-500' : 'text-gray-400'}`}>{formatTime(m.created_at)}</p>
                            {m.body}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-end gap-2 px-2.5 py-2 border-t border-gray-100 flex-shrink-0">
                    <textarea rows={1} value={drafts[s.key] || ''}
                      onChange={e => setDrafts(prev => ({ ...prev, [s.key]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(s); } }}
                      placeholder="Write a message…"
                      className="flex-1 border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-remar resize-none" />
                    <button type="button" onClick={() => send(s)} disabled={sending || !(drafts[s.key] || '').trim()}
                      className="text-[11px] font-semibold text-white px-3 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50 flex-shrink-0"
                      style={{ backgroundColor: '#3a6b00' }}>
                      Send
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => toggleMinimize(s.key)}
                  className="flex items-center justify-between gap-2 px-3 shadow-lg transition border border-gray-200 w-[50vw]"
                  style={{ backgroundColor: s.unread ? '#e8f5d0' : '#ffffff', height: '28px' }}>
                  <span className="min-w-0 text-left flex items-center gap-1.5">
                    {s.unread && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#3a6b00' }} />}
                    <span className={`block text-xs truncate ${s.unread ? 'font-bold' : 'font-semibold text-gray-700'}`} style={s.unread ? { color: '#3a6b00' } : undefined}>
                      {s.name}
                    </span>
                    {s.helpDisplayId && <span className="text-[10px] text-gray-400 flex-shrink-0">{s.helpDisplayId}</span>}
                  </span>
                  <span onClick={(e) => { e.stopPropagation(); close(s.key); }}
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-black/10 text-gray-400 text-xs leading-none flex-shrink-0" title="Close">
                    &#10005;
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default ChatWidget;
