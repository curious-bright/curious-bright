import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import { useFeed, type FeedComment, type FeedPost } from '../state/FeedContext';
import { SubjectTag } from '../components/PostCard';
import { CuriousLoading, CuriousEmpty } from '../components/CuriousStates';
import { HighlighterText } from '../components/HighlighterText';

function CommentThread({
  comment,
  postId,
  depth = 0,
  onReply,
  onHelpful,
  onAccept,
  canAccept = false,
  currentUsername,
}: {
  comment: FeedComment;
  postId: number;
  depth?: number;
  onReply: (parentId: number, body: string) => Promise<void>;
  onHelpful: (commentId: number) => Promise<void>;
  onAccept: (commentId: number) => Promise<void>;
  canAccept?: boolean;
  currentUsername?: string;
}) {
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');

  return (
    <div
      style={{
        marginTop: '0.7rem',
        paddingLeft: depth ? '1rem' : 0,
        borderLeft: depth ? '2px solid var(--color-line)' : undefined,
      }}
    >
      <div className="comment-corner-card" style={{ padding: '0.85rem 1rem' }}>
        <div className="flex items-center justify-between gap-2" style={{ marginBottom: '0.4rem' }}>
          <Link to={`/profile/${comment.author?.username || ''}`} style={{ textDecoration: 'none', color: 'var(--color-ink)' }}>
            <span className="font-semibold text-sm">{comment.author?.username || 'unknown'}</span>
          </Link>
          <span className="text-xs text-muted">{new Date(comment.created_at).toLocaleString()}</span>
        </div>

        {comment.is_accepted && (
          <span className="badge-tag badge-teal" style={{ marginBottom: '0.4rem', display: 'inline-block' }}>
            <i className="bx bx-check-circle"></i> accepted answer
          </span>
        )}

        <p className="text-sm" style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{comment.body}</p>

        <div className="flex items-center gap-2" style={{ marginTop: '0.6rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', color: comment.i_found_helpful ? '#00665A' : undefined }}
            onClick={() => void onHelpful(comment.id)}
            aria-pressed={comment.i_found_helpful}
          >
            <i className="bx bx-like"></i> This helped me ({comment.helpful_count})
          </button>
          <button
            className="btn btn-secondary"
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
            onClick={() => setReplying(v => !v)}
          >
            Reply
          </button>
          {canAccept && !comment.is_accepted && (
            <button
              className="btn btn-primary"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
              onClick={() => void onAccept(comment.id)}
            >
              <i className="bx bx-check-circle"></i> Accept answer
            </button>
          )}
        </div>

        {replying && (
          <div style={{ marginTop: '0.6rem' }}>
            <textarea
              value={replyBody}
              onChange={e => setReplyBody(e.target.value)}
              rows={2}
              placeholder="Write a reply…"
              style={{ width: '100%', marginBottom: '0.5rem' }}
            />
            <button
              className="btn btn-primary"
              style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}
              disabled={!replyBody.trim()}
              onClick={async () => {
                await onReply(comment.id, replyBody.trim());
                setReplyBody('');
                setReplying(false);
              }}
            >
              Post reply
            </button>
          </div>
        )}
      </div>

      {comment.replies?.map(reply => (
        <CommentThread
          key={reply.id}
          comment={reply}
          postId={postId}
          depth={depth + 1}
          onReply={onReply}
          onHelpful={onHelpful}
          onAccept={onAccept}
          currentUsername={currentUsername}
        />
      ))}
    </div>
  );
}

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { toggleLike, toggleFollow, isFollowing } = useFeed();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reported, setReported] = useState(false);

  const loadPost = useCallback(async () => {
    setLoading(true);
    const data = await apiFetch<FeedPost>(`/posts/${id}/`);
    setPost(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void loadPost();
  }, [loadPost]);

  if (loading) return <CuriousLoading message="Loading discussion…" />;
  if (!post) {
    return (
      <CuriousEmpty
        title="Post not found"
        description="It may have been removed."
        actionButton={
          <button className="btn btn-primary mt-4" onClick={() => navigate('/feed')}>
            Back to feed
          </button>
        }
      />
    );
  }

  const isMine = user?.username === post.author.username;
  const following = isFollowing(post.author.username);

  const addComment = async (body: string, parent?: number) => {
    const created = await apiFetch<FeedComment>(`/posts/${post.id}/comments/`, {
      method: 'POST',
      body: JSON.stringify({ body, ...(parent ? { parent } : {}) }),
    });
    if (created) {
      await loadPost();
      return created;
    }
    return null;
  };

  const handleHelpful = async (commentId: number) => {
    await apiFetch(`/comments/${commentId}/helpful/`, { method: 'POST' });
    await loadPost(); // counts confirmed by server; UI never reloaded a full page
  };

  const handleAccept = async (commentId: number) => {
    await apiFetch(`/comments/${commentId}/accept/`, { method: 'POST' });
    await loadPost();
  };

  const handleSolve = async () => {
    await apiFetch(`/posts/${post.id}/solve/`, { method: 'POST' });
    await loadPost();
  };

  const handleReport = async () => {
    const reason = reportReason.trim();
    if (!reason) return;
    const ok = await apiFetch(`/posts/${post.id}/flag/`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (ok) {
      setReporting(false);
      setReportReason('');
      setReported(true);
    }
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <Link to="/feed" className="text-sm text-muted" style={{ textDecoration: 'none' }}>
        <i className="bx bx-left-arrow-alt"></i> Back to feed
      </Link>

      <article className="comment-corner-card" style={{ padding: '1.25rem 1.4rem', marginTop: '0.75rem' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: '0.5rem' }}>
          <SubjectTag subject={post.subject} />
          <span className="badge-tag badge-coral" style={{ fontSize: '0.62rem' }}>{post.kind}</span>
          {post.is_solved && <span className="badge-tag badge-teal" style={{ fontSize: '0.62rem' }}>solved</span>}
        </div>

        <h1 style={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1.25, marginBottom: '0.6rem' }}>{post.title}</h1>

        <div className="flex items-center justify-between gap-2" style={{ marginBottom: '0.8rem' }}>
          <Link to={`/profile/${post.author.username}`} style={{ textDecoration: 'none', color: 'var(--color-ink)' }}>
            <span className="font-semibold text-sm">@{post.author.username}</span>{' '}
            <span className="text-xs text-muted">{new Date(post.created_at).toLocaleString()}</span>
          </Link>
          {isAuthenticated && !isMine && (
            <button
              className={`btn ${following ? 'btn-secondary' : 'btn-primary'}`}
              style={{ padding: '0.3rem 0.7rem', fontSize: '0.72rem' }}
              onClick={() => void toggleFollow(post.author.username)}
            >
              {following ? 'Following' : 'Follow'}
            </button>
          )}
        </div>

        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: '0.95rem' }}>{post.body}</p>

        {post.equations && post.equations.length > 0 && (
          <div style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {post.equations.map(eq => (
              <code
                key={eq.id}
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: '0.85rem',
                  background: 'var(--color-paper)',
                  border: '1px solid var(--color-line)',
                  borderRadius: 4,
                  padding: '0.4rem 0.6rem',
                  display: 'inline-block',
                  width: 'fit-content',
                }}
              >
                {eq.latex}
                {eq.description ? <span className="text-muted"> — {eq.description}</span> : null}
              </code>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2" style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1.5px solid var(--color-line)', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', color: post.liked_by_me ? 'var(--color-coral)' : undefined }}
            onClick={() => void toggleLike(post.id)}
            disabled={!isAuthenticated}
          >
            <i className="bx bx-heart"></i> {post.like_count}
          </button>
          <span className="text-sm text-muted">
            <i className="bx bx-message-rounded"></i> {post.comment_count} comments
          </span>
          {isMine && post.kind === 'question' && !post.is_solved && (
            <button className="btn btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }} onClick={() => void handleSolve()}>
              <i className="bx bx-check-double"></i> Mark as solved
            </button>
          )}
          {isAuthenticated && !isMine && !reported && (
            <button
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', marginLeft: 'auto' }}
              onClick={() => setReporting(v => !v)}
              aria-pressed={reporting}
            >
              <i className="bx bx-flag"></i> {reporting ? 'Cancel' : 'Report'}
            </button>
          )}
          {reported && (
            <span className="badge-tag badge-teal" style={{ marginLeft: 'auto' }}>
              <i className="bx bx-check-shield"></i> Reported — our review team will take a look
            </span>
          )}
        </div>

        {reporting && !reported && (
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1.5px solid var(--color-line)' }}>
            <label className="text-sm font-semibold" htmlFor="report-reason" style={{ display: 'block', marginBottom: '0.4rem' }}>
              Why are you reporting this post?
            </label>
            <textarea
              id="report-reason"
              rows={2}
              placeholder="Describe the issue — spam, harassment, off-topic, misinformation…"
              value={reportReason}
              onChange={e => setReportReason(e.target.value)}
              style={{ width: '100%', marginBottom: '0.5rem' }}
            />
            <button
              className="btn btn-primary"
              style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }}
              disabled={!reportReason.trim()}
              onClick={() => void handleReport()}
            >
              <i className="bx bx-flag"></i> Submit report
            </button>
          </div>
        )}
      </article>

      <section style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          <HighlighterText color="#F4B43D">Discussion</HighlighterText>
        </h3>

        {isAuthenticated ? (
          <div className="comment-corner-card" style={{ padding: '1rem 1.1rem', marginBottom: '1rem' }}>
            <textarea
              rows={3}
              placeholder="Teach the community — explain clearly. Use @username to mention someone."
              value={commentBody}
              onChange={e => setCommentBody(e.target.value)}
              style={{ width: '100%', marginBottom: '0.6rem' }}
            />
            <button
              className="btn btn-primary"
              disabled={!commentBody.trim()}
              onClick={async () => {
                const ok = await addComment(commentBody.trim());
                if (ok) setCommentBody('');
              }}
            >
              Post comment
            </button>
          </div>
        ) : (
          <div className="alert alert-info">
            <span>
              <Link to="/login" style={{ fontWeight: 700 }}>Sign in</Link> to comment, reply and mark answers helpful.
            </span>
          </div>
        )}

        {!post.comments || post.comments.length === 0 ? (
          <CuriousEmpty title="No answers yet" description="Be the first to help — your explanation could earn the Teacher badge." />
        ) : (
          post.comments.map(comment => (
            <CommentThread
              key={comment.id}
              comment={comment}
              postId={post.id}
              onReply={async (parentId, body) => {
                await addComment(body, parentId);
              }}
              onHelpful={handleHelpful}
              onAccept={handleAccept}
              canAccept={isMine}
              currentUsername={user?.username}
            />
          ))
        )}
      </section>
    </div>
  );
}
