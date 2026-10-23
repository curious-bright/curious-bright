import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, apiVoid } from '../lib/api';
import { track } from '../lib/analytics';
import { useAuth } from '../state/AuthContext';

interface OrganizationResult {
  id: number;
  name: string;
  slug: string;
  org_type: string;
  domain: string;
  logo_url: string | null;
  member_count: number;
  verification_status: string;
  allow_join_requests: boolean;
  my_membership_role: string | null;
  my_join_request_status: string | null;
}

interface JoinRequest {
  id: number;
  organization: OrganizationResult;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  message: string;
  decision_note: string;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  university: 'University',
  research_institute: 'Research institute',
  ngo: 'NGO',
  school: 'School',
  other: 'Organization',
};

export default function JoinOrganization() {
  const { isAuthenticated } = useAuth();
  const [query, setQuery] = useState('');
  const [organizations, setOrganizations] = useState<OrganizationResult[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [selected, setSelected] = useState<OrganizationResult | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!isAuthenticated) {
      setRequests([]);
      return;
    }
    const data = await apiFetch<JoinRequest[]>('/organizations/join-requests/me/');
    setRequests(Array.isArray(data) ? data : []);
  }, [isAuthenticated]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (!isAuthenticated) {
      setOrganizations([]);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void apiFetch<OrganizationResult[]>(
        `/organizations/search/${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`,
      ).then((data) => {
        if (!alive) return;
        setOrganizations(Array.isArray(data) ? data : []);
        setLoading(false);
      });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, isAuthenticated]);

  const requestJoin = async () => {
    if (!selected) return;
    setSubmitting(true);
    const created = await apiFetch<JoinRequest>(
      `/organizations/${selected.slug}/join-requests/`,
      { method: 'POST', body: JSON.stringify({ message }) },
    );
    setSubmitting(false);
    if (!created) return;
    setSelected(null);
    setMessage('');
    track('organization_join_requested');
    setOrganizations((rows) =>
      rows.map((row) =>
        row.slug === selected.slug ? { ...row, my_join_request_status: 'pending' } : row,
      ),
    );
    await loadRequests();
  };

  const withdraw = async (request: JoinRequest) => {
    const ok = await apiVoid(`/organizations/join-requests/${request.id}/withdraw/`, { method: 'POST' });
    if (!ok) return;
    await loadRequests();
    setOrganizations((rows) =>
      rows.map((row) =>
        row.slug === request.organization.slug ? { ...row, my_join_request_status: 'withdrawn' } : row,
      ),
    );
  };

  const actionFor = (org: OrganizationResult) => {
    if (org.my_membership_role) return <span className="badge-tag badge-teal">Member</span>;
    if (org.my_join_request_status === 'pending') {
      return <span className="badge-tag badge-mustard">Request pending</span>;
    }
    if (!org.allow_join_requests) {
      return <span className="badge-tag">Not accepting requests</span>;
    }
    return (
      <button className="btn btn-primary" type="button" onClick={() => setSelected(org)}>
        Request to join
      </button>
    );
  };

  return (
    <div className="join-org-page">
      <header className="join-org-head">
        <div>
          <span className="eyebrow">Verified institutions</span>
          <h1>Join your organization</h1>
          <p>
            Find a verified university, NGO or research institute. An administrator will review your
            request and you will be notified when they decide.
          </p>
        </div>
        <Link to="/settings" className="btn btn-secondary">
          <i className="bx bx-cog"></i> Membership settings
        </Link>
      </header>

      {!isAuthenticated ? (
        <section className="glass-card join-org-signin">
          <i className="bx bx-lock-alt"></i>
          <h2>Sign in to request membership</h2>
          <p>Only signed-in members can request to join an institution.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </section>
      ) : (
        <>
          <div className="join-org-search">
            <i className="bx bx-search"></i>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by institution name or email domain"
              aria-label="Search verified organizations"
            />
            {loading && <span className="join-org-searching">Searching…</span>}
          </div>

          <section className="join-org-results">
            {organizations.length === 0 && !loading ? (
              <div className="glass-card join-org-empty">
                <i className="bx bx-buildings"></i>
                <h2>No verified organization found</h2>
                <p>
                  Ask your institution’s administrator to complete verification in the{' '}
                  <a href="https://org.curiousbright.com.ng" target="_blank" rel="noreferrer">
                    institutional portal
                  </a>
                  . Only verified organizations appear here.
                </p>
              </div>
            ) : (
              organizations.map((org) => (
                <article className="glass-card join-org-card" key={org.id}>
                  <div className="join-org-logo">
                    {org.logo_url ? (
                      <img src={org.logo_url} alt="" />
                    ) : (
                      <span>{org.name[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="join-org-copy">
                    <div className="join-org-title-row">
                      <h2>{org.name}</h2>
                      <span className="badge-tag badge-teal"><i className="bx bx-check-shield"></i> Verified</span>
                    </div>
                    <p>
                      {TYPE_LABELS[org.org_type] || 'Organization'}
                      {org.domain ? ` · @${org.domain}` : ''} · {org.member_count} members
                    </p>
                    {org.my_join_request_status === 'rejected' && (
                      <small className="join-org-note">Your previous request was declined. You can ask again if your affiliation changes.</small>
                    )}
                  </div>
                  <div className="join-org-action">{actionFor(org)}</div>
                </article>
              ))
            )}
          </section>

          <section className="join-org-requests">
            <div className="join-org-section-head">
              <h2>Your requests</h2>
              <span>{requests.length} total</span>
            </div>
            {requests.length === 0 ? (
              <p className="rail-muted">You have not requested to join an organization yet.</p>
            ) : (
              requests.map((request) => (
                <div className="join-org-request-row" key={request.id}>
                  <div>
                    <strong>{request.organization.name}</strong>
                    <small>
                      {new Date(request.created_at).toLocaleDateString()} ·{' '}
                      <span className={`status-dot status-${request.status}`}>{request.status}</span>
                    </small>
                    {request.decision_note && <p>{request.decision_note}</p>}
                  </div>
                  {request.status === 'pending' && (
                    <button className="btn btn-secondary" type="button" onClick={() => void withdraw(request)}>
                      Withdraw
                    </button>
                  )}
                </div>
              ))
            )}
          </section>
        </>
      )}

      {selected && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="join-org-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">Membership request</span>
                <h2 id="join-org-title">{selected.name}</h2>
              </div>
              <button className="btn btn-secondary" type="button" onClick={() => setSelected(null)} aria-label="Close">
                <i className="bx bx-x"></i>
              </button>
            </div>
            <p>
              Tell the administrator how you are connected to {selected.name}. Do not share passwords
              or private documents here.
            </p>
            <label className="field-label" htmlFor="join-message">Message (optional)</label>
            <textarea
              id="join-message"
              rows={4}
              maxLength={1000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="I am a second-year student in the Department of Physics…"
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setSelected(null)}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={() => void requestJoin()} disabled={submitting}>
                {submitting ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
