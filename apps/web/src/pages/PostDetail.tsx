import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch, apiVoid, resultsOf } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { useAuth } from '../state/AuthContext';
import { useFeed, type FeedComment, type FeedPost, type PostVisibility } from '../state/FeedContext';
import { SubjectTag } from '../components/PostCard';
import { CuriousLoading, CuriousEmpty } from '../components/CuriousStates';
import { HighlighterText } from '../components/HighlighterText';

const SUBJECTS = ['math', 'science', 'programming', 'language', 'research', 'general'];
const KINDS = ['question', 'explanation', 'note'];
const VISIBILITIES: { value: PostVisibility; label: string; icon: string }[] = [
  { value: 'public', label: 'Public', icon: 'bx-world' },
  { value: 'followers', label: 'Followers', icon: 'bx-group' },
  { value: 'room_only', label: 'Study room', icon: 'bx-lock-alt' },
];

const UNDO_WINDOW_MS = 5 * 60 * 1000;

interface ActivityRow {
  id: number;
  action: string;
  actor: string;
  reason: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface RoomOption {
  id: number;
  name: string;
  is_member: boolean;
}

function canUndoComment(comment: FeedComment, isModerator: boolean): boolean {
  if (!comment.is_deleted || !comment.deleted_at) return false;
  if (!comment.mine && !isModerator) return false;
  const deletedAt = Date.parse(comment.deleted_at);
  return Number.isFinite(deletedAt) && Date.now() - deletedAt < UNDO_WINDOW_MS;
}

function CommentThread({
  comment,
  depth = 0,
  canInteract,
  canAccept = false,
  isModerator = false,
  onReply,
  onHelpful,
  onAccept,
  onEdit,
  onDelete,
  onRestore,
}: {
  comment: FeedComment;
  depth?: number;
  canInteract: boolean;
  canAccept?: boolean;
  isModerator?: boolean;
  onReply: (parentId: number, body: string) => Promise<boolean>;
  onHelpful: (commentId: number) => Promise<void>;
  onAccept: (commentId: number) => Promise<void>;
  onEdit: (commentId: number, body: string) => Promise<boolean>;
  onDelete: (commentId: number) => Promise<boolean>;
  onRestore: (commentId: number) => Promise<void>;
}) {
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = !comment.is_deleted && (comment.can_edit ?? comment.mine);
  const canDelete = !comment.is_deleted && (comment.can_delete ?? comment.mine);
  const undoable = canUndoComment(comment, isModerator);

  return (
    <div className={`comment-thread ${depth ? 'nested' : ''}`} style={{ marginLeft: depth ? '1rem' : 0 }}>
      <div className="comment-corner-card comment-item">
        <div className="comment-head">
          <Link to={`/profile/${comment.author?.username || ''}`} className="comment-author">
            <span className="comment-avatar">
              {comment.author?.username?.[0]?.toUpperCase() || '?'}
            </span>
            <span>
              <strong>{comment.author?.username || 'deleted member'}</strong>
              <small>
                {new Date(comment.created_at).toLocaleString()}
                {comment.is_edited ? ' · edited' : ''}
              </small>
            </span>
          </Link>

          {comment.is_accepted && !comment.is_deleted && (
            <span className="badge-tag badge-teal">
              <i className="bx bx-check-circle"></i> accepted answer
            </span>
          )}

          {(canEdit || canDelete) && !editing && (
            <div className="comment-actions">
              {canEdit && (
                <button
                  type="button"
                  className="icon-action"
                  aria-label="Edit comment"
                  title="Edit comment"
                  onClick={() => {
                    setEditBody(comment.body);
                    setEditing(true);
                  }}
                >
                  <i className="bx bx-edit-alt"></i>
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  className={`icon-action danger ${confirming ? 'confirming' : ''}`}
                  aria-label={confirming ? 'Confirm delete comment' : 'Delete comment'}
                  title={confirming ? 'Click again to delete' : 'Delete comment'}
                  disabled={busy}
                  onBlur={() => setConfirming(false)}
                  onClick={async () => {
                    if (!confirming) {
                      setConfirming(true);
                      return;
                    }
                    setBusy(true);
                    await onDelete(comment.id);
                    setBusy(false);
                  }}
                >
                  {confirming ? <span className="confirm-label">{busy ? '…' : 'Confirm?'}</span> : <i className="bx bx-trash"></i>}
                </button>
              )}
            </div>
          )}
        </div>

        {comment.is_deleted ? (
          <div className="comment-tombstone">
            <p><i className="bx bx-trash"></i> This comment was deleted.</p>
            {undoable && (
              <button type="button" className="btn btn-secondary comment-undo" onClick={() => void onRestore(comment.id)}>
                <i className="bx bx-undo"></i> Undo delete
              </button>
            )}
          </div>
        ) : editing ? (
          <div className="comment-edit">
            <textarea
              rows={3}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              aria-label="Edit comment"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !editBody.trim() || editBody.trim() === comment.body}
                onClick={async () => {
                  setBusy(true);
                  const ok = await onEdit(comment.id, editBody.trim());
                  setBusy(false);
                  if (ok) setEditing(false);
                }}
              >
                {busy ? 'Saving…' : 'Save edit'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="comment-body">{comment.body}</p>
        )}

        {!comment.is_deleted && (
          <div className="comment-foot">
            <button
              type="button"
              className={`btn btn-secondary comment-action ${comment.i_found_helpful ? 'is-helpful' : ''}`}
              onClick={() => void onHelpful(comment.id)}
              disabled={!canInteract}
              aria-pressed={comment.i_found_helpful}
            >
              <i className="bx bx-like"></i> This helped me ({comment.helpful_count})
            </button>
            <button
              type="button"
              className="btn btn-secondary comment-action"
              onClick={() => setReplying((value) => !value)}
              disabled={!canInteract}
            >
              <i className="bx bx-reply"></i> Reply
            </button>
            {canAccept && !comment.is_accepted && (
              <button
                type="button"
                className="btn btn-primary comment-action"
                onClick={() => void onAccept(comment.id)}
              >
                <i className="bx bx-check-circle"></i> Accept answer
              </button>
            )}
          </div>
        )}

        {!comment.is_deleted && replying && canInteract && (
          <div className="comment-reply">
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={2}
              placeholder={`Reply to @${comment.author?.username || 'this member'}…`}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!replyBody.trim() || busy}
              onClick={async () => {
                setBusy(true);
                const ok = await onReply(comment.id, replyBody.trim());
                setBusy(false);
                if (ok) {
                  setReplyBody('');
                  setReplying(false);
                }
              }}
            >
              {busy ? 'Posting…' : 'Post reply'}
            </button>
          </div>
        )}
      </div>

      {comment.replies?.map((reply) => (
        <CommentThread
          key={reply.id}
          comment={reply}
          depth={depth + 1}
          canInteract={canInteract}
          canAccept={canAccept}
          isModerator={isModerator}
          onReply={onReply}
          onHelpful={onHelpful}
          onAccept={onAccept}
          onEdit={onEdit}
          onDelete={onDelete}
          onRestore={onRestore}
        />
      ))}
    </div>
  );
}

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuth();
  const { toggleLike, toggleFollow, followStatus, updatePost, deletePost } = useFeed();

  const [post, setPost] = useState<FeedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reported, setReported] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editSubject, setEditSubject] = useState('math');
  const [editKind, setEditKind] = useState('question');
  const [editVisibility, setEditVisibility] = useState<PostVisibility>('public');
  const [editRoom, setEditRoom] = useState<number | ''>('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);

  const loadPost = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await apiFetch<FeedPost>(`/posts/${id}/`);
    if (data) setPost(data);
    if (!silent) setLoading(false);
  }, [id]);

  useEffect(() => {
    void loadPost();
  }, [loadPost]);

  useEffect(() => {
    if (!post) return;
    if (searchParams.get('edit') === '1' && post.can_edit) {
      startEdit(post);
      setSearchParams({}, { replace: true });
    }
    // startEdit intentionally reads the freshly loaded post only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, post?.updated_at]);

  useRealtime(id ? `/ws/posts/${id}/` : null, () => {
    void loadPost(true);
  });

  const isMine = !!post && (post.mine ?? user?.username === post.author.username);
  const canModerate = !!user?.can_moderate;
  const following = post ? (followStatus(post.author.username) ?? !!post.is_following_author) : false;

  function startEdit(target: FeedPost) {
    setEditTitle(target.title);
    setEditBody(target.body);
    setEditSubject(target.subject);
    setEditKind(target.kind);
    setEditVisibility(target.visibility || 'public');
    setEditRoom(target.room || '');
    setEditing(true);
    if (rooms.length === 0) {
      void (async () => {
        const data = await apiFetch<{ results: RoomOption[] }>('/rooms/');
        setRooms(resultsOf<RoomOption>(data).filter((room) => room.is_member));
      })();
    }
  }

  if (loading) return <CuriousLoading message="Loading discussion…" />;
  if (!post) {
    return (
      <CuriousEmpty
        title="Post not found"
        description="It may have been removed, or it is only visible to a different audience."
        actionButton={
          <button className="btn btn-primary mt-4" onClick={() => navigate('/feed')}>
            Back to feed
          </button>
        }
      />
    );
  }

  const addComment = async (body: string, parent?: number): Promise<boolean> => {
    const created = await apiFetch<FeedComment>(`/posts/${post.id}/comments/`, {
      method: 'POST',
      body: JSON.stringify({ body, ...(parent ? { parent } : {}) }),
    });
    if (!created) return false;
    await loadPost(true);
    return true;
  };

  const handleHelpful = async (commentId: number) => {
    await apiFetch(`/comments/${commentId}/helpful/`, { method: 'POST' });
    await loadPost(true);
  };

  const handleAccept = async (commentId: number) => {
    await apiFetch(`/comments/${commentId}/accept/`, { method: 'POST' });
    await loadPost(true);
  };

  const handleEditComment = async (commentId: number, body: string): Promise<boolean> => {
    const ok = await apiVoid(`/comments/${commentId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
    if (ok) await loadPost(true);
    return ok;
  };

  const handleDeleteComment = async (commentId: number): Promise<boolean> => {
    const ok = await apiVoid(`/comments/${commentId}/`, { method: 'DELETE' });
    if (ok) await loadPost(true);
    return ok;
  };

  const handleRestoreComment = async (commentId: number) => {
    const ok = await apiVoid(`/comments/${commentId}/restore/`, { method: 'POST' });
    if (ok) await loadPost(true);
  };

  const handleSolve = async () => {
    await apiFetch(`/posts/${post.id}/solve/`, { method: 'POST' });
    await loadPost(true);
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

  const saveEdit = async () => {
    if (!editTitle.trim() || !editBody.trim()) return;
    if (editVisibility === 'room_only' && !editRoom) return;
    setSavingEdit(true);
    const updated = await updatePost(post.id, {
      title: editTitle.trim(),
      body: editBody.trim(),
      subject: editSubject,
      kind: editKind,
      visibility: editVisibility,
      room: editVisibility === 'room_only' ? Number(editRoom) : null,
      expected_updated_at: post.updated_at,
    });
    setSavingEdit(false);
    if (updated) {
      setPost(updated);
      setEditing(false);
    }
  };

  const handleDeletePost = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    const ok = await deletePost(post.id, post);
    if (ok) navigate('/feed');
    else setConfirmingDelete(false);
  };

  const loadActivity = async () => {
    const next = !showActivity;
    setShowActivity(next);
    if (next && activity === null) {
      const data = await apiFetch<ActivityRow[]>(`/posts/${post.id}/activity/`);
      setActivity(data || []);
    }
  };

  const canDelete = post.can_delete ?? (isMine || canModerate);
  const canEdit = post.can_edit ?? isMine;
  const comments = post.comments || [];

  return (
    <div className="post-detail-page">
      <div className="post-detail-topbar">
        <Link to="/feed" className="text-sm text-muted back-link">
          <i className="bx bx-left-arrow-alt"></i> Back to feed
        </Link>
        <div className="post-detail-actions">
          {canEdit && !editing && (
            <button type="button" className="btn btn-secondary" onClick={() => startEdit(post)}>
              <i className="bx bx-edit-alt"></i> Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className={`btn ${confirmingDelete ? 'btn-danger' : 'btn-secondary'}`}
              onClick={() => void handleDeletePost()}
              onBlur={() => setConfirmingDelete(false)}
            >
              <i className="bx bx-trash"></i> {confirmingDelete ? 'Confirm delete' : 'Delete'}
            </button>
          )}
          {canEdit && (
            <button type="button" className="btn btn-secondary" onClick={() => void loadActivity()}>
              <i className="bx bx-history"></i> History
            </button>
          )}
        </div>
      </div>

      {showActivity && (
        <div className="comment-corner-card activity-card">
          <div className="activity-head">
            <h3><i className="bx bx-history"></i> Post history</h3>
            <button type="button" className="icon-action" onClick={() => setShowActivity(false)} aria-label="Close history">
              <i className="bx bx-x"></i>
            </button>
          </div>
          {activity === null ? (
            <p className="text-sm text-muted">Loading history…</p>
          ) : activity.length === 0 ? (
            <p className="text-sm text-muted">No edits or deletions recorded yet.</p>
          ) : (
            <ol className="activity-list">
              {activity.map((row) => (
                <li key={row.id}>
                  <span className={`badge-tag ${row.action === 'delete' ? 'badge-coral' : row.action === 'restore' ? 'badge-teal' : 'badge-mustard'}`}>
                    {row.action}
                  </span>
                  <div>
                    <strong>@{row.actor}</strong>
                    <small>{new Date(row.created_at).toLocaleString()}</small>
                    {row.reason ? <p>{row.reason}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <article className="comment-corner-card post-detail-card">
        {editing ? (
          <div className="post-edit-form">
            <div className="composer-chips">
              {KINDS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={`chip ${editKind === item ? 'chip-active' : ''}`}
                  onClick={() => setEditKind(item)}
                >
                  {item}
                </button>
              ))}
              <span className="composer-chip-divider" aria-hidden="true" />
              {SUBJECTS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={`chip ${editSubject === item ? 'chip-active' : ''}`}
                  onClick={() => setEditSubject(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={200} placeholder="Title" />
            <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={6} placeholder="Body" />
            <div className="visibility-options">
              {VISIBILITIES.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className={`visibility-option ${editVisibility === item.value ? 'selected' : ''}`}
                  onClick={() => setEditVisibility(item.value)}
                >
                  <i className={`bx ${item.icon}`}></i> {item.label}
                </button>
              ))}
            </div>
            {editVisibility === 'room_only' && (
              <select value={editRoom} onChange={(e) => setEditRoom(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Choose a study room…</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>{room.name}</option>
                ))}
              </select>
            )}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={savingEdit || !editTitle.trim() || !editBody.trim() || (editVisibility === 'room_only' && !editRoom)}
                onClick={() => void saveEdit()}
              >
                {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
              <span className="composer-shortcut">Conflicts are checked against other edits</span>
            </div>
          </div>
        ) : (
          <>
            <div className="post-tags">
              <SubjectTag subject={post.subject} />
              <span className="badge-tag badge-coral" style={{ fontSize: '0.62rem' }}>{post.kind}</span>
              {post.is_solved && <span className="badge-tag badge-teal" style={{ fontSize: '0.62rem' }}>solved</span>}
              <span className="badge-tag" style={{ fontSize: '0.62rem' }}>
                <i className={`bx ${VISIBILITIES.find((item) => item.value === post.visibility)?.icon || 'bx-world'}`}></i>
                {post.visibility_label || VISIBILITIES.find((item) => item.value === post.visibility)?.label || 'Public'}
              </span>
              {post.room_name && (
                <Link to={`/room/${post.room}`} className="badge-tag badge-mustard" style={{ fontSize: '0.62rem' }}>
                  <i className="bx bx-door-open"></i> {post.room_name}
                </Link>
              )}
            </div>

            <h1 className="post-detail-title">{post.title}</h1>

            <div className="post-detail-meta">
              <Link to={`/profile/${post.author.username}`} className="post-author">
                <span className="comment-avatar">{post.author.username[0]?.toUpperCase()}</span>
                <span>
                  <strong>@{post.author.username}</strong>
                  <small>
                    {new Date(post.created_at).toLocaleString()}
                    {post.is_edited ? ' · edited' : ''}
                  </small>
                </span>
              </Link>
              {isAuthenticated && !isMine && (
                <button
                  type="button"
                  className={`btn ${following ? 'btn-secondary' : 'btn-primary'}`}
                  style={{ padding: '0.35rem 0.8rem', fontSize: '0.75rem' }}
                  onClick={() => void toggleFollow(post.author.username, following)}
                >
                  {following ? 'Following' : 'Follow'}
                </button>
              )}
            </div>

            <p className="post-detail-body">{post.body}</p>

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
              <a className="post-attachment-link" href={post.attachment_url} target="_blank" rel="noopener noreferrer">
                <i className="bx bx-file"></i> {post.attachment_name || 'Open attached paper'}
              </a>
            )}

            <div className="post-detail-foot">
              <button
                type="button"
                className={`btn btn-secondary post-stat ${post.liked_by_me ? 'is-liked' : ''}`}
                onClick={() => void toggleLike(post.id)}
                disabled={!isAuthenticated}
              >
                <i className={post.liked_by_me ? 'bx bxs-heart' : 'bx bx-heart'}></i> {post.like_count}
              </button>
              <span className="text-sm text-muted">
                <i className="bx bx-message-rounded"></i> {post.comment_count} comments
              </span>
              {isMine && post.kind === 'question' && !post.is_solved && (
                <button type="button" className="btn btn-primary" onClick={() => void handleSolve()}>
                  <i className="bx bx-check-double"></i> Mark as solved
                </button>
              )}
              {isAuthenticated && !isMine && !reported && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => setReporting((value) => !value)}
                  aria-pressed={reporting}
                >
                  <i className="bx bx-flag"></i> {reporting ? 'Cancel report' : 'Report'}
                </button>
              )}
              {reported && (
                <span className="badge-tag badge-teal" style={{ marginLeft: 'auto' }}>
                  <i className="bx bx-check-shield"></i> Reported — thank you
                </span>
              )}
            </div>

            {reporting && !reported && (
              <div className="report-box">
                <label htmlFor="report-reason">Why are you reporting this post?</label>
                <textarea
                  id="report-reason"
                  rows={2}
                  placeholder="Spam, harassment, off-topic, misinformation…"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!reportReason.trim()}
                  onClick={() => void handleReport()}
                >
                  Submit report
                </button>
              </div>
            )}
          </>
        )}
      </article>

      <section className="discussion-section">
        <div className="discussion-heading">
          <h3><HighlighterText color="#F4B43D">Discussion</HighlighterText></h3>
          <span className="text-xs text-muted">{comments.length} thread{comments.length === 1 ? '' : 's'}</span>
        </div>

        {isAuthenticated ? (
          <div className="comment-corner-card comment-composer">
            <textarea
              rows={3}
              placeholder="Teach the community — explain clearly. Use @username to mention someone."
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              maxLength={4000}
            />
            <div className="comment-composer-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!commentBody.trim() || commentBusy}
                onClick={async () => {
                  setCommentBusy(true);
                  const ok = await addComment(commentBody.trim());
                  setCommentBusy(false);
                  if (ok) setCommentBody('');
                }}
              >
                {commentBusy ? 'Posting…' : 'Post comment'}
              </button>
              <span className="text-xs text-muted">Helpful answers can earn the Teacher badge.</span>
            </div>
          </div>
        ) : (
          <div className="alert alert-info">
            <span>
              <Link to="/login" style={{ fontWeight: 700 }}>Sign in</Link> to comment, reply and mark answers helpful.
            </span>
          </div>
        )}

        {comments.length === 0 ? (
          <CuriousEmpty title="No answers yet" description="Be the first to help — your explanation could earn the Teacher badge." />
        ) : (
          comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              canInteract={isAuthenticated}
              canAccept={isMine}
              isModerator={canModerate}
              onReply={async (parentId, body) => addComment(body, parentId)}
              onHelpful={handleHelpful}
              onAccept={handleAccept}
              onEdit={handleEditComment}
              onDelete={handleDeleteComment}
              onRestore={handleRestoreComment}
            />
          ))
        )}
      </section>
    </div>
  );
}
