import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch, apiVoid } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import { CuriousLoading, CuriousEmpty } from '../components/CuriousStates';
import { HighlighterText } from '../components/HighlighterText';
import Modal from '../components/Modal';
import { UndoNotice } from '../components/UndoToast';
import type { ResearchDoc } from './Research';

interface Revision {
  id: number;
  editor: { username: string };
  summary: string;
  title: string;
  abstract: string;
  body: string;
  field: string;
  status: string;
  created_at: string;
}

const FIELDS = ['Mathematics', 'Physics', 'Biology', 'Computer Science', 'Economics', 'Other'];
const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];
const UNDO_VISIBLE_MS = 45_000;

export default function ResearchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [doc, setDoc] = useState<ResearchDoc | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [abstractText, setAbstractText] = useState('');
  const [field, setField] = useState('');
  const [status, setStatus] = useState('draft');
  const [body, setBody] = useState('');
  const [summary, setSummary] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState<{ expiresAt: number } | null>(null);
  const [confirmRevision, setConfirmRevision] = useState<number | null>(null);
  const [restoringRevision, setRestoringRevision] = useState<number | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (showSpinner = true) => {
    const requestId = ++requestRef.current;
    if (showSpinner) setLoading(true);
    const docData = await apiFetch<ResearchDoc>(`/research/${id}/`);
    if (requestId !== requestRef.current) return;
    if (!docData) {
      if (showSpinner) setLoading(false);
      setDoc(null);
      return;
    }
    setDoc(docData);
    setTitle(docData.title);
    setAbstractText(docData.abstract || '');
    setField(docData.field || '');
    setStatus(docData.status || 'draft');
    setBody(docData.body || '');
    const revData = await apiFetch<{ results: Revision[] }>(`/research/${id}/revisions/`);
    if (requestId !== requestRef.current) return;
    setRevisions(revData?.results || []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(''), 4000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  if (loading) return <CuriousLoading message="Opening document…" />;
  if (!doc) {
    return (
      <CuriousEmpty
        title="Document not found"
        description="You may not have access to this document, or it has been removed."
        actionButton={
          <button className="btn btn-primary mt-4" onClick={() => navigate('/research')}>
            Back to research
          </button>
        }
      />
    );
  }

  const isOwner = doc.mine ?? user?.username === doc.owner.username;
  const isCoAuthor = doc.co_authors.some(c => c.username === user?.username);
  const canEdit = doc.can_edit ?? (isOwner || isCoAuthor);

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const updated = await apiFetch<ResearchDoc>(`/research/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: title.trim(),
        abstract: abstractText.trim(),
        field: field.trim(),
        body,
        summary: summary.trim() || 'Edited document',
        ...(isOwner ? { status } : {}),
      }),
    });
    setSaving(false);
    if (updated) {
      setSummary('');
      await load(false);
      setFlash('Changes saved as a new revision.');
    }
  };

  const invite = async () => {
    if (!inviteUsername.trim()) return;
    const result = await apiFetch(`/research/${id}/invite/`, {
      method: 'POST',
      body: JSON.stringify({ username: inviteUsername.trim() }),
    });
    if (result) {
      setInviteUsername('');
      setFlash(`Invitation sent to @${inviteUsername.trim()}.`);
      await load(false);
    }
  };

  const deleteDoc = async () => {
    setDeleting(true);
    const ok = await apiVoid(`/research/${id}/`, { method: 'DELETE' });
    setDeleting(false);
    if (ok) {
      setDeleteOpen(false);
      setDeleted({ expiresAt: Date.now() + UNDO_VISIBLE_MS });
    }
  };

  const restoreDoc = async () => {
    const restored = await apiFetch<ResearchDoc>(`/research/${id}/restore/`, { method: 'POST' });
    if (restored) {
      setDeleted(null);
      await load(false);
      setFlash('Document restored.');
    }
  };

  const restoreRevision = async (revisionId: number) => {
    setRestoringRevision(revisionId);
    const updated = await apiFetch<ResearchDoc>(
      `/research/${id}/revisions/${revisionId}/restore/`,
      { method: 'POST' },
    );
    setRestoringRevision(null);
    if (updated) {
      setConfirmRevision(null);
      await load(false);
      setFlash(`Restored revision #${revisionId}.`);
    }
  };

  if (deleted) {
    return (
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        <div className="comment-corner-card room-gate" style={{ margin: '2rem auto', maxWidth: 560 }}>
          <div className="room-gate-icon" style={{ background: 'rgba(255, 90, 54, 0.12)', color: 'var(--color-coral)' }}>
            <i className="bx bx-trash"></i>
          </div>
          <span className="eyebrow">Document deleted</span>
          <h3>“{doc.title}” is hidden</h3>
          <p className="text-muted text-sm">
            The document and its revision history are hidden from collaborators.
            Restore it to keep writing together.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => void restoreDoc()}>
            <i className="bx bx-undo"></i> Restore document
          </button>
          <Link to="/research" className="text-sm text-muted">Back to research</Link>
        </div>
        <UndoNotice
          label="Document deleted"
          title={doc.title}
          expiresAt={deleted.expiresAt}
          onUndo={async () => {
            await restoreDoc();
          }}
          onDismiss={() => navigate('/research')}
        />
      </div>
    );
  }

  const statusLabel = STATUSES.find(item => item.value === doc.status)?.label || doc.status;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="research-topbar">
        <Link to="/research" className="text-sm text-muted back-link">
          <i className="bx bx-left-arrow-alt"></i> Back to research
        </Link>
        {isOwner && (
          <button type="button" className="btn btn-secondary" onClick={() => setDeleteOpen(true)}>
            <i className="bx bx-trash"></i> Delete document
          </button>
        )}
      </div>

      {flash && (
        <div className="alert alert-info research-flash" role="status">
          <span><i className="bx bx-check-circle"></i> {flash}</span>
        </div>
      )}

      <div className="comment-corner-card" style={{ padding: '1.3rem 1.4rem', marginTop: '0.75rem' }}>
        <div className="flex items-center justify-between gap-2" style={{ marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <span className="badge-tag badge-teal" style={{ fontSize: '0.62rem' }}>{doc.field || 'General'}</span>
          <span className={`badge-tag ${doc.status === 'published' ? 'badge-teal' : doc.status === 'archived' ? '' : 'badge-mustard'}`} style={{ fontSize: '0.62rem' }}>
            {statusLabel}
          </span>
        </div>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.4rem' }}>{doc.title}</h1>
        <p className="text-sm text-muted" style={{ lineHeight: 1.55 }}>{doc.abstract || 'No abstract yet.'}</p>
        <div className="text-xs mt-2" style={{ color: 'var(--color-faded-ink)' }}>
          Owner: @{doc.owner.username}
          {doc.co_authors.length > 0 && <> · Co-authors: {doc.co_authors.map(c => `@${c.username}`).join(', ')}</>}
        </div>
      </div>

      {canEdit ? (
        <div className="comment-corner-card research-editor" style={{ padding: '1.2rem 1.3rem', marginTop: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.6rem' }}>
            <HighlighterText color="#4C6FE7">Collaborative draft</HighlighterText>
          </h3>

          <div className="form-group" style={{ marginBottom: '0.7rem' }}>
            <label htmlFor="research-title">Title</label>
            <input
              id="research-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={300}
              placeholder="Document title"
            />
          </div>

          <div className="form-group" style={{ marginBottom: '0.7rem' }}>
            <label htmlFor="research-abstract">Abstract</label>
            <textarea
              id="research-abstract"
              rows={3}
              value={abstractText}
              onChange={e => setAbstractText(e.target.value)}
              placeholder="A short summary of the question and approach."
            />
          </div>

          <div className="research-meta-grid">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="research-field">Field</label>
              <input
                id="research-field"
                list="research-fields"
                value={field}
                onChange={e => setField(e.target.value)}
                maxLength={120}
                placeholder="e.g. Mathematics"
              />
              <datalist id="research-fields">
                {FIELDS.map(item => <option key={item} value={item} />)}
              </datalist>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="research-status">Status</label>
              <select
                id="research-status"
                value={status}
                onChange={e => setStatus(e.target.value)}
                disabled={!isOwner}
                title={isOwner ? 'Choose who can read the document' : 'Only the owner can change the status'}
              >
                {STATUSES.map(item => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ margin: '0.7rem 0 0' }}>
            <label htmlFor="research-body">Draft</label>
            <textarea
              id="research-body"
              rows={14}
              value={body}
              onChange={e => setBody(e.target.value)}
              style={{ lineHeight: 1.65 }}
              placeholder="Write your research draft here. Every save creates a restorable revision."
            />
            <span className="field-hint">{body.trim() ? body.trim().split(/\s+/).length : 0} words</span>
          </div>

          <div className="form-group" style={{ margin: '0.7rem 0 0' }}>
            <label htmlFor="research-summary">Change summary</label>
            <input
              id="research-summary"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="e.g. Added the methodology section"
              maxLength={300}
            />
          </div>

          <div className="settings-actions" style={{ marginTop: '0.9rem' }}>
            <button className="btn btn-primary" onClick={() => void save()} disabled={saving || !title.trim()}>
              {saving ? <><i className="bx bx-loader-alt bx-spin"></i> Saving…</> : <><i className="bx bx-save"></i> Save contribution</>}
            </button>
            <span className="text-xs text-muted">Every save is stored in the revision history.</span>
          </div>
        </div>
      ) : (
        <div className="comment-corner-card" style={{ padding: '1.2rem 1.3rem', marginTop: '1rem' }}>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.65 }}>
            {doc.body || 'This document has no content yet.'}
          </pre>
        </div>
      )}

      {isOwner && (
        <div className="comment-corner-card" style={{ padding: '1.1rem 1.2rem', marginTop: '1rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.2rem' }}>Invite a co-author</h3>
          <p className="text-xs text-muted" style={{ marginBottom: '0.6rem' }}>
            Co-authors can edit the draft and restore revisions. They will see the invitation in Research Studio.
          </p>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <input
              value={inviteUsername}
              onChange={e => setInviteUsername(e.target.value)}
              placeholder="Username"
              style={{ flex: 1, minWidth: 160 }}
              onKeyDown={e => {
                if (e.key === 'Enter') void invite();
              }}
            />
            <button className="btn btn-primary" onClick={() => void invite()} disabled={!inviteUsername.trim()}>
              <i className="bx bx-user-plus"></i> Send invite
            </button>
          </div>
        </div>
      )}

      <section style={{ marginTop: '1.25rem', marginBottom: '2rem' }}>
        <div className="activity-head">
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Contribution history</h3>
          <span className="text-xs text-muted">{revisions.length} revision{revisions.length === 1 ? '' : 's'}</span>
        </div>
        {revisions.length === 0 ? (
          <p className="text-sm text-muted">No revisions yet.</p>
        ) : (
          <div className="revision-list">
            {revisions.map((rev, index) => (
              <article key={rev.id} className="revision-item">
                <div className="revision-head">
                  <div className="revision-title">
                    <strong>@{rev.editor.username}</strong>
                    <span>{rev.summary || 'Document saved'}</span>
                    <small>
                      {new Date(rev.created_at).toLocaleString()}
                      {index === 0 ? ' · latest' : ''}
                    </small>
                  </div>
                  {canEdit && (
                    <div className="revision-actions">
                      {confirmRevision === rev.id ? (
                        <>
                          <span className="text-xs" style={{ color: 'var(--danger)' }}>Restore this version?</span>
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem' }}
                            disabled={restoringRevision === rev.id}
                            onClick={() => void restoreRevision(rev.id)}
                          >
                            {restoringRevision === rev.id ? 'Restoring…' : 'Yes, restore'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem' }}
                            onClick={() => setConfirmRevision(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem' }}
                          onClick={() => setConfirmRevision(rev.id)}
                        >
                          <i className="bx bx-history"></i> Restore
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <details className="revision-preview">
                  <summary>Preview this snapshot</summary>
                  <div>
                    <h4>{rev.title || 'Untitled document'}</h4>
                    {rev.abstract && <p>{rev.abstract}</p>}
                    <pre>{rev.body || 'No draft text in this revision.'}</pre>
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}
        {isAuthenticated && !canEdit && (
          <p className="text-xs text-muted mt-2">Ask the owner to invite you as a co-author to contribute.</p>
        )}
      </section>

      {deleteOpen && (
        <Modal
          title="Delete this research document?"
          eyebrow="Owner tools"
          icon="bx-trash"
          onClose={() => setDeleteOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>
                Keep document
              </button>
              <button type="button" className="btn btn-danger" disabled={deleting} onClick={() => void deleteDoc()}>
                {deleting ? <><i className="bx bx-loader-alt bx-spin"></i> Deleting…</> : <><i className="bx bx-trash"></i> Delete document</>}
              </button>
            </>
          }
        >
          <p>
            “{doc.title}” and its revision history will be hidden from you and every
            collaborator.
          </p>
          <p className="danger-note">
            You can undo this for a few minutes. After that, the document is
            permanently removed by the retention cleanup.
          </p>
        </Modal>
      )}
    </div>
  );
}
