import { Link } from 'react-router-dom';
import { HighlighterText } from '../components/HighlighterText';

const features = [
  {
    icon: 'bx-library',
    title: 'Open Library',
    desc: 'Access a growing collection of shared papers, study notes and open resources — free for every member.',
  },
  {
    icon: 'bx-video',
    title: 'Study Rooms',
    desc: 'Join real-time collaborative rooms with room chat, live video and a shared whiteboard for group learning.',
  },
  {
    icon: 'bx-pen',
    title: 'Live Whiteboard',
    desc: 'Draw, annotate and brainstorm together on one canvas — perfect for working through a tricky concept.',
  },
  {
    icon: 'bx-upload',
    title: 'Share Research',
    desc: 'Contribute your own papers and notes. Every shared paper enters a clear peer-review queue.',
  },
  {
    icon: 'bx-shield-quarter',
    title: 'Moderated Content',
    desc: 'A community review team keeps the notebook accurate, useful and welcoming for everyone.',
  },
  {
    icon: 'bx-search',
    title: 'Unified Search',
    desc: 'Find papers, study rooms and co-authors in one place, with results filtered to what you are allowed to see.',
  },
];

const stats = [
  { value: 'Open', label: 'Access for every learner', accent: 'var(--color-teal)' },
  { value: 'Live', label: 'Rooms, chat and whiteboards', accent: 'var(--color-coral)' },
  { value: 'Shared', label: 'Notes and research papers', accent: 'var(--color-mustard)' },
  { value: 'Reviewed', label: 'Community peer review', accent: 'var(--color-teal)' },
];

const steps = [
  { step: '01', title: 'Create your account', desc: 'Sign up free in under a minute. No card required.' },
  { step: '02', title: 'Explore the library', desc: 'Browse papers and notes across disciplines, or search for exactly what you need.' },
  { step: '03', title: 'Join a study room', desc: 'Talk through problems with video, room chat and a shared whiteboard.' },
  { step: '04', title: 'Contribute and grow', desc: 'Share your own work, help others learn and build your academic reputation.' },
];

const team = [
  { icon: 'bx-book-open', name: 'Research Curation', role: 'Library & content' },
  { icon: 'bx-code-alt', name: 'Platform Engineering', role: 'Infrastructure & development' },
  { icon: 'bx-shield-quarter', name: 'Community Moderation', role: 'Trust & safety' },
  { icon: 'bx-handshake', name: 'Academic Partnerships', role: 'Institutions & outreach' },
];

export default function About() {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: '4rem' }} className="animate-fade-in">
      <section style={{ textAlign: 'center', marginBottom: '3rem', paddingTop: '1rem' }}>
        <span className="badge-tag badge-coral" style={{ display: 'inline-block', marginBottom: '1.25rem' }}>
          <i className="bx bx-sparkles" style={{ marginRight: 4 }}></i> Open academic platform
        </span>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.12, marginBottom: '1.1rem' }}>
          Where curiosity meets
          <br />
          <HighlighterText color="var(--color-mustard)">bright ideas.</HighlighterText>
        </h1>
        <p className="text-muted" style={{ fontSize: '1.05rem', maxWidth: 620, margin: '0 auto 1.9rem', lineHeight: 1.7 }}>
          Curious Bright is a collaborative academic platform for students, researchers and lifelong
          learners to discover, share and study together — in real time.
        </p>
        <div className="flex justify-center gap-3" style={{ flexWrap: 'wrap' }}>
          <Link to="/browse" id="about-explore-library" className="btn btn-primary" style={{ padding: '0.75rem 1.75rem' }}>
            Explore the library <i className="bx bx-right-arrow-alt"></i>
          </Link>
          <Link to="/register" id="about-join-free" className="btn btn-secondary" style={{ padding: '0.75rem 1.75rem' }}>
            Join for free
          </Link>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '1rem',
          marginBottom: '3rem',
        }}
      >
        {stats.map((stat) => (
          <div key={stat.label} className="glass-card" style={{ padding: '1.35rem 1rem', textAlign: 'center' }}>
            <div
              className="font-display"
              style={{ fontSize: '1.75rem', fontWeight: 800, color: stat.accent, letterSpacing: '-0.03em', marginBottom: '0.2rem' }}
            >
              {stat.value}
            </div>
            <div className="text-xs text-muted" style={{ fontWeight: 700 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </section>

      <section className="glass-card" style={{ marginBottom: '2rem', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: '6px 0 6px 6px',
              flexShrink: 0,
              background: 'rgba(255, 90, 54, 0.1)',
              border: '1.5px solid rgba(255, 90, 54, 0.25)',
              color: 'var(--color-coral)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
            }}
          >
            <i className="bx bx-target-lock"></i>
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h2 style={{ marginBottom: '0.7rem', fontSize: '1.35rem' }}>Our mission</h2>
            <p className="text-muted" style={{ lineHeight: 1.75, marginBottom: '0.9rem' }}>
              Knowledge should be accessible to everyone — not locked behind paywalls or institutional
              barriers. Curious Bright was founded on the belief that collaborative learning accelerates
              discovery.
            </p>
            <p className="text-muted" style={{ lineHeight: 1.75 }}>
              Whether you are a student revising for exams, a researcher exploring a new field or a
              self-taught learner following your curiosity, this is your academic home.
            </p>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: '3rem' }}>
        <div className="flex items-center justify-between gap-3 mb-4" style={{ flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', marginBottom: '0.2rem' }}>What we offer</h2>
            <p className="text-muted text-sm">Everything you need to learn, collaborate and grow.</p>
          </div>
          <Link to="/community" className="btn btn-secondary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}>
            Visit study rooms
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {features.map((feature) => (
            <div key={feature.title} className="glass-card glass-card-interactive" style={{ padding: '1.35rem' }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: '4px 0 4px 4px',
                  background: 'rgba(0, 168, 150, 0.1)',
                  border: '1.5px solid rgba(0, 168, 150, 0.22)',
                  color: '#007A6D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.3rem',
                  marginBottom: '0.9rem',
                }}
              >
                <i className={`bx ${feature.icon}`}></i>
              </div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.4rem', fontWeight: 700 }}>{feature.title}</h3>
              <p className="text-muted" style={{ fontSize: '0.86rem', lineHeight: 1.65 }}>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-card" style={{ marginBottom: '2rem', padding: '2rem' }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.35rem' }}>How it works</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {steps.map((item, index) => (
            <div key={item.step} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div
                className="font-display"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: '5px 0 5px 5px',
                  flexShrink: 0,
                  background: index === 0 ? 'var(--color-ink)' : 'var(--color-paper)',
                  border: index === 0 ? '1.5px solid var(--color-ink)' : '1.5px solid var(--color-line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  color: index === 0 ? 'var(--color-paper)' : 'var(--color-faded-ink)',
                }}
              >
                {item.step}
              </div>
              <div>
                <div style={{ fontWeight: 700, marginBottom: '0.15rem' }}>{item.title}</div>
                <div className="text-sm text-muted" style={{ lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ marginBottom: '0.3rem', fontSize: '1.35rem' }}>Our teams</h2>
        <p className="text-muted text-sm" style={{ marginBottom: '1.25rem' }}>
          The people keeping Curious Bright useful, safe and growing.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          {team.map((member) => (
            <div key={member.name} className="glass-card" style={{ padding: '1.2rem', textAlign: 'center' }}>
              <div style={{ color: 'var(--color-coral)', fontSize: '1.4rem', marginBottom: '0.6rem' }}>
                <i className={`bx ${member.icon}`}></i>
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.2rem' }}>{member.name}</div>
              <div className="text-xs text-muted">{member.role}</div>
            </div>
          ))}
        </div>
      </section>

      <section
        className="glass-card"
        style={{
          padding: '2.25rem',
          textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(244, 180, 61, 0.14), rgba(255, 90, 54, 0.06))',
          borderColor: 'rgba(244, 180, 61, 0.55)',
        }}
      >
        <h2 style={{ marginBottom: '0.6rem', fontSize: '1.4rem' }}>Ready to start learning?</h2>
        <p className="text-muted" style={{ marginBottom: '1.5rem', maxWidth: 480, margin: '0 auto 1.5rem' }}>
          Join a community of curious minds sharing what they know and learning what they do not.
        </p>
        <div className="flex justify-center gap-3" style={{ flexWrap: 'wrap' }}>
          <Link to="/register" id="about-cta-register" className="btn btn-primary" style={{ padding: '0.7rem 1.8rem' }}>
            Get started free <i className="bx bx-right-arrow-alt"></i>
          </Link>
          <Link to="/browse" id="about-cta-browse" className="btn btn-secondary" style={{ padding: '0.7rem 1.8rem' }}>
            Browse papers
          </Link>
        </div>
      </section>

      <p className="text-center text-xs text-muted" style={{ marginTop: '2rem' }}>
        Curious Bright is open source and community-driven. ·{' '}
        <Link to="/apply-moderator" style={{ color: 'var(--color-teal)', fontWeight: 700 }}>Apply as moderator</Link>
        {' '}·{' '}
        <Link to="/mod-login" style={{ color: 'var(--color-teal)', fontWeight: 700 }}>Moderator portal</Link>
      </p>
    </div>
  );
}
