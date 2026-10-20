import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import { CuriousLoading } from '../components/CuriousStates';

const SUBJECT_OPTIONS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'Computer Science', 'Engineering', 'Medicine',
  'History', 'Philosophy', 'Economics', 'Literature',
  'Law', 'Psychology', 'Linguistics', 'Education',
  'Arts & Humanities', 'Political Science', 'Environmental Science',
];

type AppStatus = 'pending' | 'approved' | 'rejected';

interface ExistingApp {
  status: AppStatus;
  motivation: string;
  experience: string;
  subjects: string[];
  created_at: string;
  review_note?: string | null;
}

const statusConfig: Record<AppStatus, { label: string; color: string; bg: string; border: string; icon: string }> = {
  pending:  { label: 'Under Review', icon: '⏳', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
  approved: { label: 'Approved!',    icon: '🎉', color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)' },
  rejected: { label: 'Not Approved', icon: '❌', color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)'  },
};

export default function ApplyModerator() {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [motivation, setMotivation] = useState('');
  const [experience, setExperience] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [existingApp, setExistingApp] = useState<ExistingApp | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    let cancelled = false;
    // apiFetch returns null on 404 — meaning no application yet.
    apiFetch<ExistingApp>('/moderator-applications/me/')
      .then(data => {
        if (!cancelled) setExistingApp(data);
      })
      .finally(() => {
        if (!cancelled) setCheckingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, navigate]);

  const toggleSubject = (subject: string) => {
    setSelectedSubjects(prev =>
      prev.includes(subject) ? prev.filter(s => s !== subject) : [...prev, subject]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (selectedSubjects.length === 0) {
      setError('Please select at least one subject area.');
      return;
    }
    if (motivation.trim().length < 80) {
      setError('Please write a more detailed motivation (at least 80 characters).');
      return;
    }

    setLoading(true);
    const created = await apiFetch('/moderator-applications/', {
      method: 'POST',
      body: JSON.stringify({ motivation: motivation.trim(), experience: experience.trim(), subjects: selectedSubjects }),
    });
    if (created) {
      setSuccess(true);
    } else {
      setError('Failed to submit application. Please try again.');
    }
    setLoading(false);
  };

  if (checkingStatus || authLoading) {
    return <CuriousLoading message="Checking application status..." />;
  }

  // Success state
  if (success) {
    return (
      <div style={{ maxWidth: 540, margin: '3rem auto', textAlign: 'center' }}>
        <div className="comment-corner-card" style={{ padding: '3rem 2rem' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1.25rem' }}>🎉</div>
          <h2 style={{ marginBottom: '0.75rem' }}>Application Submitted!</h2>
          <p className="text-muted" style={{ lineHeight: 1.7, marginBottom: '2rem' }}>
            Thank you for applying to become a CuriousBright moderator. Our admin team will review
            your application and you'll receive a notification with the decision.
          </p>
          <div className="flex justify-center gap-2" style={{ flexWrap: 'wrap' }}>
            <Link to="/browse" className="btn btn-primary">Browse Library</Link>
            <Link to="/community" className="btn btn-secondary">Study Rooms</Link>
          </div>
        </div>
      </div>
    );
  }

  // Existing application status view
  if (existingApp) {
    const cfg = statusConfig[existingApp.status] ?? statusConfig.pending;
    return (
      <div style={{ maxWidth: 620, margin: '2rem auto' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <Link to="/browse" className="text-muted" style={{ fontSize: '0.875rem' }}>← Back to Library</Link>
        </div>

        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Moderator Application</h1>
        <p className="text-muted" style={{ marginBottom: '2rem', fontSize: '0.9rem' }}>
          You have already submitted an application.
        </p>

        {/* Status card */}
        <div style={{
          padding: '1.5rem',
          background: cfg.bg,
          border: `1.5px solid ${cfg.border}`,
          borderRadius: '4px 0px 4px 4px',
          marginBottom: '1.5rem',
          display: 'flex', alignItems: 'center', gap: '1rem',
        }}>
          <div style={{ fontSize: '2rem' }}>{cfg.icon}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: cfg.color, marginBottom: '0.2rem' }}>
              {cfg.label}
            </div>
            <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
              Submitted {new Date(existingApp.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        </div>

        {existingApp.review_note && (
          <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
            <span>📝 Admin note: {existingApp.review_note}</span>
          </div>
        )}

        <div className="comment-corner-card" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Your Motivation</h3>
          <p className="text-muted" style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>{existingApp.motivation}</p>
        </div>

        <div className="comment-corner-card" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Experience & Background</h3>
          <p className="text-muted" style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>{existingApp.experience}</p>
        </div>

        <div className="comment-corner-card">
          <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Subject Areas</h3>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {existingApp.subjects.map(s => (
              <span key={s} className="badge-tag badge-teal">{s}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Application form
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to="/browse" className="text-muted" style={{ fontSize: '0.875rem' }}>← Back to Library</Link>
      </div>

      {/* Header */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div className="flex items-center gap-3" style={{ marginBottom: '0.75rem' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '4px 0px 4px 4px',
            background: 'rgba(0,168,150,0.12)',
            border: '1.5px solid var(--color-teal)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem',
          }}>
            <i className="bx bx-shield-quarter" style={{ color: 'var(--color-teal)' }}></i>
          </div>
          <div>
            <h1 style={{ fontSize: '1.75rem', marginBottom: '0.2rem' }}>Apply as Moderator</h1>
            <p className="text-muted" style={{ fontSize: '0.875rem' }}>
              Help keep CuriousBright a high-quality academic space
            </p>
          </div>
        </div>
      </div>

      {/* What moderators do */}
      <div className="comment-corner-card" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <h3 className="text-muted" style={{ marginBottom: '1rem', fontSize: '1rem' }}>
          What moderators do
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {[
            { icon: 'bx-file', text: 'Review submitted papers for quality' },
            { icon: 'bx-check-circle', text: 'Approve or reject submissions' },
            { icon: 'bx-flag', text: 'Handle community reports' },
            { icon: 'bx-handshake', text: 'Uphold platform standards' },
          ].map(item => (
            <div key={item.text} className="flex gap-2 items-start">
              <i className={`bx ${item.icon}`} style={{ fontSize: '1.1rem', flexShrink: 0, color: 'var(--color-teal)' }}></i>
              <span className="text-muted" style={{ fontSize: '0.8375rem', lineHeight: 1.5 }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} id="moderator-apply-form">

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
            <span>⚠️ {error}</span>
          </div>
        )}

        {/* Motivation */}
        <div className="comment-corner-card" style={{ marginBottom: '1.25rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="motivation">
              Why do you want to be a moderator? *
            </label>
            <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.6rem', marginTop: '0.2rem' }}>
              Tell us your motivation and what makes you a good fit for this role.
            </p>
            <textarea
              id="motivation"
              rows={5}
              placeholder="I want to contribute to CuriousBright because..."
              value={motivation}
              onChange={e => setMotivation(e.target.value)}
              required
              minLength={80}
            />
            <div style={{ textAlign: 'right', fontSize: '0.75rem', color: motivation.length < 80 ? 'var(--color-ink-muted, #888)' : 'var(--color-teal)', marginTop: '0.3rem' }}>
              {motivation.length}/80 min chars
            </div>
          </div>
        </div>

        {/* Experience */}
        <div className="comment-corner-card" style={{ marginBottom: '1.25rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="experience">
              Academic background & relevant experience
            </label>
            <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.6rem', marginTop: '0.2rem' }}>
              Describe your academic background, any reviewing or editing experience, or relevant expertise.
            </p>
            <textarea
              id="experience"
              rows={4}
              placeholder="I hold a degree in... / I have experience reviewing... / I have been using the platform since..."
              value={experience}
              onChange={e => setExperience(e.target.value)}
            />
          </div>
        </div>

        {/* Subjects */}
        <div className="comment-corner-card" style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem' }}>
            Subject areas you can evaluate *
          </label>
          <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
            Select all areas where you have sufficient knowledge to review academic content.
          </p>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {SUBJECT_OPTIONS.map(subject => {
              const selected = selectedSubjects.includes(subject);
              return (
                <button
                  key={subject}
                  type="button"
                  id={`subject-${subject.replace(/\s+/g, '-').toLowerCase()}`}
                  onClick={() => toggleSubject(subject)}
                  className={selected ? 'badge-tag badge-teal' : 'badge-tag'}
                  style={{ cursor: 'pointer' }}
                >
                  {selected && '✓ '}{subject}
                </button>
              );
            })}
          </div>
          {selectedSubjects.length > 0 && (
            <p className="text-muted" style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
              {selectedSubjects.length} subject{selectedSubjects.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        <button
          id="apply-moderator-submit"
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ width: '100%', padding: '0.875rem', fontSize: '1rem' }}
        >
          {loading ? (
            <><div className="spinner" style={{ width: 18, height: 18, borderTopColor: '#fff' }} /> Submitting...</>
          ) : (
            '🛡️ Submit Moderator Application'
          )}
        </button>

        <p className="text-muted text-center" style={{ marginTop: '1rem', fontSize: '0.8rem' }}>
          Applications are reviewed by our admin team within 3–5 business days.
        </p>
      </form>
    </div>
  );
}
