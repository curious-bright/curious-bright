import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { apiFetch, resultsOf } from '../lib/api';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { HighlighterText } from '../components/HighlighterText';
import { CuriousLoading, CuriousEmpty } from '../components/CuriousStates';
import Modal from '../components/Modal';
import { useAuth } from '../state/AuthContext';

interface Room {
  id: number;
  name: string;
  topic: string;
  description?: string;
  member_count: number;
  created_by?: string | null;
  created_at: string;
  is_member?: boolean;
  mine?: boolean;
  can_edit?: boolean;
}

export default function Community() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomTopic, setNewRoomTopic] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const fetchRooms = async () => {
      const data = await apiFetch<{ count: number; results: Room[] }>('/rooms/');
      if (cancelled) return;
      setRooms(resultsOf<Room>(data));
      setLoading(false);
    };
    void fetchRooms();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

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
        description: newRoomDescription.trim(),
      }),
    });
    setCreating(false);

    if (created?.id) {
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomTopic('');
      setNewRoomDescription('');
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
                  <span className="flex items-center gap-1">
                    {room.mine && <span className="badge-tag badge-coral" style={{ fontSize: '0.625rem' }}>Host</span>}
                    {!room.mine && room.is_member && <span className="badge-tag badge-teal" style={{ fontSize: '0.625rem' }}>Joined</span>}
                    <span className="badge-tag badge-teal" style={{ fontSize: '0.625rem' }}>
                      {room.member_count} member{room.member_count === 1 ? '' : 's'}
                    </span>
                  </span>
                </div>

                <h3 className="mb-2" style={{ fontSize: '1.15rem' }}>{room.name}</h3>

                <p className="text-muted text-sm mb-4">
                  {room.description || 'A shared study space with live message chat, an always-visible member list, and join-anytime access.'}
                </p>
              </div>

              <div className="flex justify-between items-center pt-4" style={{ borderTop: '1.5px solid var(--color-line)' }}>
                <span className="text-xs text-muted font-medium flex items-center gap-1">
                  {room.mine ? <i className="bx bx-crown" style={{ fontSize: '0.95rem' }}></i> : <i className="bx bx-group" style={{ fontSize: '0.95rem' }}></i>}
                  {room.mine ? 'You host this room' : 'Open access'}
                </span>
                <Link to={`/room/${room.id}`} className="btn btn-primary" style={{ padding: '0.45rem 0.95rem', fontSize: '0.8125rem' }}>
                  <span>{room.is_member ? 'Open room' : 'Join room'}</span>
                  <i className="bx bx-right-arrow-alt" style={{ fontSize: '1.1rem' }}></i>
                </Link>
              </div>
            </CommentCornerCard>
          ))}
        </div>
      )}

      {showCreateModal && (
        <Modal
          title="Create a study room"
          eyebrow="Start a shared workspace"
          icon="bx-conversation"
          onClose={() => setShowCreateModal(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button
                type="submit"
                form="create-room-form"
                className="btn btn-primary"
                disabled={!newRoomName.trim() || creating}
              >
                {creating ? (
                  <><i className="bx bx-loader-alt bx-spin"></i> Creating…</>
                ) : (
                  <><i className="bx bx-plus-circle"></i> Create room</>
                )}
              </button>
            </>
          }
        >
          <form
            id="create-room-form"
            onSubmit={handleCreateRoom}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}
          >
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="new-room-name">Room name</label>
              <input
                id="new-room-name"
                type="text"
                placeholder="e.g. Quantum Physics Chapter 3"
                value={newRoomName}
                maxLength={120}
                onChange={e => setNewRoomName(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="new-room-topic">Subject or topic tag</label>
              <input
                id="new-room-topic"
                type="text"
                placeholder="e.g. Physics, Literature, Organic Chemistry"
                value={newRoomTopic}
                maxLength={80}
                onChange={e => setNewRoomTopic(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="new-room-description">What will you work on?</label>
              <textarea
                id="new-room-description"
                rows={3}
                placeholder="A short note that helps the right people find and join this room."
                value={newRoomDescription}
                maxLength={500}
                onChange={e => setNewRoomDescription(e.target.value)}
              />
              <span className="field-hint">Optional · visible on the room card</span>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
