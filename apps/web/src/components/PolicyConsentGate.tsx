import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { showError } from '../lib/errorBus';

/**
 * Blocks the product until the signed-in member accepts the current versions
 * of the Terms and Privacy Policy. Legal pages remain readable while the gate
 * is active so nobody is forced to agree to a document they cannot inspect.
 */
export default function PolicyConsentGate() {
  const { user, acceptPolicies } = useAuth();
  const location = useLocation();
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user || !user.consent) return null;
  const accepted = user.consent.terms.accepted && user.consent.privacy.accepted;
  if (accepted) return null;
  if (location.pathname === '/privacy' || location.pathname === '/terms') return null;

  const submit = async () => {
    if (!terms || !privacy || saving) return;
    setSaving(true);
    try {
      await acceptPolicies(terms, privacy);
    } catch {
      showError('We could not save your policy choices. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="policy-gate-backdrop" role="presentation">
      <section
        className="policy-gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="policy-gate-title"
      >
        <span className="policy-badge">
          <i className="bx bx-shield-quarter" />
          <span>POLICIES UPDATED</span>
        </span>
        <h2 id="policy-gate-title">A quick check before you continue</h2>
        <p className="text-sm text-muted">
          We updated our Terms of Use and Privacy Policy on{' '}
          <strong>{user.consent.last_updated}</strong>. Please read and accept both current
          versions to keep using Curious Bright.
        </p>

        <div className="policy-gate-versions">
          <div>
            <strong>Terms of Use</strong>
            <span>Version {user.consent.terms.version}</span>
          </div>
          <div>
            <strong>Privacy Policy</strong>
            <span>Version {user.consent.privacy.version}</span>
          </div>
        </div>

        <label className="policy-gate-check">
          <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} />
          <span>
            I have read and agree to the{' '}
            <Link to="/terms" target="_blank" rel="noopener noreferrer">
              Terms of Use
            </Link>
            .
          </span>
        </label>
        <label className="policy-gate-check">
          <input
            type="checkbox"
            checked={privacy}
            onChange={(event) => setPrivacy(event.target.checked)}
          />
          <span>
            I have read and accept the{' '}
            <Link to="/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={!terms || !privacy || saving}
          onClick={() => void submit()}
        >
          {saving ? 'Saving…' : 'Accept and continue'}
        </button>
        <p className="policy-gate-note">
          You can ask us to delete your account at any time from Account Settings. To withdraw
          consent, email{' '}
          <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a>;
          withdrawing may mean closing your account.
        </p>
      </section>
    </div>
  );
}
