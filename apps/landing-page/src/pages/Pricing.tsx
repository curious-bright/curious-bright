import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  FlaskConical,
  GraduationCap,
  HeartHandshake,
  Landmark,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { track } from '../lib/analytics';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

type Currency = 'NGN' | 'USD';
type Interval = 'month' | 'year';
type PlanCode = 'ngo' | 'research_institute' | 'university';

interface ApiPlan {
  code: string;
  name: string;
  tagline: string;
  seats: number;
  storage_gb: number;
  video_minutes: number;
  amount: number;
  amount_display: string;
  currency: Currency;
  features: string[];
}

interface PlansResponse {
  currency: Currency;
  interval: Interval;
  plans: ApiPlan[];
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://127.0.0.1:8000';
const ORG_URL = (import.meta.env.VITE_ORG_URL as string | undefined) || 'https://org.curiousbright.com.ng';

const TIER_META = {
  ngo: {
    icon: HeartHandshake,
    accent: 'var(--color-coral)',
    eyebrow: 'Education non-profits',
    summary: 'For community foundations, education NGOs and non-profit learning networks.',
    cta: 'Apply as an NGO',
  },
  research_institute: {
    icon: FlaskConical,
    accent: 'var(--color-teal)',
    eyebrow: 'Labs & research centres',
    summary: 'For research laboratories, institutes and advanced academic centres.',
    cta: 'Apply as a research institute',
  },
  university: {
    icon: Landmark,
    accent: 'var(--color-mustard)',
    eyebrow: 'Higher education',
    summary: 'For universities, polytechnics and colleges with large student communities.',
    cta: 'Apply as a university',
    featured: true,
  },
} as const;

const FALLBACK_PLANS: Record<PlanCode, ApiPlan> = {
  ngo: {
    code: 'ngo',
    name: 'NGO',
    tagline: 'For education non-profits and community foundations.',
    seats: 200,
    storage_gb: 50,
    video_minutes: 3000,
    amount: 0,
    amount_display: '',
    currency: 'NGN',
    features: [
      'Up to 200 members',
      '50GB shared research storage',
      '3,000 monthly video call minutes',
      'Audit log & student account creation',
      'Priority community support',
    ],
  },
  research_institute: {
    code: 'research_institute',
    name: 'Research Institute',
    tagline: 'For laboratories and advanced academic research centers.',
    seats: 500,
    storage_gb: 200,
    video_minutes: 10000,
    amount: 0,
    amount_display: '',
    currency: 'NGN',
    features: [
      'Up to 500 members',
      '200GB research document storage',
      '10,000 monthly video call minutes',
      'Collaborative Research Studio & revisions',
      'Role-based member management & moderation',
    ],
  },
  university: {
    code: 'university',
    name: 'University',
    tagline: 'For higher education institutions with large faculties.',
    seats: 2000,
    storage_gb: 1000,
    video_minutes: 50000,
    amount: 0,
    amount_display: '',
    currency: 'NGN',
    features: [
      'Up to 2,000 members',
      '1TB institution-wide storage',
      '50,000 monthly video call minutes',
      'Auto-domain enrollment & student CSV generator',
      'Dedicated onboarding & custom SLA',
    ],
  },
};

const FALLBACK_PRICES: Record<PlanCode, Record<Currency, { month: string; year: string }>> = {
  ngo: {
    NGN: { month: '₦35,000', year: '₦350,000' },
    USD: { month: '$26.3', year: '$263' },
  },
  research_institute: {
    NGN: { month: '₦75,000', year: '₦750,000' },
    USD: { month: '$57', year: '$570' },
  },
  university: {
    NGN: { month: '₦150,000', year: '₦1,500,000' },
    USD: { month: '$150', year: '$1,500' },
  },
};

const TIER_ORDER: PlanCode[] = ['ngo', 'research_institute', 'university'];

function detectCurrency(): Currency {
  if (typeof navigator === 'undefined') return 'USD';
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || ''];
  if (languages.some((language) => /-ng$/i.test(language))) return 'NGN';
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone === 'Africa/Lagos') return 'NGN';
  } catch {
    // Older browsers may not expose a time zone.
  }
  return 'USD';
}

function portalUrl(plan: PlanCode, interval: Interval, currency: Currency): string {
  const params = new URLSearchParams({ plan, interval, currency });
  return `${ORG_URL}/?${params.toString()}`;
}

function PlanCard({
  code,
  plan,
  interval,
  currency,
  loading,
}: {
  code: PlanCode;
  plan: ApiPlan | undefined;
  interval: Interval;
  currency: Currency;
  loading: boolean;
}) {
  const meta = TIER_META[code];
  const Icon = meta.icon;
  const fallback = FALLBACK_PLANS[code];
  const resolved = plan || fallback;
  const displayPrice = plan?.amount_display || FALLBACK_PRICES[code][currency][interval];
  const featured = 'featured' in meta && meta.featured;

  return (
    <article className={`pricing-card ${featured ? 'pricing-card-featured' : ''}`}>
      {featured && (
        <div className="pricing-ribbon">
          <Sparkles className="h-3.5 w-3.5" />
          Most popular for universities
        </div>
      )}
      <div className="pricing-card-top">
        <div
          className="pricing-icon"
          style={{ color: meta.accent, backgroundColor: `color-mix(in srgb, ${meta.accent} 12%, transparent)` }}
        >
          <Icon className="h-6 w-6" />
        </div>
        <p className="pricing-eyebrow" style={{ color: meta.accent }}>{meta.eyebrow}</p>
        <h2>{resolved.name}</h2>
        <p className="pricing-summary">{resolved.tagline || meta.summary}</p>
      </div>

      <div className="pricing-amount-block">
        <div className={`pricing-amount ${loading ? 'is-loading' : ''}`}>
          {displayPrice}
          <span className="pricing-period">/{interval}</span>
        </div>
        <p className="pricing-billing-note">
          {interval === 'year'
            ? 'Billed once a year. Two months free compared with monthly billing.'
            : 'Billed monthly. Switch to annual and get two months free.'}
        </p>
      </div>

      <a
        href={portalUrl(code, interval, currency)}
        className={`btn-primary pricing-cta ${featured ? 'pricing-cta-featured' : ''}`}
        onClick={() => track('pricing_cta', { plan: code, interval, currency })}
      >
        <span>{meta.cta}</span>
        <ArrowRight className="h-4 w-4" />
      </a>

      <div className="pricing-includes">
        <p>What&apos;s included</p>
        <ul>
          {resolved.features.map((feature) => (
            <li key={feature}>
              <Check className="h-4 w-4" style={{ color: meta.accent }} />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="pricing-meta-row">
        <span><Users className="h-3.5 w-3.5" />{resolved.seats.toLocaleString()} seats</span>
        <span><Building2 className="h-3.5 w-3.5" />{resolved.storage_gb.toLocaleString()}GB</span>
        <span><GraduationCap className="h-3.5 w-3.5" />{resolved.video_minutes.toLocaleString()} min/mo</span>
      </div>
    </article>
  );
}

export function Pricing() {
  const [currency, setCurrency] = useState<Currency>(() => detectCurrency());
  const [interval, setInterval] = useState<Interval>('month');
  const [plans, setPlans] = useState<ApiPlan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    fetch(`${API_URL}/api/billing/plans/?currency=${currency}&interval=${interval}`, {
      headers: { Accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error('Could not load plans');
        return response.json() as Promise<PlansResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        const paidPlans = (data.plans || []).filter((plan) =>
          TIER_ORDER.includes(plan.code as PlanCode),
        );
        setPlans(paidPlans);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currency, interval]);

  const planByCode = useMemo(() => {
    const map: Partial<Record<PlanCode, ApiPlan>> = {};
    for (const plan of plans || []) {
      map[plan.code as PlanCode] = plan;
    }
    return map;
  }, [plans]);

  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)]">
      <Navbar />
      <main>
        <section className="pricing-hero">
          <div className="pricing-hero-grid" aria-hidden="true" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <Link to="/" className="pricing-back-link">
              ← Back to Curious Bright
            </Link>
            <div className="pricing-hero-copy">
              <div className="pricing-badge">
                <Building2 className="h-3.5 w-3.5" />
                For verified institutions
              </div>
              <h1>
                Bring your whole institution into the{' '}
                <span className="highlight-stroke highlight-stroke-coral">learning community</span>.
              </h1>
              <p>
                Verified universities, research institutes and education NGOs can create student
                accounts, manage departments and give every member a seat in one shared academic
                workspace.
              </p>
              <div className="pricing-hero-points">
                <span><Check className="h-4 w-4" /> Free for individual learners, always</span>
                <span><ShieldCheck className="h-4 w-4" /> Verification protects your students</span>
              </div>
            </div>

            <div className="pricing-toggle-row" role="group" aria-label="Billing preferences">
              <div className="pricing-toggle" role="group" aria-label="Billing interval">
                <button
                  type="button"
                  aria-pressed={interval === 'month'}
                  className={interval === 'month' ? 'active' : ''}
                  onClick={() => setInterval('month')}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  aria-pressed={interval === 'year'}
                  className={interval === 'year' ? 'active' : ''}
                  onClick={() => setInterval('year')}
                >
                  Annual <span>2 months free</span>
                </button>
              </div>
              <div className="pricing-toggle" role="group" aria-label="Currency">
                <button
                  type="button"
                  aria-pressed={currency === 'NGN'}
                  className={currency === 'NGN' ? 'active' : ''}
                  onClick={() => setCurrency('NGN')}
                >
                  ₦ Naira
                </button>
                <button
                  type="button"
                  aria-pressed={currency === 'USD'}
                  className={currency === 'USD' ? 'active' : ''}
                  onClick={() => setCurrency('USD')}
                >
                  $ USD
                </button>
              </div>
            </div>
            <p className="pricing-currency-note">
              {currency === 'NGN'
                ? 'Naira pricing is shown for institutions in Nigeria.'
                : 'USD pricing is shown for institutions outside Nigeria.'}{' '}
              Prices exclude applicable taxes. Verification is required before student access is granted.
            </p>
          </div>
        </section>

        <section className="pricing-cards-wrap" aria-label="Institutional plans">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {failed && (
              <div className="pricing-notice" role="status">
                <ShieldCheck className="h-4 w-4" />
                Live plan details are unavailable right now. The standard prices below still apply;
                the institutional team will confirm at application.
              </div>
            )}
            <div className="pricing-grid">
              {TIER_ORDER.map((code) => (
                <PlanCard
                  key={code}
                  code={code}
                  plan={planByCode[code]}
                  interval={interval}
                  currency={currency}
                  loading={loading}
                />
              ))}
            </div>

            <div className="pricing-verify-banner">
              <div className="pricing-verify-icon"><LockKeyhole className="h-5 w-5" /></div>
              <div>
                <h2>Verification comes before student access.</h2>
                <p>
                  Every organization submits its legal name, registration details, official domain
                  and a contact person. Only verified organizations appear in the student join
                  directory and can create or grant student accounts.
                </p>
              </div>
              <a href={`${ORG_URL}/?verify=1`} className="btn-secondary pricing-verify-link">
                See what verification requires
              </a>
            </div>
          </div>
        </section>

        <section className="pricing-steps-section">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="pricing-section-head">
              <span className="pricing-kicker">How it works</span>
              <h2>From application to your first cohort.</h2>
              <p>One review process, then a workspace your administrators control.</p>
            </div>
            <ol className="pricing-steps">
              <li>
                <span>01</span>
                <h3>Apply from the portal</h3>
                <p>Create your institutional account and submit your organization&apos;s legal and registration details.</p>
              </li>
              <li>
                <span>02</span>
                <h3>Get verified</h3>
                <p>Our team checks your domain, document and official email. You can track the decision and resubmit if needed.</p>
              </li>
              <li>
                <span>03</span>
                <h3>Invite your students</h3>
                <p>Once verified, create student accounts, approve join requests and manage your subscription securely.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="pricing-faq-section">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="pricing-section-head">
              <span className="pricing-kicker">Common questions</span>
              <h2>Simple answers before you apply.</h2>
            </div>
            <div className="pricing-faq">
              <details>
                <summary>Is Curious Bright still free for individual students? <ChevronDown className="h-4 w-4" /></summary>
                <p>Yes. Individual learners can join the community, study in rooms and publish research for free. These plans are only for organizations that need verified student accounts, administration and shared storage.</p>
              </details>
              <details>
                <summary>Why does my organization need to be verified? <ChevronDown className="h-4 w-4" /></summary>
                <p>Verification protects students from impersonation. We confirm your legal name, registration document, official domain and a contact person before your organization can create student accounts or appear in the join directory.</p>
              </details>
              <details>
                <summary>How is the currency decided? <ChevronDown className="h-4 w-4" /></summary>
                <p>Nigerian institutions are billed in Naira (₦). Institutions elsewhere are billed in US dollars ($). You can switch the preview above; the final invoice uses the billing country on your verified organization profile.</p>
              </details>
              <details>
                <summary>Can we change plans later? <ChevronDown className="h-4 w-4" /></summary>
                <p>Yes. Organization owners can move between plans as their community grows. Annual plans are billed once a year at ten times the monthly rate.</p>
              </details>
              <details>
                <summary>What happens if a verification is rejected? <ChevronDown className="h-4 w-4" /></summary>
                <p>The review team gives a written reason. You can correct the details or documents and resubmit from the portal. Existing members stay in their accounts while verification is pending; only new student access is paused.</p>
              </details>
            </div>
          </div>
        </section>

        <section className="pricing-final-cta">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="pricing-final-card">
              <div>
                <span className="pricing-kicker">Ready when you are</span>
                <h2>Give your institution one shared place to learn and publish.</h2>
                <p>Start the application, submit your documents, and our team will guide you through verification.</p>
              </div>
              <div className="pricing-final-actions">
                <a
                  href={portalUrl('university', interval, currency)}
                  className="btn-primary pricing-cta"
                  onClick={() => track('pricing_cta', { source: 'footer', plan: 'university', interval, currency })}
                >
                  <span>Open institutional portal</span>
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a href="https://app.curiousbright.com.ng/register" className="btn-secondary pricing-cta">
                  <span>Join as an individual</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
