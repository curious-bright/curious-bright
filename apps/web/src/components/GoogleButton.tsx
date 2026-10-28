import { useState } from 'react';
import { startGoogleSignIn, isGoogleSignInEnabled } from '../lib/googleOAuth';
import { showError } from '../lib/errorBus';

const GoogleG = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.1C29.2 35.2 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.7l6.3 5.1C37 40.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
  </svg>
);

interface Props {
  label?: string;
  returnTo?: string;
}

export function GoogleButton({ label = 'Continue with Google', returnTo }: Props) {
  const [busy, setBusy] = useState(false);

  if (!isGoogleSignInEnabled()) return null;

  const handleClick = async () => {
    setBusy(true);
    try {
      const next = new URLSearchParams(window.location.search).get('next') || undefined;
      await startGoogleSignIn(returnTo || next);
    } catch {
      showError('Could not start Google sign-in. Please try again.');
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="btn w-full"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.65rem',
        fontSize: '0.875rem',
        border: '1.5px solid var(--color-line)',
        background: 'var(--color-paper, #fff)',
        cursor: busy ? 'wait' : 'pointer',
      }}
    >
      {busy ? (
        <span className="flex items-center justify-center gap-2">
          <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '1rem' }}></i>
          Opening Google...
        </span>
      ) : (
        <>
          <GoogleG />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

export default GoogleButton;
