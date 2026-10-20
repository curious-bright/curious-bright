import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import { CuriousLoading, CuriousEmpty } from '../components/CuriousStates';
import { HighlighterText } from '../components/HighlighterText';
import type { ResearchDoc } from './Research';

interface Revision {
  id: number;
  editor: { username: string };
  summary: string;
  created_at: string;
}

export default function ResearchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [doc, setDoc] = useState<ResearchDoc | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [summary, setSummary] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [docData, revData] = await Promise.all([
      apiFetch<ResearchDoc>(`/research/${id}/`),
      apiFetch<{ results: Revision[] }>(`/research/${id}/revisions/`),
    ]);
    setDoc(docData);
    setBody(docData?.body || '');
    setRevisions(revData?.results || []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <CuriousLoading message="Opening document…" />;
  if (!doc) {
    return (
      <CuriousEmpty
        title="Document not found"
        description="You may not have access to this document."
        actionButton={
          <button className="btn btn-primary mt-4" onClick={() => navigate('/research')}>
            Back to research
          </button>
        }
      />
    );
  }

  const isOwner = user?.username === doc.owner.username;
  const isCoAuthor = doc.co_authors.some(c => c.username === user?.username);
  const canEdit = isOwner || isCoAuthor;

  const save = async () => {
    setSaving(true);
    const updated = await apiFetch<ResearchDoc>(`/research/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ body, summary: summary || 'Edited document' }),
    });
    setSaving(false);
    if (updated) {
      setSummary('');
      await load();
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
      await load();
    }
  };

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <Link to="/research" className="text-sm text-muted" style={{ textDecoration: 'none' }}>
        <i className="bx bx-left-arrow-alt"></i> Back to research
      </Link>

      <div className="comment-corner-card" style={{ padding: '1.3rem 1.4rem', marginTop: '0.75rem' }}>
        <div className="flex items-center justify-between gap-2" style={{ marginBottom: '0.5rem' }}>
          <span className="badge-tag badge-teal" style={{ fontSize: '0.62rem' }}>{doc.field || 'General'}</span>
          <span className="text-xs text-muted">{doc.status}</span>
        </div>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.4rem' }}>{doc.title}</h1>
        <p className="text-sm text-muted" style={{ lineHeight: 1.55 }}>{doc.abstract}</p>
        <div className="text-xs mt-2" style={{ color: 'var(--color-faded-ink)' }}>
          Owner: @{doc.owner.username}
          {doc.co_authors.length > 0 && <> · Co-authors: {doc.co_authors.map(c => `@${c.username}`).join(', ')}</>}
        </div>
      </div>

      {canEdit ? (
        <div className="comment-corner-card" style={{ padding: '1.2rem 1.3rem', marginTop: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.6rem' }}>
            <HighlighterText color="#4C6FE7">Collaborative draft</HighlighterText>
          </h3>
          <textarea
            rows={12}
            value={body}
            onChange={e => setBody(e.target.value)}
            style={{ width: '100%', marginBottom: '0.6rem', lineHeight: 1.6 }}
            placeholder="Write your research draft here. Co-authors’ edits create revisions."
          />
          <input
            value={summary}
            onChange={e => setSummary(e.target.value)}
            placeholder="Change summary (e.g. Added methodology)"
            style={{ width: '100%', marginBottom: '0.7rem' }}
          />
          <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save contribution'}
          </button>
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
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>Invite a co-author</h3>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <input
              value={inviteUsername}
              onChange={e => setInviteUsername(e.target.value)}
              placeholder="Username"
              style={{ flex: 1, minWidth: 160 }}
            />
            <button className="btn btn-primary" onClick={() => void invite()} disabled={!inviteUsername.trim()}>
              Send invite
            </button>
          </div>
        </div>
      )}

      <section style={{ marginTop: '1.25rem', marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.6rem' }}>Contribution history</h3>
        {revisions.length === 0 ? (
          <p className="text-sm text-muted">No revisions yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {revisions.map(rev => (
              <div key={rev.id} className="text-sm" style={{ padding: '0.55rem 0.75rem', background: 'var(--color-paper)', border: '1.5px solid var(--color-line)', borderRadius: 4 }}>
                <strong>@{rev.editor.username}</strong>
                {rev.summary ? <> — {rev.summary}</> : null}
                <span className="text-xs text-muted" style={{ marginLeft: '0.5rem' }}>
                  {new Date(rev.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
        {isAuthenticated && !canEdit && (
          <p className="text-xs text-muted mt-2">Ask the owner to invite you as a co-author to contribute.</p>
        )}
      </section>
    </div>
  );
}
