import { Link } from 'react-router-dom';
import type { FeedPost } from '../state/FeedContext';
import { useFeed } from '../state/FeedContext';
import { useAuth } from '../state/AuthContext';

const SUBJECT_COLORS: Record<string, string> = {
  math: '#00A896',
  science: '#4C6FE7',
  programming: '#FF5A36',
  language: '#B45CC8',
  research: '#F4B43D',
  general: '#6B685C',
};

export function SubjectTag({ subject }: { subject: string }) {
  return (
    <span
      className="badge-tag"
      style={{
        background: `${SUBJECT_COLORS[subject] || '#6B685C'}1A`,
        color: SUBJECT_COLORS[subject] || '#6B685C',
        border: '1px solid transparent',
      }}
    >
      {subject}
    </span>
  );
}

export default function PostCard({ post }: { post: FeedPost }) {
  const { toggleLike, toggleFollow, isFollowing } = useFeed();
  const { user, isAuthenticated } = useAuth();
  const following = isFollowing(post.author.username);
  const isMine = user?.username === post.author.username;

  return (
    <article
      className="comment-corner-card"
      style={{ padding: '1.1rem 1.2rem', marginBottom: '1rem', display: 'block' }}
    >
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: '0.6rem' }}>
        <Link
          to={`/profile/${post.author.username}`}
          className="flex items-center gap-2"
          style={{ textDecoration: 'none', color: 'var(--color-ink)', minWidth: 0 }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '3px 0 3px 3px',
              background: 'var(--color-teal)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.85rem',
              flexShrink: 0,
              ...(post.author.profile?.avatar ? { backgroundImage: `url(${post.author.profile.avatar})`, backgroundSize: 'cover' } : {}),
            }}
          >
            {post.author.username[0]?.toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="font-semibold text-sm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {post.author.username}
              {post.author.profile?.badge_count ? (
                <span className="badge-tag badge-mustard" style={{ marginLeft: '0.4rem', fontSize: '0.6rem' }}>
                  {post.author.profile.badge_count} ★
                </span>
              ) : null}
            </div>
            <div className="text-xs text-muted">
              {new Date(post.created_at).toLocaleDateString()}
            </div>
          </div>
        </Link>
        {isAuthenticated && !isMine && (
          <button
            className={`btn ${following ? 'btn-secondary' : 'btn-primary'}`}
            style={{ padding: '0.3rem 0.7rem', fontSize: '0.72rem', flexShrink: 0 }}
            onClick={() => void toggleFollow(post.author.username)}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        )}
      </div>

      <Link to={`/post/${post.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: '0.35rem' }}>
          <SubjectTag subject={post.subject} />
          <span className="badge-tag badge-coral" style={{ fontSize: '0.62rem' }}>{post.kind}</span>
          {post.is_solved && (
            <span className="badge-tag badge-teal" style={{ fontSize: '0.62rem' }}>solved</span>
          )}
        </div>
        <h3 style={{ fontSize: '1.02rem', fontWeight: 700, marginBottom: '0.35rem', lineHeight: 1.3 }}>{post.title}</h3>
        <p className="text-sm text-muted" style={{ lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {post.body.length > 320 ? `${post.body.slice(0, 320)}…` : post.body}
        </p>
        {post.equations && post.equations.length > 0 && (
          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {post.equations.map(eq => (
              <code
                key={eq.id}
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: '0.8rem',
                  background: 'var(--color-paper)',
                  border: '1px solid var(--color-line)',
                  borderRadius: 4,
                  padding: '0.3rem 0.55rem',
                  display: 'inline-block',
                  color: 'var(--color-ink)',
                }}
              >
                {eq.latex}
                {eq.description ? <span className="text-muted"> — {eq.description}</span> : null}
              </code>
            ))}
          </div>
        )}
      </Link>

      <div className="flex items-center gap-3" style={{ marginTop: '0.75rem', paddingTop: '0.6rem', borderTop: '1.5px solid var(--color-line)' }}>
        <button
          className="btn btn-secondary"
          style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', color: post.liked_by_me ? 'var(--color-coral)' : undefined }}
          onClick={() => void toggleLike(post.id)}
          disabled={!isAuthenticated}
          aria-pressed={post.liked_by_me}
        >
          <i className={post.liked_by_me ? 'bx bx-heart' : 'bx bx-heart'}></i> {post.like_count}
        </button>
        <Link
          to={`/post/${post.id}`}
          className="btn btn-secondary"
          style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', textDecoration: 'none' }}
        >
          <i className="bx bx-message-rounded"></i> {post.comment_count}
        </Link>
      </div>
    </article>
  );
}
