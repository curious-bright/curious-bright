import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

export default function ApplyInstitution() {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [organization, setOrganization] = useState<{ name: string; slug: string } | null>(null);

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  })();

  if (!user) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '540px', margin: '3rem auto' }}>
        <div className="glass-card text-center">
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏛️</div>
          <h3>Account Required</h3>
          <p className="text-secondary text-sm mt-2 mb-6">
            You need to be logged in to register an institution.
          </p>
          <div className="flex justify-center gap-4">
            <Link to="/login" className="btn btn-primary">
              Log in →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const created = (await apiFetch('/organizations/', {
        method: 'POST',
        body: JSON.stringify({ name, domain: domain.trim() || null }),
      })) as { name: string; slug: string };
      setOrganization(created);
    } catch (err: any) {
      setError(err.message || 'Failed to register institution. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (organization) {
    return (
      <div style={{ maxWidth: 540, margin: '3rem auto', textAlign: 'center' }} className="animate-fade-in">
        <div className="glass-card" style={{ padding: '3rem 2rem' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1.25rem' }}>🎉</div>
          <h2 style={{ marginBottom: '0.75rem' }}>{organization.name} is ready</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '2rem' }}>
            You are the owner. Invite your teachers and students, then manage members, seats, and billing from the institutional dashboard.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href={`${(import.meta.env.VITE_ORG_URL || 'https://org.curiousbright.com.ng').replace(/\/$/, '')}/${organization.slug}`}
              className="btn btn-primary"
              target="_blank"
              rel="noreferrer"
            >
              Go to Dashboard
            </a>
            <Link to="/feed" className="btn btn-secondary">Back to Feed</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: '3rem' }} className="animate-fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to="/browse" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>← Back to Library</Link>
      </div>

      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(37,99,235,0.15))',
            border: '1px solid rgba(59,130,246,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem',
          }}>
            🏛️
          </div>
          <div>
            <h1 style={{ fontSize: '1.75rem', marginBottom: '0.2rem' }}>Register an Institution</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Create an organization to manage your students and access enterprise features.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
            <span>⚠️ {error}</span>
          </div>
        )}

        <div className="glass-card" style={{ marginBottom: '1.25rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="name">Organization Name *</label>
            <input
              id="name"
              type="text"
              placeholder="e.g. Greenfield University"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="glass-card" style={{ marginBottom: '2rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="domain">Domain (Optional)</label>
            <input
              id="domain"
              type="text"
              placeholder="e.g. greenfield.edu"
              value={domain}
              onChange={e => setDomain(e.target.value)}
            />
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.6rem' }}>
              We will use this to automatically link students from your domain if enabled.
            </p>
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ width: '100%', padding: '0.875rem', fontSize: '1rem' }}
        >
          {loading ? 'Registering...' : 'Register Institution →'}
        </button>
      </form>
    </div>
  );
}
