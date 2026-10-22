import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { HighlighterText } from '../components/HighlighterText';
import iconMark from '../assets/icon-mark.svg';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Validation/server errors surface through the global alert — no local try/catch.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) return;
    setLoading(true);
    const me = await register(username.trim(), email.trim(), password);
    setLoading(false);
    if (me) navigate('/feed');
  };

  return (
    <div style={{ maxWidth: '460px', margin: '3rem auto' }}>
      <div className="text-center mb-6">
        <img
          src={iconMark}
          alt="Curious Bright"
          style={{ width: 56, height: 56, margin: '0 auto 1rem', display: 'block' }}
        />
        <h2>
          <HighlighterText color="#FF5A36">Join the Community</HighlighterText>
        </h2>
        <p className="text-muted text-sm mt-2">
          Share what you know, ask questions, and collaborate on research.
        </p>
      </div>

      <CommentCornerCard commentPreview="Your profile and badges are created automatically">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Username
            </label>
            <input
              type="text"
              placeholder="e.g. mathwhiz"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              minLength={3}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Email
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Password
            </label>
            <input
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full mt-2"
            disabled={loading || !username.trim() || !email.trim() || !password}
            style={{ padding: '0.65rem', fontSize: '0.875rem' }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '1rem' }}></i>
                Creating your account...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span>Create Account</span>
                <i className="bx bx-right-arrow-alt" style={{ fontSize: '1.1rem' }}></i>
              </span>
            )}
          </button>
        </form>

        <div className="text-center mt-4 pt-3" style={{ borderTop: '1.5px solid var(--color-line)', fontSize: '0.8125rem' }}>
          <span className="text-muted">Already a member? </span>
          <Link to="/login" style={{ color: 'var(--color-ink)', fontWeight: 600 }}>
            Sign in
          </Link>
        </div>
      </CommentCornerCard>
    </div>
  );
}
