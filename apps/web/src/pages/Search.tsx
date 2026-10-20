import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { HighlighterText } from '../components/HighlighterText';
import { CuriousLoading, CuriousEmpty } from '../components/CuriousStates';

interface SearchResultPost {
  id: number;
  title: string;
  body: string;
  subject: string;
  kind: string;
  academic_level: string;
  attachment_url: string | null;
  attachment_name: string;
  author: { id: number; username: string };
}

interface SearchResultRoom {
  id: number;
  name: string;
  topic: string;
  member_count: number;
  created_by?: string;
}

interface SearchResultUser {
  id: number;
  username: string;
  headline: string;
}

interface SearchResults {
  posts: SearchResultPost[];
  rooms: SearchResultRoom[];
  users: SearchResultUser[];
}

const EMPTY: SearchResults = { posts: [], rooms: [], users: [] };

export default function Search() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q') || '';

  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    setLoading(true);
    apiFetch<SearchResults>(`/search/?q=${encodeURIComponent(q)}`).then(data => {
      if (cancelled) return;
      setResults(data || EMPTY);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [q]);

  if (!q) {
    return (
      <div style={{ maxWidth: '500px', margin: '3rem auto' }}>
        <CuriousEmpty
          title="Search the Library"
          description="Type a search query in the search bar above to find posts, study rooms, or co-authors."
          flourishText="Global Search"
        />
      </div>
    );
  }

  const totalResults = results.posts.length + results.rooms.length + results.users.length;

  return (
    <div>
      <div className="mb-6">
        <h2>
          <HighlighterText color="#F4B43D">Search Results</HighlighterText>
        </h2>
        <p className="text-muted text-sm mt-2">
          Found <strong style={{ color: 'var(--color-ink)' }}>{totalResults}</strong> items matching "{q}"
        </p>
      </div>

      {loading ? (
        <CuriousLoading message={`Searching posts and study rooms for "${q}"...`} />
      ) : totalResults === 0 ? (
        <CuriousEmpty
          title={`No Items Found for "${q}"`}
          description="Try checking for spelling errors or searching for broader terms."
          flourishText="Search Results"
        />
      ) : (
        <div className="flex flex-col gap-8">
          {/* Posts Section */}
          <section>
            <h3 className="mb-4 pb-2" style={{ borderBottom: '1.5px solid var(--color-line)', fontSize: '1.15rem' }}>
              {'\uD83D\uDCD6 Papers & Notes'} ({results.posts.length})
            </h3>
            {results.posts.length > 0 ? (
              <div className="grid-container">
                {results.posts.map(post => (
                  <CommentCornerCard key={post.id} className="flex flex-col justify-between" commentPreview="Peel corner to view summary">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className={`badge-tag ${post.attachment_url ? 'badge-teal' : 'badge-mustard'}`}>
                          {post.attachment_url ? 'Shared Paper' : post.kind.replace(/^./, c => c.toUpperCase())}
                        </span>
                        <span className="badge-tag badge-coral">
                          {post.academic_level.replace('_', ' ').replace(/^./, c => c.toUpperCase())}
                        </span>
                      </div>
                      <h4 className="mb-2" style={{ fontSize: '1.05rem' }}>{post.title}</h4>
                      <p className="text-xs text-muted mb-3" style={{ fontWeight: 600 }}>
                        @{post.author.username} • {post.subject.replace(/^./, c => c.toUpperCase())}
                      </p>
                      <p className="text-muted text-sm mb-4" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {post.body}
                      </p>
                    </div>
                    <Link
                      to={post.attachment_url ? `/read/${post.id}` : `/post/${post.id}`}
                      className="btn btn-primary"
                      style={{ padding: '0.45rem 0.95rem', fontSize: '0.8125rem' }}
                    >
                      {post.attachment_url ? 'Read Paper \u2192' : 'Open Note \u2192'}
                    </Link>
                  </CommentCornerCard>
                ))}
              </div>
            ) : (
              <p className="text-muted text-sm">No papers found matching this query.</p>
            )}
          </section>

          {/* Rooms Section */}
          <section>
            <h3 className="mb-4 pb-2" style={{ borderBottom: '1.5px solid var(--color-line)', fontSize: '1.15rem' }}>
              {'\uD83D\uDCAC Study Rooms'} ({results.rooms.length})
            </h3>
            {results.rooms.length > 0 ? (
              <div className="grid-container">
                {results.rooms.map(room => (
                  <CommentCornerCard key={room.id} className="flex flex-col justify-between" commentPreview="Peel corner to view room rules">
                    <div>
                      <span className="badge-tag badge-mustard mb-2">{room.topic || 'General Topic'}</span>
                      <h4 className="mb-2" style={{ fontSize: '1.05rem' }}>{room.name}</h4>
                      <p className="text-xs text-muted">
                        <i className="bx bx-group" style={{ fontSize: '0.9rem' }}></i>{' '}
                        {room.member_count} member{room.member_count === 1 ? '' : 's'}
                        {room.created_by ? ` • hosted by @${room.created_by}` : ''}
                      </p>
                    </div>
                    <Link to={`/room/${room.id}`} className="btn btn-secondary mt-4" style={{ padding: '0.45rem 0.95rem', fontSize: '0.8125rem' }}>
                      {'Join Room \u2192'}
                    </Link>
                  </CommentCornerCard>
                ))}
              </div>
            ) : (
              <p className="text-muted text-sm">No study rooms found matching this query.</p>
            )}
          </section>

          {/* Users Section */}
          <section>
            <h3 className="mb-4 pb-2" style={{ borderBottom: '1.5px solid var(--color-line)', fontSize: '1.15rem' }}>
              {'\uD83D\uDC65 Co-authors & Scholars'} ({results.users.length})
            </h3>
            {results.users.length > 0 ? (
              <div className="grid-container">
                {results.users.map(user => (
                  <Link key={user.id} to={`/profile/${user.username}`} style={{ textDecoration: 'none' }}>
                    <CommentCornerCard className="flex items-center justify-between" style={{ padding: '1rem 1.25rem' }}>
                      <div className="flex items-center gap-3">
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '3px 0px 3px 3px',
                            background: 'var(--color-coral)',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                          }}
                        >
                          {user.username[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div className="font-semibold text-sm" style={{ color: 'var(--color-ink)' }}>@{user.username}</div>
                          <div className="text-xs text-muted">{user.headline || 'Co-author'}</div>
                        </div>
                      </div>
                    </CommentCornerCard>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted text-sm">No co-authors found matching this query.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
