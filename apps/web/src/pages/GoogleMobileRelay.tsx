import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * OAuth relay for the native app. Google only accepts https redirect URIs, so
 * the browser lands here and we hand the authorization code back to the app
 * through its custom scheme (the deep link itself is not checked by Google).
 */
const APP_SCHEME = 'curiousbright';

export default function GoogleMobileRelay() {
  const [params] = useSearchParams();

  useEffect(() => {
    const forward = new URLSearchParams();
    for (const key of ['code', 'state', 'error', 'error_description']) {
      const value = params.get(key);
      if (value) forward.set(key, value);
    }
    window.location.href = `${APP_SCHEME}://auth/google?${forward.toString()}`;
  }, [params]);

  return (
    <div style={{ maxWidth: 480, margin: '18vh auto', textAlign: 'center', padding: '0 1rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>Returning to Curious Bright…</h2>
      <p style={{ opacity: 0.7 }}>
        Finish sign-in in the Curious Bright app. If it did not open, switch to it manually —
        this page is only a redirect relay.
      </p>
    </div>
  );
}
