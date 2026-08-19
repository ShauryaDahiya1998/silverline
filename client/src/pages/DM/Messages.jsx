import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';

const formatDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Account > Chats — threaded messages between this person and REMAR or
// another member (server/routes/messages.js). Each row is a thread; tapping
// it expands the full chain in place (marking it read) with a reply box
// always sitting right below the last message — no separate Read/Hide or
// Reply buttons to find first. Each row shows the other party's name and,
// for a thread tied to a specific help item, that item's Help ID —
// messaging locks itself 7 days after that help item is marked Completed
// (server-enforced; can_send below just mirrors it so the box can hide
// itself instead of failing on Send).
//
// Also reachable with router state { withUserId, withName, helpRowId,
// helpDisplayId } — e.g. from the Help Status page's per-request Chat
// button, or straight after a helper accepts a beneficiary's request —
// which resolves (or, if there's no prior thread for that same help item,
// prepares to start) a direct thread with that specific person about that
// specific help item, and opens it immediately.
export default function Messages() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const location = useLocation();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openThreadId, setOpenThreadId] = useState(null);
  const [chain, setChain] = useState([]);
  const [chainLoading, setChainLoading] = useState(false);
  // The reply box lives right under the chain of whichever thread is open —
  // no separate "start replying" step, so this only tracks the draft text
  // itself, not which thread is "in reply mode" (that's just openThreadId).
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  // A conversation being started fresh (no messages exchanged yet, so it
  // doesn't exist in `threads` — GET /messages/mine only returns threads
  // that already have at least one message) — { userId, name, helpRowId,
  // helpDisplayId }, or null.
  const [newChatWith, setNewChatWith] = useState(null);
  const [newChatText, setNewChatText] = useState('');
  const [newChatSending, setNewChatSending] = useState(false);
  const [newChatError, setNewChatError] = useState('');

  const loadThreads = () => {
    api.get('/messages/mine').then(res => setThreads(res.data)).catch(() => setThreads([])).finally(() => setLoading(false));
  };

  useEffect(() => { loadThreads(); }, []);

  useEffect(() => {
    const withUserId = location.state?.withUserId;
    if (!withUserId) return;
    const withName = location.state?.withName || 'Chat';
    const helpRowId = location.state?.helpRowId || null;
    const helpDisplayId = location.state?.helpDisplayId || null;
    (async () => {
      try {
        const res = await api.get(`/messages/with/${withUserId}`, { params: { help_row_id: helpRowId } });
        if (res.data.thread_id) {
          setOpenThreadId(res.data.thread_id);
          const chainRes = await api.get(`/messages/thread/${res.data.thread_id}`);
          setChain(chainRes.data);
          setThreads(prev => prev.map(t => t.thread_id === res.data.thread_id ? { ...t, unread_count: 0 } : t));
          // Arriving here via a Chat button elsewhere pre-fills the
          // always-present reply box with an editable "Hi" rather than
          // leaving it blank for the person to start from scratch.
          setReplyText('Hi');
        } else {
          setNewChatWith({ userId: withUserId, name: withName, helpRowId, helpDisplayId });
          setNewChatText('Hi');
        }
      } catch {
        setNewChatWith({ userId: withUserId, name: withName, helpRowId, helpDisplayId });
        setNewChatText('Hi');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const sendNewChat = async () => {
    if (!newChatText.trim() || !newChatWith) return;
    setNewChatSending(true);
    setNewChatError('');
    try {
      const res = await api.post('/messages/send', {
        recipient_user_id: newChatWith.userId, body: newChatText.trim(), help_row_id: newChatWith.helpRowId,
      });
      setNewChatText('');
      setNewChatWith(null);
      loadThreads();
      setOpenThreadId(res.data.thread_id);
      const chainRes = await api.get(`/messages/thread/${res.data.thread_id}`);
      setChain(chainRes.data);
    } catch (err) {
      setNewChatError(err.response?.data?.error || 'Could not send — please try again.');
    } finally {
      setNewChatSending(false);
    }
  };

  const openThread = async (threadId) => {
    if (openThreadId === threadId) {
      setOpenThreadId(null);
      return;
    }
    setOpenThreadId(threadId);
    setReplyText('');
    setSendError('');
    setChainLoading(true);
    try {
      const res = await api.get(`/messages/thread/${threadId}`);
      setChain(res.data);
      setThreads(prev => prev.map(t => t.thread_id === threadId ? { ...t, unread_count: 0 } : t));
    } catch {
      setChain([]);
    } finally {
      setChainLoading(false);
    }
  };

  const sendReply = async (threadId) => {
    if (!replyText.trim()) return;
    const lastInChain = chain[chain.length - 1];
    setSending(true);
    setSendError('');
    try {
      await api.post(`/messages/${lastInChain.id}/reply`, { body: replyText.trim() });
      setReplyText('');
      const res = await api.get(`/messages/thread/${threadId}`);
      setChain(res.data);
      loadThreads();
    } catch (err) {
      setSendError(err.response?.data?.error || 'Could not send — please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 pb-28">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-bold remar-green mb-1">Chats</h1>
          <p className="text-sm text-gray-500 mb-5">
            {isAdmin ? 'Chats between you and beneficiaries and helpers' : 'Chats between you and other members or Remar'}
          </p>

          {/* A conversation just started from elsewhere (e.g. Help Status'
              Chat button) with no messages yet — not part of `threads` until
              the first message is actually sent, so it's rendered as its
              own card above the list rather than forced into it. */}
          {newChatWith && (
            <div className="rounded-xl bg-gray-50 px-4 py-3 mb-3">
              <p className="text-sm font-semibold text-gray-900">{newChatWith.name}</p>
              {newChatWith.helpDisplayId && <p className="text-xs text-gray-400 mb-1">{newChatWith.helpDisplayId}</p>}
              <p className="text-xs text-gray-400 mb-3">No messages yet — say hello.</p>
              {newChatError && <p className="text-xs text-red-600 mb-2">{newChatError}</p>}
              <textarea rows={2} value={newChatText} onChange={e => setNewChatText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendNewChat();
                  }
                }}
                placeholder="Write a message…"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar" />
              <div className="flex justify-end gap-3 mt-2">
                <button type="button" onClick={() => setNewChatWith(null)}
                  className="text-xs font-semibold text-gray-400 hover:underline">
                  Cancel
                </button>
                <button type="button" onClick={sendNewChat} disabled={newChatSending || !newChatText.trim()}
                  className="text-xs font-semibold text-white px-4 py-1.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                  style={{ backgroundColor: '#3a6b00' }}>
                  {newChatSending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
          ) : threads.length === 0 && !newChatWith ? (
            <p className="text-sm text-gray-400 text-center py-6">No chats yet.</p>
          ) : (
            <div className="space-y-2">
              {threads.map(t => {
                const m = t.last_message;
                const isOpen = openThreadId === t.thread_id;
                const unread = t.unread_count > 0;
                return (
                  <div key={t.thread_id} className="rounded-xl bg-gray-50 px-4 py-3">
                    <button type="button" onClick={() => openThread(t.thread_id)}
                      className="w-full flex items-start gap-3 text-left">
                      {unread && <span className="w-2 h-2 rounded-full bg-[#3a6b00] mt-1.5 flex-shrink-0" />}
                      <div className={`min-w-0 flex-1 ${unread ? '' : 'ml-5'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm truncate ${unread ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{t.other_name}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(m.created_at)}</span>
                        </div>
                        {t.help && <p className="text-xs text-gray-400">{t.help.help_id}</p>}
                        {/* Hidden once open — the full chain below already
                            ends with this same last message, so showing both
                            repeated it right above itself (see item 3). */}
                        {!isOpen && <p className="text-sm text-gray-500 mt-1 line-clamp-1">{m.body}</p>}
                        {!isOpen && t.message_count > 1 && <p className="text-xs text-gray-400 mt-1">{t.message_count} messages</p>}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="mt-3 ml-5">
                        {chainLoading ? (
                          <p className="text-xs text-gray-400 py-2">Loading…</p>
                        ) : (
                          <div className="space-y-2 bg-white rounded-xl p-3">
                            {chain.map(cm => {
                              const isMine = cm.sender_user_id === user?.id;
                              return (
                                <div key={cm.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[75%] text-xs rounded-2xl px-3 py-1.5 leading-snug ${isMine ? 'bg-remar-light text-gray-800' : 'bg-white text-gray-700 shadow-sm'}`}>
                                    <p className={`text-[10px] mb-0.5 ${isMine ? 'text-gray-500' : 'text-gray-400'}`}>{cm.sender_name} · {formatDate(cm.created_at)}</p>
                                    {cm.body}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {t.can_send ? (
                          <>
                            {sendError && <p className="text-xs text-red-600 mt-2">{sendError}</p>}
                            {/* Always sits right below the last message once
                                the thread is open — no separate "start reply"
                                step. Enter sends; Shift+Enter adds a newline. */}
                            <div className="mt-2 flex items-end gap-2">
                              <textarea rows={1} value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendReply(t.thread_id);
                                  }
                                }}
                                placeholder="Write a message…"
                                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-remar resize-none" />
                              <button type="button" onClick={() => sendReply(t.thread_id)} disabled={sending || !replyText.trim()}
                                className="text-xs font-semibold text-white px-4 py-2.5 rounded-lg hover:opacity-90 transition disabled:opacity-50 flex-shrink-0"
                                style={{ backgroundColor: '#3a6b00' }}>
                                {sending ? '…' : 'Send'}
                              </button>
                            </div>
                          </>
                        ) : (
                          // help item completed more than 7 days ago — see
                          // isHelpLocked in messages.js, the actual enforcement.
                          <p className="text-xs text-gray-400 mt-2 text-center">
                            Messaging closed — it's been more than 7 days since this help was marked Completed.
                          </p>
                        )}
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
