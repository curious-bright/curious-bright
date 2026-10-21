import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div style={{ maxWidth: 520, margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
      <div className="comment-corner-card">
        <div
          style={{
            fontSize: '3rem',
            fontWeight: 800,
            color: 'var(--color-coral)',
            letterSpacing: '-0.04em',
          }}
        >
          404
        </div>
        <h2 style={{ marginTop: '0.5rem' }}>This page doesn’t exist</h2>
        <p className="text-muted text-sm mt-2" style={{ lineHeight: 1.6 }}>
          The link may be broken, or the content may have moved.
        </p>
        <div className="flex justify-center gap-3 mt-6">
          <Link className="btn btn-primary" to="/feed">
            Go to feed
          </Link>
          <Link className="btn btn-secondary" to="/browse">
            Browse library
          </Link>
        </div>
      </div>
    </div>
  );
}
