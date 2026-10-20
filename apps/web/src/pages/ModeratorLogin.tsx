import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch, clearTokens } from '../lib/api';
import { useAuth } from '../state/AuthContext';

export default function ModeratorLogin() {
  const navigate = useNavigate();
  const { login, user, loading: authLoading, refreshMe } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Already a moderator? Skip the portal form entirely.
  useEffect(() => {
    if (!authLoading && user?.can_moderate) {
      navigate('/moderate', { replace: true });
    }
  }, [authLoading, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const ok = await login(email.trim(), password);
    if (!ok) {
      setError('Invalid credentials. Please check your email/username and password.');
      setLoading(false);
      return;
    }

    // Fetch a fresh /auth/me/ so the moderator check isn't using stale state.
    const me = await apiFetch<{ can_moderate: boolean }>('/auth/me/');
    if (!me?.can_moderate) {
      clearTokens();
      localStorage.removeItem('user');
      await refreshMe();
      setError('Access denied. This portal is for moderators only.');
      setLoading(false);
      return;
    }

    navigate('/moderate');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      {/* Decorative background orbs */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0,
      }}>
        <div style={{
          position: 'absolute', top: '15%', left: '10%', width: 320, height: 320,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '20%', right: '12%', width: 260, height: 260,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(239,68,68,0.1) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
      </div>

      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>

        {/* Shield badge */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '20px', margin: '0 auto 1rem',
            background: 'linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(220,38,38,0.1) 100%)',
            border: '1px solid rgba(239,68,68,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem',
            boxShadow: '0 0 30px rgba(239,68,68,0.15)',
          }}>
            🛡️
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.35rem', letterSpacing: '-0.03em' }}>
            Moderator Portal
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Restricted access — authorized personnel only
          </p>
        </div>

        {/* Card */}
        <div className="glass-card animate-fade-in" style={{
          border: '1px solid rgba(239,68,68,0.2)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(239,68,68,0.08)',
        }}>

          {/* Access level indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            padding: '0.65rem 1rem',
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--danger)',
              boxShadow: '0 0 6px var(--danger)',
              flexShrink: 0,
              animation: 'pulse 2s ease-in-out infinite',
            }} />
            <span style={{ fontSize: '0.8rem', color: '#fca5a5', fontWeight: 600 }}>
              MODERATOR / ADMIN ACCESS REQUIRED
            </span>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>
              <span>⚠️ {error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} id="moderator-login-form">
            <div className="form-group">
              <label htmlFor="mod-email">Email Address</label>
              <input
                id="mod-email"
                type="email"
                placeholder="moderator@curioisbright.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{ borderColor: 'rgba(239,68,68,0.2)' }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="mod-password">Password</label>
              <input
                id="mod-password"
                type="password"
                placeholder="Enter your secure password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ borderColor: 'rgba(239,68,68,0.2)' }}
              />
            </div>

            <button
              id="mod-login-submit"
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                marginTop: '1rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.9375rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 16px rgba(220,38,38,0.35)',
              }}
            >
              {loading ? (
                <>
                  <div className="spinner" style={{ width: 18, height: 18, borderTopColor: '#fff' }} />
                  Authenticating...
                </>
              ) : (
                '🔐 Access Moderator Dashboard'
              )}
            </button>
          </form>

          <div style={{
            marginTop: '1.5rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--glass-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <Link to="/login" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              ← Regular user login
            </Link>
            <Link to="/about" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              About CuriousBright
            </Link>
          </div>
        </div>

        {/* Security note */}
        <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          🔒 This session is encrypted and audited. Unauthorized access attempts are logged.
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
