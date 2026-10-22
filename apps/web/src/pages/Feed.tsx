import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, resultsOf } from '../lib/api';
import { useFeed, type PostVisibility } from '../state/FeedContext';
import { useAuth } from '../state/AuthContext';
import PostCard from '../components/PostCard';
import { CuriousLoading, CuriousEmpty } from '../components/CuriousStates';
import { HighlighterText } from '../components/HighlighterText';

const SUBJECTS = ['math', 'science', 'programming', 'language', 'research', 'general'];
const KINDS = ['question', 'explanation', 'note'];

const VISIBILITIES: { value: PostVisibility; icon: string; label: string; hint: string }[] = [
  { value: 'public', icon: 'bx-world', label: 'Public', hint: 'Anyone on Curious Bright can find this post.' },
  { value: 'followers', icon: 'bx-group', label: 'Followers', hint: 'Only people who follow you can read this.' },
  { value: 'room_only', icon: 'bx-lock-alt', label: 'Study room', hint: 'Only members of the chosen room can read this.' },
];

interface RoomOption {
  id: number;
  name: string;
  topic: string;
  is_member: boolean;
}

function Composer() {
  const { addPost, loadFeed, tab } = useFeed();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('math');
  const [kind, setKind] = useState('question');
  const [latex, setLatex] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [roomId, setRoomId] = useState<number | ''>('');
  const [rooms, setRooms] = useState<RoomOption[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || rooms !== null || !isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const data = await apiFetch<{ results: RoomOption[] }>('/rooms/');
      if (cancelled) return;
      setRooms(resultsOf<RoomOption>(data).filter((room) => room.is_member));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, rooms, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="composer-signin">
        <div>
          <strong>Have something worth sharing?</strong>
          <span>Sign in to ask a question, post an explanation or open a study room discussion.</span>
        </div>
        <Link to="/login" className="btn btn-primary">Sign in</Link>
      </div>
    );
  }

  const reset = () => {
    setTitle('');
    setBody('');
    setLatex('');
    setRoomId('');
    setVisibility('public');
    setOpen(false);
  };

  const submit = async () => {
    if (!title.trim() || !body.trim()) return;
    if (visibility === 'room_only' && !roomId) return;
    setSubmitting(true);
    const equations = latex.trim() ? [{ latex: latex.trim() }] : [];
    const created = await addPost({
      title: title.trim(),
      body: body.trim(),
      subject,
      kind,
      visibility,
      room: visibility === 'room_only' && roomId ? Number(roomId) : null,
      equations: equations.length ? equations : undefined,
    });
    setSubmitting(false);
    if (created) {
      const destination = visibility === 'public' ? null : `/post/${created.id}`;
      reset();
      if (destination) navigate(destination);
      else await loadFeed(tab, 1);
    }
  };

  if (!open) {
    return (
      <button className="btn btn-primary composer-trigger" onClick={() => setOpen(true)}>
        <i className="bx bx-pencil"></i>
        Share a thought, question or explanation
        <span className="composer-trigger-hint">Public, followers or room-only</span>
      </button>
    );
  }

  const activeVisibility = VISIBILITIES.find((item) => item.value === visibility)!;

  return (
    <div className="comment-corner-card composer-card">
      <div className="composer-section-label">
        <span>What are you sharing?</span>
        <button type="button" className="composer-close" onClick={reset} aria-label="Close composer">
          <i className="bx bx-x"></i>
        </button>
      </div>

      <div className="composer-chips">
        {KINDS.map((item) => (
          <button
            type="button"
            key={item}
            className={`chip ${kind === item ? 'chip-active' : ''}`}
            onClick={() => setKind(item)}
          >
            {item}
          </button>
        ))}
        <span className="composer-chip-divider" aria-hidden="true" />
        {SUBJECTS.map((item) => (
          <button
            type="button"
            key={item}
            className={`chip ${subject === item ? 'chip-active' : ''}`}
            onClick={() => setSubject(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <input
        placeholder="Title — e.g. Why is 0.999… equal to 1?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        style={{ marginBottom: '0.6rem' }}
      />
      <textarea
        placeholder="Explain it in your own words. Mention people with @username."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={8000}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
        }}
        style={{ marginBottom: '0.6rem', width: '100%', resize: 'vertical' }}
      />
      <input
        placeholder="Optional equation (e.g. LaTeX / plain maths): 0.999… = 1"
        value={latex}
        onChange={(e) => setLatex(e.target.value)}
        style={{ marginBottom: '0.8rem', fontFamily: "'Courier New', monospace" }}
      />

      <div className="composer-visibility">
        <span className="composer-section-label">Who can see it?</span>
        <div className="visibility-options" role="radiogroup" aria-label="Post visibility">
          {VISIBILITIES.map((item) => (
            <button
              type="button"
              key={item.value}
              role="radio"
              aria-checked={visibility === item.value}
              className={`visibility-option ${visibility === item.value ? 'selected' : ''}`}
              onClick={() => setVisibility(item.value)}
            >
              <i className={`bx ${item.icon}`}></i>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <p className="composer-hint">{activeVisibility.hint}</p>

        {visibility === 'room_only' && (
          <div className="composer-room-picker">
            {rooms === null ? (
              <span className="text-xs text-muted">Loading your rooms…</span>
            ) : rooms.length === 0 ? (
              <span className="text-xs text-muted">
                You haven’t joined a room yet. <Link to="/community">Browse study rooms</Link>.
              </span>
            ) : (
              <select value={roomId} onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Choose a study room…</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}{room.topic ? ` — ${room.topic}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      <div className="composer-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void submit()}
          disabled={submitting || !title.trim() || !body.trim() || (visibility === 'room_only' && !roomId)}
        >
          {submitting ? <><i className="bx bx-loader-alt bx-spin"></i> Posting…</> : <><i className="bx bx-send"></i> Post to community</>}
        </button>
        <button type="button" className="btn btn-secondary" onClick={reset}>Cancel</button>
        <span className="composer-shortcut">Ctrl/⌘ + Enter</span>
      </div>
    </div>
  );
}

export default function Feed() {
  const { tab, posts, loading, hasMore, setTab, loadFeed, loadMore } = useFeed();
  const { isAuthenticated, user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    void loadFeed(tab, 1);
    // The tab is managed by context; reload only on first mount once auth has
    // hydrated. In-flight de-duplication in FeedContext protects the overlap
    // with the provider's account-switch reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  return (
    <div className="feed-page">
      <div className="feed-heading">
        <div>
          <span className="eyebrow">The shared notebook</span>
          <h2>
            <HighlighterText color="#00A896">Community Feed</HighlighterText>
          </h2>
          <p className="text-muted text-sm">
            Students teaching students — ask, explain, and build on each other’s ideas.
          </p>
        </div>
        {user && (
          <Link to={`/profile/${user.username}`} className="feed-profile-pill">
            <span className="feed-profile-avatar">
              {user.profile?.avatar ? <img src={user.profile.avatar} alt="" /> : user.username[0]?.toUpperCase()}
            </span>
            <span>
              <strong>@{user.username}</strong>
              <small>{user.profile?.badge_count || 0} badges</small>
            </span>
          </Link>
        )}
      </div>

      <div className="feed-tabs" role="tablist" aria-label="Feed">
        <button
          role="tab"
          aria-selected={tab === 'discover'}
          className={`btn ${tab === 'discover' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('discover')}
        >
          <i className="bx bx-compass"></i> Discover
        </button>
        <button
          role="tab"
          aria-selected={tab === 'following'}
          className={`btn ${tab === 'following' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('following')}
          disabled={!isAuthenticated}
        >
          <i className="bx bx-user-check"></i> Following
        </button>
        <span className="feed-tabs-note">
          {tab === 'discover' ? 'Public posts from everyone' : 'You and the people you follow'}
        </span>
      </div>

      <Composer />

      {loading && posts.length === 0 ? (
        <CuriousLoading message="Gathering the latest notes…" />
      ) : posts.length === 0 ? (
        <CuriousEmpty
          title={tab === 'following' ? 'Your following feed is empty' : 'No posts yet'}
          description={
            tab === 'following'
              ? 'Follow people who explain things well and their posts will appear here.'
              : 'Be the first to share a question, explanation or note.'
          }
          actionButton={
            !isAuthenticated ? (
              <Link to="/register" className="btn btn-primary">Join the community</Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {hasMore && (
            <div className="text-center" style={{ marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => void loadMore()} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
          {!hasMore && posts.length > 3 && (
            <p className="feed-end-note">You’re all caught up. Go make someone’s day brighter.</p>
          )}
        </>
      )}
    </div>
  );
}
