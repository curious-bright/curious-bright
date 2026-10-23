import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch, apiVoid } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { useAuth } from '../state/AuthContext';
import {
  useMessaging,
  type ChatMessage,
  type ConversationSummary,
} from '../state/MessagingContext';
import { CuriousLoading } from '../components/CuriousStates';

function avatarUrl(user: { profile?: { avatar?: string; avatar_url?: string } } | undefined): string {
  return user?.profile?.avatar_url || user?.profile?.avatar || '';
}

function relativeTime(value: string): string {
  const date = new Date(value);
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function messageTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function Messages() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { conversations, loading: conversationsLoading, refresh } = useMessaging();
  const conversationId = id ? Number(id) : null;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [typingUser, setTypingUser] = useState('');
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [blocking, setBlocking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const lastTypingSent = useRef(0);

  const scrollToEnd = useCallback((behavior: ScrollBehavior = 'smooth') => {
    window.setTimeout(() => endRef.current?.scrollIntoView({ behavior }), 30);
  }, []);

  const loadConversation = useCallback(async () => {
    if (!conversationId) {
      setSelected(null);
      setMessages([]);
      return;
    }
    const local = conversationsRef.current.find((row) => row.id === conversationId);
    if (local) setSelected(local);
    setMessagesLoading(true);
    const data = await apiFetch<{ messages: ChatMessage[]; has_more: boolean }>(
      `/messages/conversations/${conversationId}/messages/`,
    );
    setMessages(data?.messages || []);
    setMessagesLoading(false);
    if (!local) {
      const summary = await apiFetch<ConversationSummary>(
        `/messages/conversations/${conversationId}/`,
      );
      if (summary) setSelected(summary);
    }
  }, [conversationId]);

  useEffect(() => {
    void loadConversation();
  }, [loadConversation]);

  useEffect(() => {
    if (!conversationId) return;
    const match = conversations.find((row) => row.id === conversationId);
    if (match) setSelected(match);
  }, [conversations, conversationId]);

  const markRead = useCallback(async () => {
    if (!conversationId) return;
    await apiVoid(`/messages/conversations/${conversationId}/read/`, { method: 'POST' });
    await refresh();
  }, [conversationId, refresh]);

  useEffect(() => {
    if (!conversationId) return;
    void markRead();
  }, [conversationId, markRead]);

  useEffect(() => {
    scrollToEnd('auto');
  }, [messages.length, scrollToEnd]);

  const { connected, send } = useRealtime(
    conversationId ? `/ws/conversations/${conversationId}/` : null,
    ({ event, data }) => {
      if (event === 'message.created') {
        const message = data as ChatMessage;
        if (message.conversation !== conversationId) return;
        setMessages((rows) =>
          rows.some((row) => row.id === message.id) ? rows : [...rows, message],
        );
        if (message.sender.id !== user?.id) void markRead();
        scrollToEnd();
      }
      if (event === 'message.deleted') {
        const message = data as ChatMessage;
        setMessages((rows) => rows.map((row) => (row.id === message.id ? message : row)));
      }
      if (event === 'message.read') {
        const payload = data as { reader_id: number; read_at: string };
        if (payload.reader_id === user?.id) return;
        setMessages((rows) =>
          rows.map((row) =>
            row.sender.id === user?.id && !row.read_at
              ? { ...row, read_at: payload.read_at }
              : row,
          ),
        );
      }
      if (event === 'conversation.typing') {
        const payload = data as { user: { id: number; username: string }; is_typing: boolean };
        if (payload.user.id === user?.id) return;
        window.clearTimeout(typingTimer.current);
        if (payload.is_typing) {
          setTypingUser(payload.user.username);
          typingTimer.current = window.setTimeout(() => setTypingUser(''), 2800);
        } else {
          setTypingUser('');
        }
      }
    },
  );

  useEffect(
    () => () => {
      window.clearTimeout(typingTimer.current);
    },
    [],
  );

  const sendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const body = text.trim();
    if (!body || !conversationId || sending) return;
    setSending(true);
    setText('');
    const clientId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const created = await apiFetch<ChatMessage>(
      `/messages/conversations/${conversationId}/messages/`,
      {
        method: 'POST',
        body: JSON.stringify({ body, client_id: clientId }),
      },
    );
    setSending(false);
    if (created) {
      setMessages((rows) =>
        rows.some((row) => row.id === created.id) ? rows : [...rows, created],
      );
      send({ type: 'typing', is_typing: false });
      scrollToEnd();
      void refresh();
    } else {
      setText(body);
    }
  };

  const deleteMessage = async (message: ChatMessage) => {
    if (!window.confirm('Delete this message for everyone?')) return;
    const ok = await apiVoid(`/messages/${message.id}/`, { method: 'DELETE' });
    if (!ok) return;
    setMessages((rows) =>
      rows.map((row) =>
        row.id === message.id
          ? { ...row, body: '', deleted: true, deleted_at: new Date().toISOString() }
          : row,
      ),
    );
  };

  const toggleBlock = async () => {
    if (!selected) return;
    setBlocking(true);
    const endpoint = `/messages/blocks/${selected.other_user.username}/`;
    const blockingNow = !selected.blocked_by_me;
    const ok = blockingNow
      ? await apiVoid(endpoint, { method: 'POST' })
      : await apiVoid(endpoint, { method: 'DELETE' });
    setBlocking(false);
    if (!ok) return;
    setSelected({
      ...selected,
      is_blocked: blockingNow || selected.blocked_by_other,
      blocked_by_me: blockingNow,
      can_send: !blockingNow && !selected.blocked_by_other,
    });
    await refresh();
  };

  const submitReport = async () => {
    if (!reporting || !reportReason.trim()) return;
    const ok = await apiVoid(`/messages/${reporting.id}/report/`, {
      method: 'POST',
      body: JSON.stringify({ reason: reportReason.trim() }),
    });
    if (!ok) return;
    setReporting(null);
    setReportReason('');
  };

  const openConversation = (conversation: ConversationSummary) => {
    setSelected(conversation);
    navigate(`/messages/${conversation.id}`);
  };

  if (conversationsLoading && conversations.length === 0) {
    return <CuriousLoading message="Loading your conversations…" />;
  }

  const header = selected?.other_user;
  const canSend = !!selected?.can_send && !selected.is_blocked;

  return (
    <div className={`messages-page ${conversationId ? 'thread-open' : ''}`}>
      <aside className="messages-list-panel" aria-label="Conversations">
        <div className="messages-list-head">
          <div>
            <span className="eyebrow">Private</span>
            <h2>Messages</h2>
          </div>
          <span className={`messages-live-dot ${connected ? 'online' : ''}`} title={connected ? 'Realtime connected' : 'Reconnecting'} />
        </div>
        {conversations.length === 0 ? (
          <div className="messages-list-empty">
            <i className="bx bx-message-rounded-dots"></i>
            <strong>No conversations yet</strong>
            <p>Start one from a member’s profile or a study room’s member list.</p>
          </div>
        ) : (
          <div className="messages-list">
            {conversations.map((conversation) => {
              const other = conversation.other_user;
              return (
                <button
                  type="button"
                  key={conversation.id}
                  className={`messages-list-row ${conversationId === conversation.id ? 'active' : ''}`}
                  onClick={() => openConversation(conversation)}
                >
                  <span className="messages-avatar">
                    {avatarUrl(other) ? <img src={avatarUrl(other)} alt="" /> : other.username[0]?.toUpperCase()}
                  </span>
                  <span className="messages-list-copy">
                    <span className="messages-list-title">
                      <strong>@{other.username}</strong>
                      <small>{relativeTime(conversation.updated_at)}</small>
                    </span>
                    <span className="messages-list-preview">
                      {conversation.is_blocked
                        ? 'Blocked'
                        : conversation.last_message?.deleted
                          ? 'Message deleted'
                          : conversation.last_message?.body || 'Say hello'}
                    </span>
                  </span>
                  {conversation.unread_count > 0 && (
                    <span className="messages-unread">{conversation.unread_count > 9 ? '9+' : conversation.unread_count}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <section className="messages-thread-panel" aria-label="Conversation">
        {!conversationId || !selected ? (
          <div className="messages-thread-empty">
            <i className="bx bx-conversation"></i>
            <h2>Choose a conversation</h2>
            <p>Private conversations are only visible to the two people in them.</p>
          </div>
        ) : (
          <>
            <header className="messages-thread-head">
              <Link to="/messages" className="messages-back" aria-label="Back to conversations">
                <i className="bx bx-left-arrow-alt"></i>
              </Link>
              <span className="messages-avatar">
                {avatarUrl(header) ? <img src={avatarUrl(header)} alt="" /> : header?.username[0]?.toUpperCase()}
              </span>
              <div className="messages-thread-title">
                <Link to={`/profile/${header?.username}`}>@{header?.username}</Link>
                <small>
                  {selected.is_blocked
                    ? 'Messaging is blocked'
                    : connected
                      ? 'Private · realtime'
                      : 'Private · reconnecting'}
                </small>
              </div>
              <div className="messages-thread-actions">
                {selected.blocked_by_me || !selected.blocked_by_other ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void toggleBlock()}
                    disabled={blocking}
                  >
                    <i className={`bx ${selected.blocked_by_me ? 'bx-block' : 'bx-user-x'}`}></i>
                    {selected.blocked_by_me ? 'Unblock' : 'Block'}
                  </button>
                ) : null}
              </div>
            </header>

            <div className="messages-scroll">
              {messagesLoading ? (
                <CuriousLoading message="Loading messages…" />
              ) : messages.length === 0 ? (
                <div className="messages-thread-empty small">
                  <i className="bx bx-message-square-dots"></i>
                  <p>No messages yet. Send the first one below.</p>
                </div>
              ) : (
                messages.map((message) => {
                  const mine = message.sender.id === user?.id;
                  return (
                    <div key={message.id} className={`message-row ${mine ? 'mine' : ''}`}>
                      {!mine && (
                        <span className="message-row-avatar">
                          {avatarUrl(message.sender) ? (
                            <img src={avatarUrl(message.sender)} alt="" />
                          ) : (
                            message.sender.username[0]?.toUpperCase()
                          )}
                        </span>
                      )}
                      <div className="message-bubble-wrap">
                        <div className={`message-bubble ${message.deleted ? 'deleted' : ''}`}>
                          {message.deleted ? (
                            <em>This message was deleted</em>
                          ) : (
                            message.body
                          )}
                        </div>
                        <div className="message-meta">
                          <span>{messageTime(message.created_at)}</span>
                          {mine && !message.deleted && (
                            <span className="message-receipt">
                              {message.read_at ? 'Read' : 'Sent'}
                            </span>
                          )}
                          {!message.deleted && (
                            <span className="message-actions">
                              {!mine && (
                                <button
                                  type="button"
                                  onClick={() => setReporting(message)}
                                  aria-label="Report message"
                                  title="Report message"
                                >
                                  <i className="bx bx-flag"></i>
                                </button>
                              )}
                              {mine && (
                                <button
                                  type="button"
                                  onClick={() => void deleteMessage(message)}
                                  aria-label="Delete message"
                                  title="Delete for everyone"
                                >
                                  <i className="bx bx-trash"></i>
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {typingUser && <div className="messages-typing">@{typingUser} is typing…</div>}
              <div ref={endRef} />
            </div>

            {canSend ? (
              <form className="messages-composer" onSubmit={sendMessage}>
                <textarea
                  rows={1}
                  value={text}
                  maxLength={4000}
                  placeholder="Write a private message…"
                  onChange={(event) => {
                    setText(event.target.value);
                    const now = Date.now();
                    if (now - lastTypingSent.current > 1500) {
                      lastTypingSent.current = now;
                      send({ type: 'typing', is_typing: true });
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <button type="submit" className="btn btn-primary" disabled={!text.trim() || sending}>
                  {sending ? <i className="bx bx-loader-alt bx-spin"></i> : <i className="bx bx-paper-plane"></i>}
                  <span>Send</span>
                </button>
              </form>
            ) : (
              <div className="messages-blocked-note">
                <i className="bx bx-lock-alt"></i>
                {selected.blocked_by_me
                  ? 'You blocked this member. Unblock to send new messages; history stays available.'
                  : selected.blocked_by_other
                    ? 'This member blocked you. Your conversation history stays available.'
                    : 'This member is not accepting new messages.'}
              </div>
            )}
          </>
        )}
      </section>

      {reporting && (
        <div className="modal-backdrop" role="presentation" onClick={() => setReporting(null)}>
          <div
            className="modal-card messages-report-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">Safety</span>
                <h3 id="report-title">Report this message</h3>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => setReporting(null)} aria-label="Close">
                <i className="bx bx-x"></i>
              </button>
            </div>
            <div className="modal-body">
              <p>
                Reports go to the platform review team. The other person is not told who reported
                them. Never include passwords or private documents.
              </p>
              <label className="field-label" htmlFor="report-reason">What is wrong?</label>
              <textarea
                id="report-reason"
                rows={4}
                maxLength={500}
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                placeholder="Harassment, spam, or another safety concern…"
              />
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-secondary" onClick={() => setReporting(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={!reportReason.trim()}
                onClick={() => void submitReport()}
              >
                Send report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
