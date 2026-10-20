import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import { CuriousLoading, CuriousEmpty } from '../components/CuriousStates';
import { HighlighterText } from '../components/HighlighterText';

export interface ResearchDoc {
  id: number;
  owner: { id: number; username: string };
  title: string;
  abstract: string;
  body: string;
  field: string;
  status: string;
  co_authors: { username: string; role: string }[];
  created_at: string;
  updated_at: string;
}

export interface Invitation {
  id: number;
  document: number;
  document_title: string;
  role: string;
  inviter?: string;
}

const FIELDS = ['Mathematics', 'Physics', 'Biology', 'Computer Science', 'Economics', 'Other'];

export default function Research() {
  const { isAuthenticated } = useAuth();
  const [docs, setDocs] = useState<ResearchDoc[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [field, setField] = useState(FIELDS[0]);
  const [abstractText, setAbstractText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [docData, inviteData] = await Promise.all([
      apiFetch<{ results: ResearchDoc[] }>('/research/'),
      isAuthenticated ? apiFetch<{ results: Invitation[] }>('/research/invitations/') : Promise.resolve(null),
    ]);
    setDocs(docData?.results || []);
    setInvites(inviteData?.results || []);
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!title.trim()) return;
    const created = await apiFetch<ResearchDoc>('/research/', {
      method: 'POST',
      body: JSON.stringify({ title: title.trim(), field, abstract: abstractText.trim() }),
    });
    if (created) {
      setTitle('');
      setAbstractText('');
      setCreating(false);
      await load();
    }
  };

  const respond = async (inviteId: number, action: 'accept' | 'decline') => {
    const updated = await apiFetch(`/research/invitations/${inviteId}/respond/`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    if (updated) await load();
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="text-center" style={{ marginBottom: '1.25rem' }}>
        <h2>
          <HighlighterText color="#4C6FE7">Research Studio</HighlighterText>
        </h2>
        <p className="text-muted text-sm mt-2">
          Draft documents with co-authors — contribute and earn the Collaborator badge.
        </p>
      </div>

      {!isAuthenticated ? (
        <div className="alert alert-info">
          <span>
            <Link to="/login" style={{ fontWeight: 700 }}>Sign in</Link> to create or join research documents.
          </span>
        </div>
      ) : creating ? (
        <div className="comment-corner-card" style={{ padding: '1.1rem 1.2rem', marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} style={{ marginBottom: '0.6rem', width: '100%' }} />
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Field</label>
          <select value={field} onChange={e => setField(e.target.value)} style={{ marginBottom: '0.6rem', width: '100%' }}>
            {FIELDS.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Abstract</label>
          <textarea
            rows={3}
            value={abstractText}
            onChange={e => setAbstractText(e.target.value)}
            style={{ marginBottom: '0.8rem', width: '100%' }}
            placeholder="What are you investigating together?"
          />
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={() => void create()} disabled={!title.trim()}>
              Create document
            </button>
            <button className="btn btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary w-full" style={{ marginBottom: '1.25rem' }} onClick={() => setCreating(true)}>
          <i className="bx bx-plus-medical"></i> Start a research document
        </button>
      )}

      {isAuthenticated && invites.length > 0 && (
        <section style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.6rem' }}>Invitations</h3>
          {invites.map(invite => (
            <div key={invite.id} className="alert alert-info" style={{ alignItems: 'center' }}>
              <span className="flex items-center gap-2" style={{ flex: 1 }}>
                <i className="bx bx-envelope"></i>
                You’re invited to collaborate on <strong>{invite.document_title}</strong> ({invite.role})
              </span>
              <span className="flex gap-2">
                <button className="btn btn-primary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }} onClick={() => void respond(invite.id, 'accept')}>
                  Accept
                </button>
                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }} onClick={() => void respond(invite.id, 'decline')}>
                  Decline
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      {loading ? (
        <CuriousLoading message="Loading research documents…" />
      ) : docs.length === 0 ? (
        <CuriousEmpty
          title="No research documents yet"
          description="Start one, then invite a co-author. Your contributions unlock the Collaborator badge."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {docs.map(doc => (
            <Link key={doc.id} to={`/research/${doc.id}`} className="comment-corner-card" style={{ padding: '1rem 1.15rem', textDecoration: 'none', color: 'inherit', marginBottom: 0 }}>
              <div className="flex items-center justify-between gap-2" style={{ marginBottom: '0.3rem' }}>
                <span className="badge-tag badge-teal" style={{ fontSize: '0.62rem' }}>{doc.field || 'General'}</span>
                <span className="text-xs text-muted">updated {new Date(doc.updated_at).toLocaleDateString()}</span>
              </div>
              <div className="font-semibold" style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>{doc.title}</div>
              {doc.abstract && (
                <p className="text-sm text-muted" style={{ lineHeight: 1.5 }}>
                  {doc.abstract.length > 180 ? `${doc.abstract.slice(0, 180)}…` : doc.abstract}
                </p>
              )}
              <div className="text-xs mt-2" style={{ color: 'var(--color-faded-ink)' }}>
                by @{doc.owner.username}
                {doc.co_authors.length > 0 && <> · with {doc.co_authors.map(c => `@${c.username}`).join(', ')}</>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
