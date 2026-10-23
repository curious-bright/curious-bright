import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, Navigate, useNavigate } from 'react-router-dom';
import { apiFetch, apiVoid, resultsOf } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { CuriousLoading, CuriousError } from '../components/CuriousStates';
import VideoCall from '../components/VideoCall';
import Whiteboard from '../components/Whiteboard';
import Modal from '../components/Modal';
import { UndoNotice } from '../components/UndoToast';
import { useAuth } from '../state/AuthContext';
import { useMessaging } from '../state/MessagingContext';

const ROOM_UNDO_MS = 45_000;

interface Message {
  id: number;
  sender: { id: number; username: string; profile?: { avatar?: string } };
  content: string;
  created_at: string;
}

interface Member {
  id: number;
  user: { id: number; username: string; profile?: { subject_expertise?: string; avatar?: string } };
  joined_at: string;
}

interface RoomInfo {
  id: number;
  name: string;
  topic: string;
  description: string;
  member_count: number;
  created_by?: string | null;
  created_at: string;
  is_member: boolean;
  mine: boolean;
  can_edit: boolean;
  livekit_enabled: boolean;
  whiteboard_strokes: number;
}

type RoomTab = 'chat' | 'video' | 'whiteboard';

export default function Room() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const { startConversation } = useMessaging();
  const [startingMessageId, setStartingMessageId] = useState<number | null>(null);

  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showMembersPanel, setShowMembersPanel] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 861px)').matches,
  );
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [onlineIds, setOnlineIds] = useState<Set<number>>(new Set());
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [tab, setTab] = useState<RoomTab>('chat');
  const [leaving, setLeaving] = useState(false);
  const [editingRoom, setEditingRoom] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingRoom, setSavingRoom] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState(false);
  const [deletedRoom, setDeletedRoom] = useState<{ expiresAt: number } | null>(null);

  const lastIdRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Set<number>>(new Set());
  const typingTimers = useRef<Record<number, number>>({});
  const lastTypingSent = useRef(0);

  const joined = !!roomInfo?.is_member;

  const loadRoom = useCallback(async () => {
    const room = await apiFetch<RoomInfo>(`/rooms/${id}/`);
    if (!room) {
      setError('This study room could not be found.');
      setLoading(false);
      return null;
    }
    setRoomInfo(room);
    setLoading(false);
    return room;
  }, [id]);

  const loadMembers = useCallback(async () => {
    const memberList = await apiFetch<{ results: Member[] }>(`/rooms/${id}/members/`);
    setMembers(resultsOf<Member>(memberList));
  }, [id]);

  const loadMessages = useCallback(async () => {
    const initial = await apiFetch<Message[]>(`/rooms/${id}/messages/`);
    const items = Array.isArray(initial) ? initial : resultsOf<Message>(initial);
    setMessages(items);
    lastIdRef.current = items.length ? items[items.length - 1].id : 0;
  }, [id]);

  useEffect(() => {
    if (!id || authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const room = await loadRoom();
      if (cancelled || !room?.is_member) return;
      await Promise.all([loadMembers(), loadMessages()]);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, authLoading, isAuthenticated, loadRoom, loadMembers, loadMessages]);

  const joinRoom = async () => {
    setJoining(true);
    const room = await apiFetch<RoomInfo>(`/rooms/${id}/join/`, { method: 'POST' });
    if (room) {
      setRoomInfo(room);
      await Promise.all([loadMembers(), loadMessages()]);
    }
    setJoining(false);
  };

  const leaveRoom = async () => {
    if (!roomInfo || roomInfo.mine) return;
    setLeaving(true);
    const ok = await apiVoid(`/rooms/${id}/join/`, { method: 'DELETE' });
    setLeaving(false);
    if (ok) navigate('/community');
  };

  const openRoomEditor = () => {
    if (!roomInfo) return;
    setEditName(roomInfo.name);
    setEditTopic(roomInfo.topic || '');
    setEditDescription(roomInfo.description || '');
    setEditingRoom(true);
  };

  const saveRoom = async () => {
    if (!roomInfo || !editName.trim() || savingRoom) return;
    setSavingRoom(true);
    const updated = await apiFetch<RoomInfo>(`/rooms/${roomInfo.id}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: editName.trim(),
        topic: editTopic.trim(),
        description: editDescription.trim(),
      }),
    });
    setSavingRoom(false);
    if (updated) {
      setRoomInfo(updated);
      setEditingRoom(false);
    }
  };

  const deleteRoom = async () => {
    if (!roomInfo || deletingRoom) return;
    setDeletingRoom(true);
    const ok = await apiVoid(`/rooms/${roomInfo.id}/`, { method: 'DELETE' });
    setDeletingRoom(false);
    if (ok) {
      setDeleteOpen(false);
      setDeletedRoom({ expiresAt: Date.now() + ROOM_UNDO_MS });
    }
  };

  const restoreRoom = async () => {
    if (!roomInfo) return;
    const restored = await apiFetch<RoomInfo>(`/rooms/${roomInfo.id}/restore/`, { method: 'POST' });
    if (restored) {
      setRoomInfo(restored);
      setDeletedRoom(null);
      await Promise.all([loadMembers(), loadMessages()]);
    }
  };

  const fetchNewMessages = useCallback(async () => {
    if (!id) return;
    const suffix = lastIdRef.current > 0 ? `?after=${lastIdRef.current}` : '';
    const incoming = await apiFetch<Message[]>(`/rooms/${id}/messages/${suffix}`);
    if (!incoming) return;
    const fresh = (Array.isArray(incoming) ? incoming : resultsOf<Message>(incoming)).filter(
      (message) => !messagesRef.current.has(message.id),
    );
    if (fresh.length > 0) {
      lastIdRef.current = Math.max(lastIdRef.current, fresh[fresh.length - 1].id);
      setMessages((prev) => [...prev, ...fresh]);
    }
  }, [id]);

  const { connected, send } = useRealtime(id ? `/ws/rooms/${id}/` : null, ({ event, data }) => {
    if (event === 'room.message') {
      const incoming = data as Message;
      setMessages((prev) => (prev.some((message) => message.id === incoming.id) ? prev : [...prev, incoming]));
      lastIdRef.current = Math.max(lastIdRef.current, incoming.id);
      return;
    }
    if (event === 'room.members') {
      const payload = data as { members: { id: number }[] };
      setOnlineIds(new Set(payload.members.map((member) => member.id)));
      return;
    }
    if (event === 'room.presence') {
      const payload = data as { action: 'joined' | 'left'; user: { id: number; username: string } };
      setOnlineIds((prev) => {
        const next = new Set(prev);
        if (payload.action === 'joined') next.add(payload.user.id);
        else next.delete(payload.user.id);
        return next;
      });
      return;
    }
    if (event === 'room.typing') {
      const payload = data as { user: { id: number; username: string }; is_typing: boolean };
      if (payload.user.id === user?.id) return;
      window.clearTimeout(typingTimers.current[payload.user.id]);
      if (payload.is_typing) {
        setTypingUsers((prev) => (prev.includes(payload.user.username) ? prev : [...prev, payload.user.username]));
        typingTimers.current[payload.user.id] = window.setTimeout(() => {
          setTypingUsers((prev) => prev.filter((name) => name !== payload.user.username));
        }, 4000);
      } else {
        setTypingUsers((prev) => prev.filter((name) => name !== payload.user.username));
      }
    }
  }, { enabled: isAuthenticated && joined && !deletedRoom });

  useEffect(() => {
    if (!id || loading || !joined || connected) return;
    const timer = window.setInterval(() => void fetchNewMessages(), 8000);
    return () => window.clearInterval(timer);
  }, [id, loading, joined, connected, fetchNewMessages]);

  useEffect(() => {
    return () => {
      Object.values(typingTimers.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    messagesRef.current = new Set(messages.map((message) => message.id));
  }, [messages]);

  useEffect(() => {
    if (tab !== 'chat') return;
    // Keep the newest note in view without scrolling the whole document.
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, tab]);

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = newMessage.trim();
    if (!content || sending) return;

    setSending(true);
    const created = await apiFetch<Message>(`/rooms/${id}/messages/`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    setSending(false);

    if (created?.id) {
      send({ type: 'typing', is_typing: false });
      setNewMessage('');
      lastIdRef.current = Math.max(lastIdRef.current, created.id);
      setMessages((prev) => (prev.some((message) => message.id === created.id) ? prev : [...prev, created]));
    }
  };

  if (!authLoading && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return <CuriousLoading message="Opening study room…" />;
  }

  if (deletedRoom && roomInfo) {
    return (
      <div className="room-main-container">
        <div className="room-gate-wrap">
          <CommentCornerCard className="room-gate">
            <div
              className="room-gate-icon"
              style={{ background: 'rgba(255, 90, 54, 0.12)', color: 'var(--color-coral)' }}
            >
              <i className="bx bx-trash"></i>
            </div>
            <span className="eyebrow">Room deleted</span>
            <h3>“{roomInfo.name}” is hidden</h3>
            <p className="text-muted text-sm">
              The room chat, whiteboard and room-only posts are hidden. Restore the
              room to bring the workspace back for every member.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => void restoreRoom()}>
              <i className="bx bx-undo"></i> Restore study room
            </button>
            <Link to="/community" className="text-sm text-muted">Back to all rooms</Link>
          </CommentCornerCard>
        </div>
        <UndoNotice
          label="Room deleted"
          title={roomInfo.name}
          expiresAt={deletedRoom.expiresAt}
          onUndo={async () => {
            await restoreRoom();
          }}
          onDismiss={() => {
            setDeletedRoom(null);
            navigate('/community');
          }}
        />
      </div>
    );
  }

  if (error || !roomInfo) {
    return (
      <div style={{ maxWidth: '600px', margin: '3rem auto' }}>
        <CuriousError
          title="Room unavailable"
          message={error || 'This study room could not be opened.'}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="room-main-container">
      <div className="room-header">
        <div className="room-header-title">
          <Link to="/community" className="btn btn-secondary room-back-btn" aria-label="Back to study rooms">
            <i className="bx bx-left-arrow-alt"></i>
          </Link>
          <div>
            <div className="room-title-line">
              <h2>{roomInfo.name}</h2>
              {roomInfo.topic && <span className="badge-tag badge-mustard">{roomInfo.topic}</span>}
              {roomInfo.created_by && (
                <span className="badge-tag badge-coral">
                  <i className="bx bx-crown"></i> @{roomInfo.created_by}
                </span>
              )}
            </div>
            <p className="text-sm text-muted">
              {roomInfo.description || 'A shared study space for questions, calls and live sketching.'}
            </p>
          </div>
        </div>
        <div className="room-header-actions">
          {roomInfo.can_edit && (
            <>
              <button type="button" className="btn btn-secondary" onClick={openRoomEditor}>
                <i className="bx bx-edit-alt"></i> Edit room
              </button>
              <button
                type="button"
                className="btn btn-secondary room-danger-action"
                onClick={() => setDeleteOpen(true)}
              >
                <i className="bx bx-trash"></i> Delete
              </button>
            </>
          )}
          {joined && tab === 'chat' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowMembersPanel((value) => !value)}
              aria-pressed={showMembersPanel}
            >
              <i className="bx bx-group"></i> Members ({members.length})
            </button>
          )}
          {joined && (
            <span className={`badge-tag ${connected ? 'badge-teal' : 'badge-coral'}`}>
              <i className={`bx ${connected ? 'bx-pulse' : 'bx-wifi-off'}`}></i>
              {connected ? 'Live' : 'Reconnecting'}
            </span>
          )}
        </div>
      </div>

      {!joined ? (
        <div className="room-gate-wrap">
          <CommentCornerCard className="room-gate">
            <div className="room-gate-icon"><i className="bx bx-door-open"></i></div>
            <span className="eyebrow">Members only workspace</span>
            <h3>Join “{roomInfo.name}”</h3>
            <p className="text-muted text-sm">
              {roomInfo.member_count} {roomInfo.member_count === 1 ? 'member is' : 'members are'} already collaborating here.
              Join to read the discussion, draw on the shared whiteboard and start a video call.
            </p>
            <div className="room-gate-features">
              <span><i className="bx bx-message-rounded-dots"></i> Room chat</span>
              <span><i className="bx bx-pen"></i> Shared whiteboard</span>
              <span><i className="bx bx-video"></i> Live video</span>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => void joinRoom()} disabled={joining}>
              {joining ? <><i className="bx bx-loader-alt bx-spin"></i> Joining…</> : <><i className="bx bx-plus-circle"></i> Join study room</>}
            </button>
            <Link to="/community" className="text-sm text-muted">Back to all rooms</Link>
          </CommentCornerCard>
        </div>
      ) : (
        <>
          <div className="room-tabs" role="tablist" aria-label="Room workspace">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'chat'}
              className={`room-tab ${tab === 'chat' ? 'active' : ''}`}
              onClick={() => setTab('chat')}
            >
              <i className="bx bx-message-rounded-dots"></i> Discussion
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'video'}
              className={`room-tab ${tab === 'video' ? 'active' : ''}`}
              onClick={() => setTab('video')}
            >
              <i className="bx bx-video"></i> Video call
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'whiteboard'}
              className={`room-tab ${tab === 'whiteboard' ? 'active' : ''}`}
              onClick={() => setTab('whiteboard')}
            >
              <i className="bx bx-pen"></i> Whiteboard
              {roomInfo.whiteboard_strokes > 0 && <span className="room-tab-dot">{roomInfo.whiteboard_strokes}</span>}
            </button>
          </div>

          {tab === 'chat' && (
            <div className="room-workspace-pane">
              <CommentCornerCard className="room-chat-card">
                <div className="room-chat-status">
                  <span className="text-muted">
                    <i className="bx bx-lock-alt"></i> Only room members can read this discussion
                  </span>
                  <span className="text-muted">{members.length} member{members.length === 1 ? '' : 's'}</span>
                </div>

                <div className="room-messages" ref={messagesContainerRef}>
                  {messages.length === 0 ? (
                    <div className="room-empty-chat">
                      <i className="bx bx-chat"></i>
                      <strong>No notes in this room yet</strong>
                      <span>Write a message below to start collaborating.</span>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`room-message ${message.sender.id === user?.id ? 'mine' : ''}`}
                      >
                        <div className="room-message-meta">
                          <Link to={`/profile/${message.sender.username}`}>@{message.sender.username}</Link>
                          <span>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="room-message-bubble">{message.content}</div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {typingUsers.length > 0 && (
                  <div className="room-typing">
                    {typingUsers.length === 1
                      ? `${typingUsers[0]} is typing…`
                      : `${typingUsers.slice(0, 2).join(', ')} are typing…`}
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="room-composer">
                  <input
                    type="text"
                    placeholder="Write a note or mention a co-author…"
                    value={newMessage}
                    maxLength={2000}
                    onChange={(event) => {
                      setNewMessage(event.target.value);
                      const now = Date.now();
                      if (now - lastTypingSent.current > 1500) {
                        lastTypingSent.current = now;
                        send({ type: 'typing', is_typing: true });
                      }
                    }}
                  />
                  <button type="submit" className="btn btn-primary" disabled={!newMessage.trim() || sending}>
                    {sending ? <i className="bx bx-loader-alt bx-spin"></i> : <><i className="bx bx-paper-plane"></i> Send</>}
                  </button>
                </form>
              </CommentCornerCard>

              {showMembersPanel && (
                <CommentCornerCard className="room-members-panel">
                  <div className="room-members-head">
                    <h4><i className="bx bx-group"></i> Room members</h4>
                    <span className="badge-tag">{members.length}</span>
                    <button
                      type="button"
                      className="room-members-close"
                      onClick={() => setShowMembersPanel(false)}
                      aria-label="Close room members"
                    >
                      <i className="bx bx-x"></i>
                    </button>
                  </div>

                  {members.length === 0 ? (
                    <p className="text-center text-muted text-xs" style={{ padding: '1.5rem 0' }}>
                      No members yet.
                    </p>
                  ) : (
                    <div className="room-member-list">
                      {members.map((member) => (
                        <div key={member.id} className="room-member">
                          <div className="room-member-avatar">
                            {member.user.profile?.avatar ? (
                              <img src={member.user.profile.avatar} alt="" />
                            ) : (
                              member.user.username[0]?.toUpperCase() || 'M'
                            )}
                          </div>
                          <div className="room-member-info">
                            <Link to={`/profile/${member.user.username}`}>
                              @{member.user.username}
                              {roomInfo.created_by === member.user.username && (
                                <i className="bx bxs-star" title="Room host"></i>
                              )}
                            </Link>
                            <span>{member.user.profile?.subject_expertise || 'Co-author'}</span>
                          </div>
                          {member.user.id !== user?.id && (
                            <button
                              type="button"
                              className="room-member-message"
                              title={`Message @${member.user.username}`}
                              aria-label={`Message @${member.user.username}`}
                              disabled={startingMessageId === member.user.id}
                              onClick={async () => {
                                setStartingMessageId(member.user.id);
                                const conversationId = await startConversation(member.user.username);
                                setStartingMessageId(null);
                                if (conversationId) navigate(`/messages/${conversationId}`);
                              }}
                            >
                              <i className="bx bx-message-rounded-dots"></i>
                            </button>
                          )}
                          <span className={`room-online-dot ${onlineIds.has(member.user.id) ? 'online' : ''}`} title={onlineIds.has(member.user.id) ? 'Online' : 'Member'} />
                        </div>
                      ))}
                    </div>
                  )}

                  {!roomInfo.mine && (
                    <button
                      type="button"
                      className="btn btn-secondary room-leave-btn"
                      onClick={() => void leaveRoom()}
                      disabled={leaving}
                    >
                      <i className="bx bx-log-out"></i> {leaving ? 'Leaving…' : 'Leave room'}
                    </button>
                  )}
                </CommentCornerCard>
              )}
            </div>
          )}

          {tab === 'video' && (
            <div className="room-surface">
              <VideoCall
                roomId={roomInfo.id}
                roomName={roomInfo.name}
                livekitEnabled={roomInfo.livekit_enabled}
              />
            </div>
          )}

          {tab === 'whiteboard' && (
            <div className="room-surface">
              <Whiteboard
                roomId={roomInfo.id}
                currentUserId={user?.id}
                initialCanClear={roomInfo.can_edit}
              />
            </div>
          )}
        </>
      )}

      {editingRoom && (
        <Modal
          title="Edit study room"
          eyebrow="Host tools"
          icon="bx-edit-alt"
          onClose={() => setEditingRoom(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingRoom(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={savingRoom || !editName.trim()}
                onClick={() => void saveRoom()}
              >
                {savingRoom ? <><i className="bx bx-loader-alt bx-spin"></i> Saving…</> : 'Save changes'}
              </button>
            </>
          }
        >
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="room-edit-name">Room name</label>
            <input
              id="room-edit-name"
              value={editName}
              maxLength={120}
              onChange={(event) => setEditName(event.target.value)}
              placeholder="e.g. Quantum Physics Chapter 3"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="room-edit-topic">Subject or topic</label>
            <input
              id="room-edit-topic"
              value={editTopic}
              maxLength={80}
              onChange={(event) => setEditTopic(event.target.value)}
              placeholder="e.g. Physics"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="room-edit-description">What happens here?</label>
            <textarea
              id="room-edit-description"
              rows={4}
              maxLength={500}
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              placeholder="Tell members what you solve, draw or discuss together."
            />
          </div>
        </Modal>
      )}

      {deleteOpen && (
        <Modal
          title="Delete this study room?"
          eyebrow="Host tools"
          icon="bx-trash"
          onClose={() => setDeleteOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>
                Keep room
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={deletingRoom}
                onClick={() => void deleteRoom()}
              >
                {deletingRoom ? <><i className="bx bx-loader-alt bx-spin"></i> Deleting…</> : <><i className="bx bx-trash"></i> Delete room</>}
              </button>
            </>
          }
        >
          <p>
            “{roomInfo.name}” and its live workspace will disappear for every member.
            Room-only posts and their comments are hidden with it.
          </p>
          <p className="danger-note">
            You can undo this for a few minutes. After the undo window, the room and
            its room-only posts are permanently removed by the retention cleanup.
          </p>
        </Modal>
      )}
    </div>
  );
}
