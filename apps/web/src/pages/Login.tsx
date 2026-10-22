import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { HighlighterText } from '../components/HighlighterText';
import iconMark from '../assets/icon-mark.svg';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Errors surface through the global alert (lib/api -> errorBus) — no local try/catch.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setLoading(true);
    const me = await login(identifier.trim(), password);
    setLoading(false);
    if (me) navigate(me.must_change_password ? '/settings?change-password=1' : '/feed');
  };

  return (
    <div style={{ maxWidth: '440px', margin: '3rem auto' }}>
      <div className="text-center mb-6">
        <img
          src={iconMark}
          alt="Curious Bright"
          style={{ width: 56, height: 56, margin: '0 auto 1rem', display: 'block' }}
        />
        <h2>
          <HighlighterText color="#00A896">Welcome Back</HighlighterText>
        </h2>
        <p className="text-muted text-sm mt-2">
          Sign in to teach, learn and collaborate with the community.
        </p>
      </div>

      <CommentCornerCard commentPreview="Secure JWT sign-in with refresh">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Username or Email
            </label>
            <input
              type="text"
              placeholder="e.g. alex or alex@university.edu"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full mt-2"
            disabled={loading || !identifier.trim() || !password}
            style={{ padding: '0.65rem', fontSize: '0.875rem' }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '1rem' }}></i>
                Signing in...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span>Sign In</span>
                <i className="bx bx-right-arrow-alt" style={{ fontSize: '1.1rem' }}></i>
              </span>
            )}
          </button>
        </form>

        <div className="text-center mt-4 pt-3" style={{ borderTop: '1.5px solid var(--color-line)', fontSize: '0.8125rem' }}>
          <span className="text-muted">New here? </span>
          <Link to="/register" style={{ color: 'var(--color-ink)', fontWeight: 600 }}>
            Create an account
          </Link>
        </div>
      </CommentCornerCard>
    </div>
  );
}
