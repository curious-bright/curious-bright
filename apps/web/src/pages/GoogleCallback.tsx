import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { completeGoogleSignIn } from '../lib/googleOAuth';
import { ApiError } from '../lib/api';
import { showError } from '../lib/errorBus';
import { CuriousLoading } from '../components/CuriousStates';

export default function GoogleCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setGoogleSession } = useAuth();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return; // StrictMode double-invoke: code and verifier are single-use
    ranRef.current = true;
    void (async () => {
      let returnTo = '/feed';
      try {
        const result = await completeGoogleSignIn({
          code: params.get('code'),
          state: params.get('state'),
          error: params.get('error'),
        });
        returnTo = result.returnTo;
        if (!result.ok) {
          showError(result.reason);
        } else {
          await setGoogleSession(result.data);
          navigate(returnTo, { replace: true });
          return;
        }
      } catch (err) {
        showError(err instanceof ApiError ? err.message : 'Google sign-in failed. Please try again.');
      }
      navigate(`/login?next=${encodeURIComponent(returnTo)}`, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ maxWidth: '440px', margin: '3rem auto' }}>
      <CuriousLoading message="Finishing your Google sign-in…" />
      <div className="text-center mt-4" style={{ fontSize: '0.8125rem' }}>
        <Link to="/login" style={{ color: 'var(--color-faded-ink)', fontWeight: 600 }}>
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
