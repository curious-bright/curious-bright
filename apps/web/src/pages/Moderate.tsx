import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, resultsOf } from '../lib/api';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { HighlighterText } from '../components/HighlighterText';
import { CuriousLoading, CuriousEmpty } from '../components/CuriousStates';
import { useAuth } from '../state/AuthContext';

interface QueuedPost {
  id: number;
  title: string;
  body: string;
  subject: string;
  kind: string;
  academic_level: string;
  attachment_url: string | null;
  attachment_name: string;
  author: { id: number; username: string };
  created_at: string;
}

interface Report {
  id: number;
  reporter: { id: number; username: string };
  post_id: number;
  post_title: string;
  post_author: string;
  reason: string;
  created_at: string;
}

export default function Moderate() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'QUEUE' | 'REPORTS' | 'OVERVIEW'>('QUEUE');
  const [queue, setQueue] = useState<QueuedPost[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');

  const canModerate = !!user?.can_moderate;

  useEffect(() => {
    if (authLoading || !isAuthenticated || !canModerate) return;
    let cancelled = false;
    const fetchQueue = async () => {
      setLoading(true);
      setActionMessage('');
      if (activeTab === 'QUEUE') {
        const data = await apiFetch(`/moderation/queue/`);
        if (!cancelled) setQueue(resultsOf<QueuedPost>(data));
      } else if (activeTab === 'REPORTS') {
        const data = await apiFetch(`/moderation/reports/`);
        if (!cancelled) setReports(resultsOf<Report>(data));
      }
      if (!cancelled) setLoading(false);
    };
    fetchQueue();
    return () => {
      cancelled = true;
    };
  }, [activeTab, authLoading, isAuthenticated, canModerate]);

  if (authLoading) {
    return <CuriousLoading message="Checking moderator access..." />;
  }

  if (!isAuthenticated || !canModerate) {
    return (
      <div style={{ maxWidth: '560px', margin: '3rem auto' }}>
        <CuriousEmpty
          title="Moderator Access Required"
          description="The review queue is only available to members of the community review team."
          flourishText="Peer Review"
          actionButton={
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              <Link to="/apply-moderator" className="btn btn-primary">
                Apply to Moderate
              </Link>
              <Link to="/mod-login" className="btn btn-secondary">
                Moderator Sign In
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const handleApprove = async (id: number) => {
    const updated = await apiFetch<QueuedPost>(`/moderation/queue/${id}/approve/`, { method: 'POST' });
    if (updated) {
      setActionMessage('Paper approved and published to the community repository');
      setQueue(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleReject = async (id: number) => {
    const updated = await apiFetch<QueuedPost>(`/moderation/queue/${id}/reject/`, { method: 'POST' });
    if (updated) {
      setActionMessage('Paper returned to author with feedback');
      setQueue(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleResolveReport = async (id: number) => {
    const resolved = await apiFetch<Report>(`/moderation/reports/${id}/resolve/`, { method: 'POST' });
    if (resolved) {
      setActionMessage('Report marked resolved');
      setReports(prev => prev.filter(r => r.id !== id));
    }
  };

  return (
    <div>
      {/* Header with Boxicons */}
      <div className="flex justify-between items-center mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>
            <HighlighterText color="#00A896">Community Peer Review</HighlighterText>
          </h2>
          <p className="text-muted text-sm mt-2">
            Review community-submitted papers, resolve member reports, and maintain community standards.
          </p>
        </div>

        {/* Tab Switcher with Boxicons */}
        <div className="flex gap-2" style={{ background: 'var(--color-paper-card)', padding: '0.3rem', borderRadius: '4px 0px 4px 4px', border: '1.5px solid var(--color-line)' }}>
          <button
            className={`btn ${activeTab === 'QUEUE' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 1rem', fontSize: '0.8125rem' }}
            onClick={() => setActiveTab('QUEUE')}
          >
            <i className="bx bx-file" style={{ fontSize: '1rem' }}></i>
            <span>Review Queue {activeTab === 'QUEUE' && queue.length > 0 ? `(${queue.length})` : ''}</span>
          </button>
          <button
            className={`btn ${activeTab === 'REPORTS' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 1rem', fontSize: '0.8125rem' }}
            onClick={() => setActiveTab('REPORTS')}
          >
            <i className="bx bx-shield" style={{ fontSize: '1rem' }}></i>
            <span>Member Reports {activeTab === 'REPORTS' && reports.length > 0 ? `(${reports.length})` : ''}</span>
          </button>
          <button
            className={`btn ${activeTab === 'OVERVIEW' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 1rem', fontSize: '0.8125rem' }}
            onClick={() => setActiveTab('OVERVIEW')}
          >
            <i className="bx bx-bar-chart-alt-2" style={{ fontSize: '1rem' }}></i>
            <span>Notebook Overview</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="alert alert-info mb-6">
          <span className="flex items-center gap-1.5">
            <i className="bx bx-check-circle" style={{ fontSize: '1.1rem' }}></i>
            {actionMessage}
          </span>
        </div>
      )}

      {loading ? (
        <CuriousLoading message="Fetching peer review queue..." />
      ) : activeTab === 'QUEUE' ? (
        queue.length === 0 ? (
          <CuriousEmpty
            title="Review Queue is Clean"
            description="There are currently no pending paper submissions waiting for review."
            flourishText="Peer Review Queue"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {queue.map(post => (
              <CommentCornerCard key={post.id} commentPreview="Reviewer checklist: Verify open license & plain abstract">
                <div className="flex justify-between items-start" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <div className="flex items-center gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
                      <span className="badge-tag badge-mustard">
                        {post.academic_level.replace('_', ' ').replace(/^./, c => c.toUpperCase())}
                      </span>
                      <span className="badge-tag badge-teal">
                        Author: @{post.author.username}
                      </span>
                      <span className="badge-tag badge-coral">
                        {post.subject.replace(/^./, c => c.toUpperCase())}
                      </span>
                    </div>

                    <h3 className="mb-2" style={{ fontSize: '1.2rem' }}>{post.title}</h3>
                    <p className="text-muted text-sm mb-4">{post.body}</p>

                    <div className="flex items-center gap-3">
                      {post.attachment_url && (
                        <a
                          href={post.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                        >
                          <i className="bx bx-file-pdf" style={{ fontSize: '0.95rem' }}></i>
                          <span>Inspect PDF Document</span>
                        </a>
                      )}
                      <Link
                        to={`/post/${post.id}`}
                        className="btn btn-secondary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                      >
                        <i className="bx bx-show" style={{ fontSize: '0.95rem' }}></i>
                        <span>Open in Context</span>
                      </Link>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReject(post.id)}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 0.95rem', fontSize: '0.8125rem', borderColor: 'var(--color-coral)' }}
                    >
                      <i className="bx bx-x" style={{ fontSize: '1.1rem', color: 'var(--color-coral)' }}></i>
                      <span>Return to Author</span>
                    </button>
                    <button
                      onClick={() => handleApprove(post.id)}
                      className="btn btn-primary"
                      style={{ padding: '0.5rem 0.95rem', fontSize: '0.8125rem' }}
                    >
                      <i className="bx bx-check" style={{ fontSize: '1.1rem' }}></i>
                      <span>Publish Paper</span>
                    </button>
                  </div>
                </div>
              </CommentCornerCard>
            ))}
          </div>
        )
      ) : activeTab === 'REPORTS' ? (
        reports.length === 0 ? (
          <CuriousEmpty
            title="No Open Member Reports"
            description="All study rooms and co-author discussions are running safely."
            flourishText="Safety & Integrity"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {reports.map(report => (
              <CommentCornerCard key={report.id}>
                <div className="flex justify-between items-center mb-2" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span className="badge-tag badge-coral">
                    <i className="bx bx-flag" style={{ fontSize: '0.85rem' }}></i>{' '}
                    Reported by @{report.reporter.username}
                  </span>
                  <span className="text-xs text-muted">
                    {new Date(report.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="font-semibold text-sm mb-1">{report.reason}</p>
                <div
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: 'var(--color-paper)',
                    border: '1.5px solid var(--color-line)',
                    borderRadius: '4px 0px 4px 4px',
                    fontSize: '0.8125rem',
                    marginBottom: '0.75rem',
                  }}
                >
                  <strong>{report.post_title}</strong> by @{report.post_author}
                </div>
                <div className="flex justify-end gap-2">
                  <Link
                    to={`/post/${report.post_id}`}
                    className="btn btn-secondary"
                    style={{ padding: '0.4rem 0.85rem', fontSize: '0.75rem' }}
                  >
                    <i className="bx bx-show" style={{ fontSize: '0.95rem' }}></i>
                    <span>Inspect Post</span>
                  </Link>
                  <button
                    onClick={() => handleResolveReport(report.id)}
                    className="btn btn-primary"
                    style={{ padding: '0.4rem 0.85rem', fontSize: '0.75rem' }}
                  >
                    <i className="bx bx-check-shield" style={{ fontSize: '0.95rem' }}></i>
                    <span>Mark Resolved</span>
                  </button>
                </div>
              </CommentCornerCard>
            ))}
          </div>
        )
      ) : (
        <CommentCornerCard style={{ padding: '2rem' }}>
          <h3 className="mb-2" style={{ fontSize: '1.25rem' }}>Notebook Health & Guidelines</h3>
          <p className="text-muted text-sm mb-4">
            Curious Bright enforces open access, non-discriminatory collaboration, and plain-language communication across all shared spaces.
          </p>
          <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
            <div style={{ flex: 1, padding: '1rem', background: 'var(--color-paper)', border: '1.5px solid var(--color-line)', borderRadius: '4px 0px 4px 4px' }}>
              <h4 className="mb-1 text-sm font-semibold flex items-center gap-1">
                <i className="bx bx-check-shield" style={{ fontSize: '1rem', color: 'var(--color-teal)' }}></i>
                Plain Language Standard
              </h4>
              <p className="text-xs text-muted">No obscure technical jargon. Keep descriptions accessible to all learning levels.</p>
            </div>
            <div style={{ flex: 1, padding: '1rem', background: 'var(--color-paper)', border: '1.5px solid var(--color-line)', borderRadius: '4px 0px 4px 4px' }}>
              <h4 className="mb-1 text-sm font-semibold flex items-center gap-1">
                <i className="bx bx-user-check" style={{ fontSize: '1rem', color: 'var(--color-coral)' }}></i>
                Collaborator Respect
              </h4>
              <p className="text-xs text-muted">Zero status dots or competitive metrics. Everyone participates on equal standing.</p>
            </div>
          </div>
        </CommentCornerCard>
      )}
    </div>
  );
}
