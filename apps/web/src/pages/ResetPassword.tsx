import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, apiFetchStrict } from '../lib/api';
import { showError, showSuccess } from '../lib/errorBus';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { HighlighterText } from '../components/HighlighterText';
import iconMark from '../assets/icon-mark.svg';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid') || '';
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(!uid || !token);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      showError('Use a password of at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      showError('The passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await apiFetchStrict('/auth/password-reset/confirm/', {
        method: 'POST',
        body: JSON.stringify({ uid, token, new_password: password }),
      });
      setDone(true);
      setPassword('');
      setConfirmPassword('');
      showSuccess('Your password was reset. You can sign in with the new password.');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'invalid_reset_token' || err.code === 'reset_token_expired') {
          setInvalid(true);
        }
        showError(err.message);
      } else {
        showError('We could not reset your password. Please request a new link.');
      }
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
          <HighlighterText color="#FF5A36">Choose a new password</HighlighterText>
        </h2>
        <p className="text-muted text-sm mt-2">Make it strong and different from your last one.</p>
      </div>

      <CommentCornerCard commentPreview="This link expires after 30 minutes and works once">
        {invalid ? (
          <div className="flex flex-col gap-4">
            <div className="alert alert-error" role="alert" style={{ margin: 0 }}>
              <i className="bx bx-error-circle" style={{ marginRight: '0.4rem' }}></i>
              This reset link is invalid or has expired. Request a new one to continue.
            </div>
            <Link to="/forgot-password" className="btn btn-primary w-full" style={{ textAlign: 'center' }}>
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <div className="flex flex-col gap-4">
            <div className="alert alert-success" role="status" style={{ margin: 0 }}>
              <i className="bx bx-check-circle" style={{ marginRight: '0.4rem' }}></i>
              Your password has been reset. Sign in with your new password.
            </div>
            <Link to="/login" className="btn btn-primary w-full" style={{ textAlign: 'center' }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                New password
              </label>
              <input
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Confirm new password
              </label>
              <input
                type="password"
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary w-full mt-2"
              disabled={loading || !password || !confirmPassword}
              style={{ padding: '0.65rem', fontSize: '0.875rem' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '1rem' }}></i>
                  Updating...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>Set new password</span>
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
