import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../state/AuthContext';

interface Plan {
  code: string;
  name: string;
  tagline: string;
  seats: number;
  interval: string;
  custom: boolean;
  features: string[];
  amount: number;
  amount_display: string;
  currency: string;
}

interface PlansResponse {
  currency: string;
  currencies: string[];
  plans: Plan[];
}

interface PaymentResult {
  reference: string;
  status: string;
  authorization_url: string;
}

interface OrgSummary {
  slug: string;
  name: string;
  my_role: string | null;
  plan_tier: string;
}

function seatsLabel(plan: Plan) {
  return plan.seats === 0 ? 'Unlimited members' : `Up to ${plan.seats} members`;
}

export default function Pricing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [currency, setCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [data, setData] = useState<PlansResponse | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [busyPlan, setBusyPlan] = useState('');

  useEffect(() => {
    let alive = true;
    apiFetch<PlansResponse>(`/billing/plans/?currency=${currency}`).then(result => {
      if (alive && result) setData(result);
    });
    return () => {
      alive = false;
    };
  }, [currency]);

  useEffect(() => {
    if (!isAuthenticated) {
      setOrgs([]);
      return;
    }
    let alive = true;
    apiFetch<OrgSummary[]>('/organizations/').then(result => {
      if (!alive || !result) return;
      const owned = result.filter(org => org.my_role === 'owner');
      setOrgs(owned);
      setSelectedOrg(current => current || owned[0]?.slug || '');
    });
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  const selected = useMemo(
    () => orgs.find(org => org.slug === selectedOrg) || null,
    [orgs, selectedOrg],
  );

  const startCheckout = async (plan: Plan) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!selectedOrg) {
      navigate('/apply-institution');
      return;
    }
    setBusyPlan(plan.code);
    const payment = await apiFetch<PaymentResult>('/billing/checkout/', {
      method: 'POST',
      body: JSON.stringify({ organization: selectedOrg, plan_code: plan.code, currency }),
    });
    setBusyPlan('');
    if (payment?.authorization_url) {
      window.location.href = payment.authorization_url;
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1080, margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ textAlign: 'center', margin: '1rem auto 2.5rem', maxWidth: 720 }}>
        <div className="badge-tag badge-coral" style={{ display: 'inline-block', marginBottom: '1rem' }}>
          Institutional plans
        </div>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>Knowledge infrastructure for your institution.</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: 1.7 }}>
          Give every student a seat, every teacher a classroom, and your leadership a clear view of
          how learning moves through your school. Prices are billed through Paystack.
        </p>
        <div className="flex justify-center gap-2" style={{ marginTop: '1.5rem' }}>
          {(['NGN', 'USD'] as const).map(code => (
            <button
              key={code}
              type="button"
              className={`btn ${currency === code ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.45rem 1.1rem' }}
              onClick={() => setCurrency(code)}
            >
              {code === 'NGN' ? '₦ Naira' : '$ USD'}
            </button>
          ))}
        </div>
      </div>

      {isAuthenticated && orgs.length > 0 && (
        <div className="glass-card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="pricing-org" style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
              Billing for
            </label>
            <select
              id="pricing-org"
              value={selectedOrg}
              onChange={event => setSelectedOrg(event.target.value)}
              style={{ width: '100%' }}
            >
              {orgs.map(org => (
                <option key={org.slug} value={org.slug}>
                  {org.name} — {org.plan_tier}
                </option>
              ))}
            </select>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 320 }}>
            Only organization owners can change a plan. You can register another institution at any time.
          </p>
        </div>
      )}

      {isAuthenticated && orgs.length === 0 && (
        <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
          <span>Register an institution first, then return here to choose a paid plan.</span>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.25rem',
          alignItems: 'stretch',
        }}
      >
        {(data?.plans || []).map((plan, index) => {
          const highlighted = plan.code === 'pro';
          const isCurrent = selected?.plan_tier === plan.code;
          return (
            <div
              key={plan.code}
              className="glass-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                border: highlighted ? '2px solid var(--color-coral)' : undefined,
                position: 'relative',
              }}
            >
              {highlighted && (
                <span
                  className="badge-tag badge-coral"
                  style={{ position: 'absolute', top: -11, right: 16 }}
                >
                  Most popular
                </span>
              )}
              <h3 style={{ marginBottom: '0.25rem' }}>{plan.name}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', minHeight: 44 }}>
                {plan.tagline}
              </p>
              <div style={{ margin: '1rem 0 0.25rem', display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                <span className="font-display" style={{ fontSize: '2.1rem' }}>{plan.amount_display}</span>
                {!plan.custom && plan.amount > 0 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>/ {plan.interval}</span>
                )}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                {seatsLabel(plan)} · {currency}
              </p>

              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1.5rem', flex: 1 }}>
                {plan.features.map(feature => (
                  <li key={feature} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <i className="bx bx-check" style={{ color: 'var(--color-teal)', fontSize: '1.1rem' }}></i>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {plan.custom ? (
                <a
                  className="btn btn-secondary"
                  href="mailto:sales@curiousbright.com.ng?subject=Curious%20Bright%20Enterprise"
                  style={{ justifyContent: 'center' }}
                >
                  Talk to us
                </a>
              ) : plan.amount === 0 ? (
                isCurrent ? (
                  <button className="btn btn-secondary" style={{ justifyContent: 'center' }} disabled>
                    Current plan
                  </button>
                ) : (
                  <Link to={isAuthenticated ? '/apply-institution' : '/register'} className="btn btn-secondary" style={{ justifyContent: 'center' }}>
                    {isAuthenticated ? 'Register an institution' : 'Start free'}
                  </Link>
                )
              ) : (
                <button
                  type="button"
                  className={`btn ${highlighted ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ justifyContent: 'center' }}
                  disabled={busyPlan === plan.code || isCurrent}
                  onClick={() => void startCheckout(plan)}
                >
                  {isCurrent
                    ? 'Current plan'
                    : busyPlan === plan.code
                      ? 'Starting checkout…'
                      : isAuthenticated && !selectedOrg
                        ? 'Register first'
                        : `Choose ${plan.name}`}
                </button>
              )}
              {index === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.75rem', textAlign: 'center' }}>
                  No card required
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="glass-card" style={{ marginTop: '2rem', display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div>
          <h4 style={{ marginBottom: '0.35rem' }}>Secure payments</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Card details never touch our servers. Paystack handles the transaction and sends a
            signed webhook that we verify before activating a plan.
          </p>
        </div>
        <div>
          <h4 style={{ marginBottom: '0.35rem' }}>Switch currencies</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Pay in Naira or US dollars. The amount is locked when checkout starts, so what you see
            is what you are charged.
          </p>
        </div>
        <div>
          <h4 style={{ marginBottom: '0.35rem' }}>Move at your pace</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Start on Free, grow into Pro, and talk to us when your institution needs unlimited
            seats and procurement support.
          </p>
        </div>
      </div>
    </div>
  );
}
