import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { ApiError, apiFetchStrict } from '../lib/api';
import { showError, showSuccess } from '../lib/errorBus';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { HighlighterText } from '../components/HighlighterText';
import iconMark from '../assets/icon-mark.svg';

const CODE_LENGTH = 6;
const EMPTY_CODE = Array<string>(CODE_LENGTH).fill('');

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { verifyEmail } = useAuth();

  const initialEmail = useMemo(() => {
    const fromUrl = (searchParams.get('email') || '').trim();
    if (fromUrl) return fromUrl;
    try {
      return (sessionStorage.getItem('cb.pending_email') || '').trim();
    } catch {
      return '';
    }
  }, [searchParams]);

  const initialCooldown = useMemo(() => {
    const raw = Number.parseInt(searchParams.get('cooldown') || '0', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }, [searchParams]);

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState<string[]>(EMPTY_CODE);
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [changing, setChanging] = useState(false);
  const [showChange, setShowChange] = useState(false);
  const [password, setPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const focusBox = (index: number) => {
    window.setTimeout(() => boxRefs.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))]?.focus(), 0);
  };

  const fillCode = (digits: string, startAt = 0) => {
    const clean = digitsOnly(digits).slice(0, CODE_LENGTH);
    if (!clean) return;
    setCode(previous => {
      const next = [...previous];
      for (let offset = 0; offset < clean.length; offset += 1) {
        const index = startAt + offset;
        if (index < CODE_LENGTH) next[index] = clean[offset];
      }
      return next;
    });
    focusBox(Math.min(CODE_LENGTH - 1, startAt + clean.length));
  };

  const handleChange = (index: number, value: string) => {
    const digits = digitsOnly(value);
    if (digits.length > 1) {
      fillCode(digits, index);
      return;
    }
    setCode(previous => {
      const next = [...previous];
      next[index] = digits.slice(-1);
      return next;
    });
    if (digits) focusBox(index + 1);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      event.preventDefault();
      setCode(previous => {
        const next = [...previous];
        next[index - 1] = '';
        return next;
      });
      focusBox(index - 1);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusBox(index - 1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusBox(index + 1);
    }
  };

  const handlePaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = digitsOnly(event.clipboardData.getData('text'));
    if (!pasted) return;
    event.preventDefault();
    fillCode(pasted, index);
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanEmail = email.trim();
    const entered = code.join('');
    if (!cleanEmail || entered.length !== CODE_LENGTH) {
      showError(!cleanEmail ? 'Enter the email address you registered with.' : 'Enter all six digits.');
      return;
    }
    setLoading(true);
    try {
      const me = await verifyEmail(cleanEmail, entered);
      try {
        sessionStorage.removeItem('cb.pending_email');
      } catch {
        // ignore storage failures
      }
      showSuccess('Email verified. Welcome to CuriousBright!');
      navigate(me.must_change_password ? '/settings?change-password=1' : '/feed', { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'We could not verify that code.';
      showError(message);
      setCode(EMPTY_CODE);
      focusBox(0);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || cooldown > 0 || resending) return;
    setResending(true);
    try {
      const result = await apiFetchStrict<{ resend_after: number; email_sent: boolean | null }>(
        '/auth/resend-code/',
        { method: 'POST', body: JSON.stringify({ email: cleanEmail }) },
      );
      setCooldown(result.resend_after || 60);
      setCode(EMPTY_CODE);
      focusBox(0);
      if (result.email_sent === false) {
        showError('We could not send the email. Please try again in a moment.');
      } else {
        showSuccess('A new code is on its way.');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'resend_cooldown') setCooldown(60);
        showError(err.message);
      } else {
        showError('We could not resend the code. Please try again.');
      }
    } finally {
      setResending(false);
    }
  };

  const handleChangeEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanEmail = email.trim();
    const nextEmail = newEmail.trim();
    if (!cleanEmail || !nextEmail || !password) {
      showError('Enter your current password and the corrected email address.');
      return;
    }
    setChanging(true);
    try {
      const result = await apiFetchStrict<{
        email: string;
        resend_after: number;
        email_sent: boolean | null;
      }>('/auth/change-email/', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, password, new_email: nextEmail }),
      });
      setEmail(result.email);
      try {
        sessionStorage.setItem('cb.pending_email', result.email);
      } catch {
        // ignore storage failures
      }
      setNewEmail('');
      setPassword('');
      setShowChange(false);
      setCode(EMPTY_CODE);
      setCooldown(result.resend_after || 60);
      focusBox(0);
      if (result.email_sent === false) {
        showError('Your email was updated, but the code could not be sent. Use Resend code.');
      } else {
        showSuccess(`Email updated. We sent a new code to ${result.email}.`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'email_delivery_failed') {
          // The backend updates the address before attempting delivery.
          setEmail(nextEmail);
          setNewEmail('');
          setPassword('');
          setShowChange(false);
          setCooldown(60);
        }
        showError(err.message);
      } else {
        showError('We could not update your email. Please try again.');
      }
    } finally {
      setChanging(false);
    }
  };

  return (
    <div style={{ maxWidth: '500px', margin: '3rem auto' }}>
      <div className="text-center mb-6">
        <img
          src={iconMark}
          alt="Curious Bright"
          style={{ width: 56, height: 56, margin: '0 auto 1rem', display: 'block' }}
        />
        <h2>
          <HighlighterText color="#F4B43D">Check your inbox</HighlighterText>
        </h2>
        <p className="text-muted text-sm mt-2">
          {email
            ? `Enter the 6-digit code we sent to ${email}.`
            : 'Enter your email address and the 6-digit code we sent you.'}
        </p>
      </div>

      <CommentCornerCard commentPreview="Codes expire after 10 minutes and can only be used once">
        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Email
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.6rem' }}>
              Verification code
            </label>
            <div className="code-grid" role="group" aria-label="Six digit verification code">
              {code.map((digit, index) => (
                <input
                  key={index}
                  ref={element => {
                    boxRefs.current[index] = element;
                  }}
                  className="code-box"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  value={digit}
                  onChange={event => handleChange(index, event.target.value)}
                  onKeyDown={event => handleKeyDown(index, event)}
                  onPaste={event => handlePaste(index, event)}
                  aria-label={`Digit ${index + 1}`}
                  required
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full mt-1"
            disabled={loading || code.join('').length !== CODE_LENGTH || !email.trim()}
            style={{ padding: '0.65rem', fontSize: '0.875rem' }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '1rem' }}></i>
                Verifying...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span>Verify email</span>
                <i className="bx bx-right-arrow-alt" style={{ fontSize: '1.1rem' }}></i>
              </span>
            )}
          </button>

          <div className="flex items-center justify-between gap-3" style={{ fontSize: '0.8rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleResend}
              disabled={cooldown > 0 || resending || !email.trim()}
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
            >
              {resending ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowChange(value => !value);
                setNewEmail('');
                setPassword('');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-faded-ink)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {showChange ? 'Cancel' : 'Change email'}
            </button>
          </div>

          {showChange ? (
            <div
              className="flex flex-col gap-3"
              style={{
                borderTop: '1.5px solid var(--color-line)',
                paddingTop: '1rem',
                marginTop: '0.25rem',
              }}
            >
              <p className="text-muted text-sm" style={{ margin: 0 }}>
                Correct a typo or use a different address. We&apos;ll send a fresh code and
                deactivate the old one.
              </p>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Current password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Confirm with your password"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  New email address
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="corrected@example.com"
                />
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleChangeEmail}
                disabled={changing || !password || !newEmail.trim()}
                style={{ padding: '0.55rem 0.75rem', fontSize: '0.8rem' }}
              >
                {changing ? 'Updating...' : 'Update email and send code'}
              </button>
            </div>
          ) : null}
        </form>

        <div className="text-center mt-4 pt-3" style={{ borderTop: '1.5px solid var(--color-line)', fontSize: '0.8125rem' }}>
          <Link to="/login" style={{ color: 'var(--color-ink)', fontWeight: 600 }}>
            Back to sign in
          </Link>
        </div>
      </CommentCornerCard>
    </div>
  );
}
