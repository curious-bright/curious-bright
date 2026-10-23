import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, resultsOf } from '../lib/api';

interface RoomSuggestion {
  id: number;
  name: string;
  topic: string;
  member_count: number;
}

const TRENDING = [
  'Organic chemistry',
  'Research methods',
  'Linear algebra',
  'Climate policy',
  'Data structures',
];

export default function RightRail() {
  const [rooms, setRooms] = useState<RoomSuggestion[]>([]);

  useEffect(() => {
    let alive = true;
    void apiFetch('/rooms/?page_size=4').then((data) => {
      if (!alive) return;
      setRooms(resultsOf<RoomSuggestion>(data).slice(0, 4));
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <aside className="right-rail" aria-label="Suggestions">
      <section className="rail-card">
        <div className="rail-card-head">
          <h3>Study rooms</h3>
          <Link to="/community">See all</Link>
        </div>
        {rooms.length === 0 ? (
          <p className="rail-muted">Open a room and invite your study group.</p>
        ) : (
          <div className="rail-list">
            {rooms.map((room) => (
              <Link to={`/room/${room.id}`} className="rail-room" key={room.id}>
                <span className="rail-room-icon"><i className="bx bx-video"></i></span>
                <span>
                  <strong>{room.name}</strong>
                  <small>{room.topic || 'Open study room'} · {room.member_count} members</small>
                </span>
              </Link>
            ))}
          </div>
        )}
        <Link to="/community" className="btn btn-secondary rail-button">
          <i className="bx bx-plus"></i> Start a study room
        </Link>
      </section>

      <section className="rail-card">
        <div className="rail-card-head">
          <h3>Trending subjects</h3>
        </div>
        <div className="rail-chips">
          {TRENDING.map((topic) => (
            <Link to={`/search?q=${encodeURIComponent(topic)}`} className="rail-chip" key={topic}>
              {topic}
            </Link>
          ))}
        </div>
      </section>

      <section className="rail-card rail-card-accent">
        <h3>Learning with an institution?</h3>
        <p>Verified universities, NGOs and research institutes can bring their members into one shared notebook.</p>
        <Link to="/join-organization" className="btn btn-primary rail-button">
          Find your organization
        </Link>
      </section>
    </aside>
  );
}
