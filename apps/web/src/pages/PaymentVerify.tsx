import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../state/AuthContext';

interface PaymentResult {
  reference: string;
  status: 'pending' | 'success' | 'failed' | 'abandoned';
  organization_name?: string;
  plan_code?: string;
}

export default function PaymentVerify() {
  const [searchParams] = useSearchParams();
  const { isAuthenticated, loading } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'pending' | 'failed'>('loading');
  const [payment, setPayment] = useState<PaymentResult | null>(null);

  const reference = searchParams.get('reference') || searchParams.get('trxref');

  useEffect(() => {
    if (loading) return;
    if (!reference) {
      setStatus('failed');
      return;
    }
    if (!isAuthenticated) {
      setStatus('failed');
      return;
    }

    let alive = true;
    apiFetch<PaymentResult>(`/billing/payments/${encodeURIComponent(reference)}/verify/`, {
      method: 'POST',
    }).then(result => {
      if (!alive) return;
      if (!result) {
        setStatus('failed');
        return;
      }
      setPayment(result);
      if (result.status === 'success') setStatus('success');
      else if (result.status === 'pending') setStatus('pending');
      else setStatus('failed');
    });
    return () => {
      alive = false;
    };
  }, [reference, isAuthenticated, loading]);

  return (
    <div className="page-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', textAlign: 'center' }}>
      <div className="glass-card" style={{ maxWidth: 460, width: '100%', padding: '2.5rem 2rem' }}>
        {status === 'loading' && (
          <>
            <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '3rem', color: 'var(--color-coral)' }}></i>
            <h2 style={{ marginTop: '1rem' }}>Confirming your payment…</h2>
            <p style={{ color: 'var(--text-muted)' }}>Please keep this page open.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <i className="bx bxs-check-circle" style={{ fontSize: '3rem', color: 'var(--color-teal)' }}></i>
            <h2 style={{ marginTop: '1rem', color: 'var(--color-teal)' }}>Payment confirmed</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              {payment?.organization_name || 'Your organization'} is now on the{' '}
              <strong>{payment?.plan_code || 'paid'}</strong> plan.
            </p>
            <div className="flex justify-center gap-2" style={{ flexWrap: 'wrap' }}>
              <Link to="/pricing" className="btn btn-primary">View plans</Link>
              <Link to="/feed" className="btn btn-secondary">Back to feed</Link>
            </div>
          </>
        )}

        {status === 'pending' && (
          <>
            <i className="bx bx-time-five" style={{ fontSize: '3rem', color: 'var(--color-mustard)' }}></i>
            <h2 style={{ marginTop: '1rem' }}>Payment still pending</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Paystack has not confirmed this transaction yet. It usually clears within a minute.
              Refresh this page to check again.
            </p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Check again
            </button>
          </>
        )}

        {status === 'failed' && (
          <>
            <i className="bx bxs-x-circle" style={{ fontSize: '3rem', color: 'var(--color-coral)' }}></i>
            <h2 style={{ marginTop: '1rem', color: 'var(--color-coral)' }}>Payment not confirmed</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              {!reference
                ? 'No payment reference was provided.'
                : !isAuthenticated
                  ? 'Sign in with the account that started this payment, then reopen the link.'
                  : 'The transaction was not successful. Nothing has been charged to your plan.'}
            </p>
            <div className="flex justify-center gap-2" style={{ flexWrap: 'wrap' }}>
              {!isAuthenticated && <Link to="/login" className="btn btn-primary">Sign in</Link>}
              <Link to="/pricing" className="btn btn-secondary">Back to plans</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
