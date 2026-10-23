import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetchStrict } from '../lib/api';
import { showError, showSuccess } from '../lib/errorBus';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { HighlighterText } from '../components/HighlighterText';
import iconMark from '../assets/icon-mark.svg';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await apiFetchStrict('/auth/password-reset/', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
      showSuccess('If an account exists for that email, a reset link is on its way.');
    } catch (err) {
      showError(
        err instanceof ApiError
          ? err.message
          : 'We could not process that request. Please try again.',
      );
    } finally {
      setLoading(false);
    }
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
          <HighlighterText color="#00A896">Forgot your password?</HighlighterText>
        </h2>
        <p className="text-muted text-sm mt-2">
          Enter your account email and we&apos;ll send you a secure reset link.
        </p>
      </div>

      <CommentCornerCard commentPreview="Reset links expire after 30 minutes and work once">
        {sent ? (
          <div className="flex flex-col gap-4">
            <div className="alert alert-success" role="status" style={{ margin: 0 }}>
              <i className="bx bx-check-circle" style={{ marginRight: '0.4rem' }}></i>
              If an account exists for <strong>{email.trim()}</strong>, we&apos;ve sent a password
              reset link. Check your inbox and spam folder.
            </div>
            <button
              type="button"
              className="btn btn-secondary w-full"
              onClick={() => {
                setSent(false);
                setEmail('');
              }}
            >
              Send to a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Email address
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary w-full mt-2"
              disabled={loading || !email.trim()}
              style={{ padding: '0.65rem', fontSize: '0.875rem' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '1rem' }}></i>
                  Sending...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>Send reset link</span>
                  <i className="bx bx-right-arrow-alt" style={{ fontSize: '1.1rem' }}></i>
                </span>
              )}
            </button>
          </form>
        )}

        <div className="text-center mt-4 pt-3" style={{ borderTop: '1.5px solid var(--color-line)', fontSize: '0.8125rem' }}>
          <Link to="/login" style={{ color: 'var(--color-ink)', fontWeight: 600 }}>
            Back to sign in
          </Link>
        </div>
      </CommentCornerCard>
    </div>
  );
}
