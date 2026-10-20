import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { apiFetch, resultsOf } from '../lib/api';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { CuriousLoading, CuriousError } from '../components/CuriousStates';
import { useAuth } from '../state/AuthContext';

interface Message {
  id: number;
  sender: { id: number; username: string };
  content: string;
  created_at: string;
}

interface Member {
  id: number;
  user: { id: number; username: string; profile?: { subject_expertise?: string } };
  joined_at: string;
}

interface RoomInfo {
  id: number;
  name: string;
  topic: string;
  member_count: number;
  created_by?: string | null;
  created_at: string;
}

const POLL_MS = 3000;

export default function Room() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showMembersPanel, setShowMembersPanel] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState(true);

  const lastIdRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Set<number>>(new Set());

  const fetchRoomAndMembers = useCallback(async () => {
    const [room, memberList] = await Promise.all([
      apiFetch<RoomInfo>(`/rooms/${id}/`),
      apiFetch<Member[]>(`/rooms/${id}/members/`),
    ]);
    if (!room) {
      setError('This study room could not be found.');
      setLoading(false);
      return;
    }
    setRoomInfo(room);
    setMembers(resultsOf<Member>(memberList));
    return room;
  }, [id]);

  // Initial load: room, members, latest messages.
  useEffect(() => {
    if (!id || authLoading || !isAuthenticated) return;
    let cancelled = false;

    (async () => {
      await fetchRoomAndMembers();
      const initial = await apiFetch<Message[]>(`/rooms/${id}/messages/`);
      if (cancelled) return;
      const items = Array.isArray(initial) ? initial : resultsOf<Message>(initial);
      setMessages(items);
      lastIdRef.current = items.length ? items[items.length - 1].id : 0;
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, authLoading, isAuthenticated, fetchRoomAndMembers]);

  // Poll for new messages since the last one we have.
  useEffect(() => {
    if (!id || loading || !isAuthenticated) return;

    const poll = async () => {
      const suffix = lastIdRef.current > 0 ? `?after=${lastIdRef.current}` : '';
      const incoming = await apiFetch<Message[]>(`/rooms/${id}/messages/${suffix}`);
      if (!incoming) {
        setLive(false);
        return;
      }
      setLive(true);
      const fresh = (Array.isArray(incoming) ? incoming : resultsOf<Message>(incoming)).filter(
        m => !messagesRef.current.has(m.id)
      );
      if (fresh.length > 0) {
        lastIdRef.current = Math.max(lastIdRef.current, fresh[fresh.length - 1].id);
        setMessages(prev => [...prev, ...fresh]);
      }
    };

    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [id, loading, isAuthenticated]);

  // Track current message ids for dedupe inside the interval closure.
  useEffect(() => {
    messagesRef.current = new Set(messages.map(m => m.id));
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newMessage.trim();
    if (!content || sending) return;

    setSending(true);
    const created = await apiFetch<Message>(`/rooms/${id}/messages/`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    setSending(false);

    if (created?.id) {
      setNewMessage('');
      lastIdRef.current = Math.max(lastIdRef.current, created.id);
      setMessages(prev => (prev.some(m => m.id === created.id) ? prev : [...prev, created]));
    }
  };

  if (!authLoading && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return <CuriousLoading message="Opening study room..." />;
  }

  if (error || !roomInfo) {
    return (
      <div style={{ maxWidth: '600px', margin: '3rem auto' }}>
        <CuriousError
          title="Room Unavailable"
          message={error || 'This study room could not be opened.'}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="room-main-container">
      {/* Room Header Top Bar with Boxicons */}
      <div className="flex justify-between items-center mb-4" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="flex items-center gap-3">
          <Link to="/community" className="btn btn-secondary" style={{ padding: '0.45rem 0.85rem', fontSize: '0.8125rem' }}>
            <i className="bx bx-left-arrow-alt" style={{ fontSize: '1.1rem' }}></i>
            <span>Back</span>
          </Link>
          <div>
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.35rem' }}>{roomInfo.name}</h2>
              {roomInfo.topic && <span className="badge-tag badge-mustard">{roomInfo.topic}</span>}
              {roomInfo.created_by && <span className="badge-tag badge-coral">hosted by @{roomInfo.created_by}</span>}
            </div>
          </div>
        </div>

        <button
          className="btn btn-secondary"
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.8125rem', borderColor: showMembersPanel ? 'var(--color-ink)' : undefined }}
          onClick={() => setShowMembersPanel(prev => !prev)}
        >
          <i className="bx bx-group" style={{ fontSize: '1.1rem' }}></i>
          <span>Members ({members.length})</span>
        </button>
      </div>

      {/* Main Room Workspace Pane */}
      <div className="room-workspace-pane">
        <CommentCornerCard style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="flex flex-col h-full">
            {/* Connection Status Bar */}
            <div style={{ padding: '0.6rem 1.25rem', background: 'var(--color-paper)', borderBottom: '1.5px solid var(--color-line)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div className="flex items-center gap-2">
                <span className={`badge-tag ${live ? 'badge-teal' : 'badge-coral'}`} style={{ fontSize: '0.6875rem' }}>
                  <i className={`bx ${live ? 'bx-pulse' : 'bx-wifi-off'}`} style={{ fontSize: '0.8rem' }}></i>{' '}
                  {live ? 'Live — refreshing every few seconds' : 'Reconnecting...'}
                </span>
                <span className="text-muted">New messages appear automatically</span>
              </div>
              <span className="text-muted font-medium">
                {members.length} member{members.length === 1 ? '' : 's'} in room
              </span>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {messages.length === 0 ? (
                <div className="text-center text-muted flex items-center justify-center gap-1.5" style={{ margin: 'auto', fontSize: '0.9375rem' }}>
                  <i className="bx bx-chat" style={{ fontSize: '1.25rem' }}></i>
                  No notes in this room yet. Write a message below to start collaborating!
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <div className="flex items-center gap-2">
                      <Link to={`/profile/${msg.sender.username}`} className="badge-tag badge-coral" style={{ fontSize: '0.6875rem', textDecoration: 'none' }}>
                        @{msg.sender.username}
                      </Link>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--color-faded-ink)' }}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div
                      style={{
                        background: 'var(--color-paper)',
                        border: '1.5px solid var(--color-line)',
                        padding: '0.65rem 0.95rem',
                        borderRadius: '4px 0px 4px 4px',
                        maxWidth: '85%',
                        width: 'fit-content',
                        fontSize: '0.9375rem',
                        lineHeight: '1.45',
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Bar */}
            <form onSubmit={handleSendMessage} style={{ padding: '1rem 1.25rem', borderTop: '1.5px solid var(--color-line)', background: 'var(--color-paper)', display: 'flex', gap: '0.75rem' }}>
              <input
                type="text"
                placeholder="Write a note or mention a co-author..."
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary" disabled={!newMessage.trim() || sending}>
                {sending ? (
                  <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '1rem' }}></i>
                ) : (
                  <span>
                    Post Note <i className="bx bx-paper-plane" style={{ fontSize: '1rem' }}></i>
                  </span>
                )}
              </button>
            </form>
          </div>
        </CommentCornerCard>

        {/* Right Members Panel */}
        {showMembersPanel && (
          <CommentCornerCard className="room-members-panel">
            <div className="flex justify-between items-center pb-3" style={{ borderBottom: '1.5px solid var(--color-line)' }}>
              <h4 style={{ fontSize: '0.95rem' }} className="flex items-center gap-1.5">
                <i className="bx bx-group" style={{ fontSize: '1.1rem' }}></i>
                Room Members ({members.length})
              </h4>
            </div>

            {members.length === 0 ? (
              <div className="text-center text-muted text-xs" style={{ padding: '2rem 0' }}>
                No members joined yet.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {members.map(m => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between"
                    style={{
                      padding: '0.55rem 0.7rem',
                      borderRadius: '4px 0px 4px 4px',
                      background: 'var(--color-paper)',
                      border: '1.5px solid var(--color-line)',
                    }}
                  >
                    <div className="flex items-center gap-2" style={{ overflow: 'hidden' }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '3px 0px 3px 3px',
                          background: 'var(--color-coral)',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                        }}
                      >
                        {m.user.username[0]?.toUpperCase() || 'M'}
                      </div>

                      <div style={{ overflow: 'hidden' }}>
                        <Link
                          to={`/profile/${m.user.username}`}
                          className="font-semibold text-xs"
                          style={{ color: 'var(--color-ink)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                        >
                          @{m.user.username}
                          {roomInfo.created_by === m.user.username && (
                            <i className="bx bxs-star" style={{ color: 'var(--color-mustard)', fontSize: '0.75rem', marginLeft: 4 }}></i>
                          )}
                        </Link>
                        <div className="text-muted" style={{ fontSize: '0.6875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {m.user.profile?.subject_expertise || 'Co-author'}
                        </div>
                      </div>
                    </div>

                    <span className="badge-tag badge-teal" style={{ fontSize: '0.625rem', padding: '0.1rem 0.4rem' }}>
                      Member
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CommentCornerCard>
        )}
      </div>
    </div>
  );
}
