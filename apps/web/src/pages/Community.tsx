import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { apiFetch, resultsOf } from '../lib/api';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { HighlighterText } from '../components/HighlighterText';
import { CuriousLoading, CuriousEmpty } from '../components/CuriousStates';
import { useAuth } from '../state/AuthContext';

interface Room {
  id: number;
  name: string;
  topic: string;
  member_count: number;
  created_by?: string | null;
  created_at: string;
}

export default function Community() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomTopic, setNewRoomTopic] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchRooms = async () => {
      const data = await apiFetch<{ count: number; results: Room[] }>('/rooms/');
      if (cancelled) return;
      setRooms(resultsOf<Room>(data));
      setLoading(false);
    };
    fetchRooms();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!authLoading && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim() || creating) return;

    setCreating(true);
    const created = await apiFetch<Room>('/rooms/', {
      method: 'POST',
      body: JSON.stringify({
        name: newRoomName.trim(),
        topic: newRoomTopic.trim() || 'General Study',
      }),
    });
    setCreating(false);

    if (created?.id) {
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomTopic('');
      setRooms(prev => [created, ...prev]);
    }
  };

  return (
    <div>
      {/* Header with Boxicons */}
      <div className="flex justify-between items-center mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>
            <HighlighterText color="#00A896">Collaborative Study Rooms</HighlighterText>
          </h2>
          <p className="text-muted text-sm mt-2">
            Join co-authors and scholars in shared rooms for live discussion and question threads.
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
          style={{ padding: '0.55rem 1.1rem', fontSize: '0.875rem' }}
        >
          <i className="bx bx-plus" style={{ fontSize: '1.1rem' }}></i>
          <span>Create Study Room</span>
        </button>
      </div>

      {loading ? (
        <CuriousLoading message="Fetching study rooms & co-author sessions..." />
      ) : rooms.length === 0 ? (
        <CuriousEmpty
          title="No Active Study Rooms Yet"
          description="Create the first study room for your subject or manuscript!"
          flourishText="Study Rooms"
          actionButton={
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              <i className="bx bx-plus" style={{ fontSize: '1.1rem' }}></i>
              <span>Create First Room</span>
            </button>
          }
        />
      ) : (
        <div className="grid-container">
          {rooms.map(room => (
            <CommentCornerCard
              key={room.id}
              commentPreview={`Hosted by ${room.created_by ? `@${room.created_by}` : 'the community'}`}
              className="flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="badge-tag badge-mustard">
                    {room.topic || 'General Topic'}
                  </span>
                  <span className="badge-tag badge-teal" style={{ fontSize: '0.625rem' }}>
                    {room.member_count} member{room.member_count === 1 ? '' : 's'}
                  </span>
                </div>

                <h3 className="mb-2" style={{ fontSize: '1.15rem' }}>{room.name}</h3>

                <p className="text-muted text-sm mb-4">
                  A shared study space with live message chat, an always-visible member list, and join-anytime access.
                </p>
              </div>

              <div className="flex justify-between items-center pt-4" style={{ borderTop: '1.5px solid var(--color-line)' }}>
                <span className="text-xs text-muted font-medium flex items-center gap-1">
                  <i className="bx bx-group" style={{ fontSize: '0.95rem' }}></i>
                  Open Access
                </span>
                <Link to={`/room/${room.id}`} className="btn btn-primary" style={{ padding: '0.45rem 0.95rem', fontSize: '0.8125rem' }}>
                  <span>Join Room</span>
                  <i className="bx bx-right-arrow-alt" style={{ fontSize: '1.1rem' }}></i>
                </Link>
              </div>
            </CommentCornerCard>
          ))}
        </div>
      )}

      {/* Create Room Modal with Boxicons */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20, 20, 26, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '460px', width: '100%' }}>
            <CommentCornerCard style={{ padding: '1.75rem' }}>
              <div className="flex justify-between items-center mb-4 pb-2" style={{ borderBottom: '1.5px solid var(--color-line)' }}>
                <h3 style={{ fontSize: '1.2rem' }} className="flex items-center gap-1.5">
                  <i className="bx bx-conversation" style={{ fontSize: '1.25rem' }}></i>
                  Create Study Room
                </h3>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                >
                  <i className="bx bx-x" style={{ fontSize: '1.1rem' }}></i>
                </button>
              </div>

              <form onSubmit={handleCreateRoom} className="flex flex-col gap-4">
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Room Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Quantum Physics Chapter 3 Discussion"
                    value={newRoomName}
                    onChange={e => setNewRoomName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Subject or Topic Tag
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Physics, Literature, Organic Chemistry"
                    value={newRoomTopic}
                    onChange={e => setNewRoomTopic(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-3" style={{ borderTop: '1.5px solid var(--color-line)' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={!newRoomName.trim() || creating}>
                    {creating ? (
                      <span className="flex items-center gap-2">
                        <i className="bx bx-loader-alt bx-spin"></i> Creating...
                      </span>
                    ) : (
                      <span>
                        Create Room
                        <i className="bx bx-right-arrow-alt" style={{ fontSize: '1.1rem', marginLeft: '0.35rem' }}></i>
                      </span>
                    )}
                  </button>
                </div>
              </form>
            </CommentCornerCard>
          </div>
        </div>
      )}
    </div>
  );
}
