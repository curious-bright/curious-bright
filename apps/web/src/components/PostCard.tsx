import { useState } from 'react';
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

const VISIBILITY_META: Record<string, { icon: string; label: string }> = {
  public: { icon: 'bx-world', label: 'Public' },
  followers: { icon: 'bx-group', label: 'Followers' },
  room_only: { icon: 'bx-lock-alt', label: 'Room only' },
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
  const { toggleLike, toggleFollow, followStatus, deletePost } = useFeed();
  const { user, isAuthenticated } = useAuth();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const following = followStatus(post.author.username) ?? !!post.is_following_author;
  const isMine = post.mine ?? user?.username === post.author.username;
  const canEdit = post.can_edit ?? isMine;
  const canDelete = post.can_delete ?? (isMine || !!user?.can_moderate);
  const visibility = VISIBILITY_META[post.visibility] || VISIBILITY_META.public;
  const pendingReview = post.review_status && post.review_status !== 'published';

  const handleDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    const ok = await deletePost(post.id, post);
    setDeleting(false);
    if (!ok) setConfirmingDelete(false);
  };

  return (
    <article className="comment-corner-card post-card">
      <div className="post-card-head">
        <Link
          to={`/profile/${post.author.username}`}
          className="post-author"
          aria-label={`View ${post.author.username}'s profile`}
        >
          <div
            className="post-avatar"
            style={
              post.author.profile?.avatar
                ? { backgroundImage: `url(${post.author.profile.avatar})`, backgroundSize: 'cover' }
                : undefined
            }
          >
            {!post.author.profile?.avatar && post.author.username[0]?.toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="post-author-name">
              {post.author.username}
              {post.author.profile?.badge_count ? (
                <span className="badge-tag badge-mustard" style={{ marginLeft: '0.4rem', fontSize: '0.6rem' }}>
                  {post.author.profile.badge_count} ★
                </span>
              ) : null}
            </div>
            <div className="text-xs text-muted post-date">
              {new Date(post.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              {post.is_edited ? <span className="post-edited"> · edited</span> : null}
            </div>
          </div>
        </Link>

        <div className="post-card-actions">
          <span className={`post-visibility visibility-${post.visibility}`} title={visibility.label}>
            <i className={`bx ${visibility.icon}`}></i>
            <span>{visibility.label}</span>
          </span>

          {canEdit && (
            <Link
              to={`/post/${post.id}?edit=1`}
              className="icon-action"
              title="Edit post"
              aria-label="Edit post"
            >
              <i className="bx bx-edit-alt"></i>
            </Link>
          )}

          {canDelete && (
            <button
              type="button"
              className={`icon-action danger ${confirmingDelete ? 'confirming' : ''}`}
              title={confirmingDelete ? 'Click again to delete' : 'Delete post'}
              aria-label={confirmingDelete ? 'Confirm delete post' : 'Delete post'}
              disabled={deleting}
              onClick={() => void handleDelete()}
              onBlur={() => setConfirmingDelete(false)}
            >
              {confirmingDelete ? (
                <span className="confirm-label">{deleting ? 'Deleting…' : 'Confirm?'}</span>
              ) : (
                <i className="bx bx-trash"></i>
              )}
            </button>
          )}

          {isAuthenticated && !isMine && (
            <button
              type="button"
              className={`btn ${following ? 'btn-secondary' : 'btn-primary'} post-follow-btn`}
              onClick={() => void toggleFollow(post.author.username, following)}
            >
              {following ? 'Following' : 'Follow'}
            </button>
          )}
        </div>
      </div>

      <Link to={`/post/${post.id}`} className="post-body-link">
        <div className="post-tags">
          <SubjectTag subject={post.subject} />
          <span className="badge-tag badge-coral" style={{ fontSize: '0.62rem' }}>{post.kind}</span>
          {post.is_solved && (
            <span className="badge-tag badge-teal" style={{ fontSize: '0.62rem' }}>
              <i className="bx bx-check-circle"></i> solved
            </span>
          )}
          {pendingReview && (
            <span className="badge-tag badge-mustard" style={{ fontSize: '0.62rem' }}>
              <i className="bx bx-time-five"></i> in review
            </span>
          )}
          {post.room_name && (
            <span className="badge-tag" style={{ fontSize: '0.62rem' }}>
              <i className="bx bx-door-open"></i> {post.room_name}
            </span>
          )}
        </div>

        <h3 className="post-title">{post.title}</h3>
        <p className="post-excerpt">
          {post.body.length > 320 ? `${post.body.slice(0, 320)}…` : post.body}
        </p>

        {post.equations && post.equations.length > 0 && (
          <div className="post-equations">
            {post.equations.map((eq) => (
              <code key={eq.id}>
                {eq.latex}
                {eq.description ? <span className="text-muted"> — {eq.description}</span> : null}
              </code>
            ))}
          </div>
        )}

        {post.attachment_url && (
          <span className="post-attachment">
            <i className="bx bx-paperclip"></i>
            {post.attachment_name || 'Attached paper'}
          </span>
        )}
      </Link>

      <div className="post-card-foot">
        <button
          type="button"
          className={`btn btn-secondary post-stat ${post.liked_by_me ? 'is-liked' : ''}`}
          onClick={() => void toggleLike(post.id)}
          disabled={!isAuthenticated}
          aria-pressed={post.liked_by_me}
          aria-label={`${post.like_count} likes`}
        >
          <i className={post.liked_by_me ? 'bx bxs-heart' : 'bx bx-heart'}></i>
          <span>{post.like_count}</span>
        </button>
        <Link to={`/post/${post.id}`} className="btn btn-secondary post-stat" aria-label={`${post.comment_count} comments`}>
          <i className="bx bx-message-rounded"></i>
          <span>{post.comment_count}</span>
        </Link>
        {post.room && (
          <Link to={`/room/${post.room}`} className="post-room-link">
            Open study room <i className="bx bx-right-arrow-alt"></i>
          </Link>
        )}
      </div>
    </article>
  );
}
