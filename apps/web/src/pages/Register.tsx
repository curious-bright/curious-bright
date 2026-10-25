import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { ApiError } from '../lib/api';
import { showError, showSuccess } from '../lib/errorBus';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { HighlighterText } from '../components/HighlighterText';
import iconMark from '../assets/icon-mark.svg';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) return;
    if (!acceptTerms || !acceptPrivacy) {
      showError('Please accept the Terms of Use and Privacy Policy to create your account.');
      return;
    }
    setLoading(true);
    try {
      const result = await register(
        username.trim(),
        email.trim(),
        password,
        acceptTerms,
        acceptPrivacy,
      );
      try {
        sessionStorage.setItem('cb.pending_email', result.email);
      } catch {
        // Storage can be unavailable; the email is also in the URL.
      }
      navigate(
        `/verify-email?email=${encodeURIComponent(result.email)}&cooldown=${result.resend_after}`,
      );
      if (result.email_sent === false) {
        showError(
          'Your account was created, but the verification email could not be sent. Use Resend code to try again.',
        );
      } else {
        showSuccess(`We sent a 6-digit code to ${result.email}. It expires in 10 minutes.`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_unverified') {
        navigate(`/verify-email?email=${encodeURIComponent(email.trim())}`);
      } else {
        showError(err instanceof ApiError ? err.message : 'Could not create your account.');
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

          <div className="policy-consent">
            <label className="policy-consent-row">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={e => setAcceptTerms(e.target.checked)}
                required
              />
              <span>
                I agree to the{' '}
                <Link to="/terms" target="_blank" rel="noopener noreferrer">
                  Terms of Use
                </Link>
                .
              </span>
            </label>
            <label className="policy-consent-row">
              <input
                type="checkbox"
                checked={acceptPrivacy}
                onChange={e => setAcceptPrivacy(e.target.checked)}
                required
              />
              <span>
                I have read and accept the{' '}
                <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
            <p className="policy-consent-note">
              We record the policy version and time of acceptance. To withdraw consent, email{' '}
              <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a>;
              withdrawing may mean closing your account.
            </p>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full mt-2"
            disabled={loading || !username.trim() || !email.trim() || !password || !acceptTerms || !acceptPrivacy}
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
          <div className="mt-2">
            <Link to="/verify-email" style={{ color: 'var(--color-faded-ink)', fontWeight: 600 }}>
              Already registered but not verified?
            </Link>
          </div>
        </div>
      </CommentCornerCard>
    </div>
  );
}
