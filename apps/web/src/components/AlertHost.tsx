import { useError } from '../state/ErrorContext';

/**
 * Renders the single global alert that every backend/frontend error
 * surfaces through (see lib/errorBus + lib/api).
 */
export default function AlertHost() {
  const { error, clearError } = useError();

  if (!error) return null;

  const detail = error.details ? Object.values(error.details).flat().join(' ') : null;

  return (
    <div
      role="alert"
      className="alert alert-error"
      style={{
        position: 'fixed',
        top: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        maxWidth: 'min(560px, calc(100vw - 2rem))',
        width: '100%',
        boxShadow: '0 8px 24px rgba(20,20,26,0.18)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '0.75rem',
      }}
    >
      <span className="flex items-start gap-1.5" style={{ flex: 1 }}>
        <i className="bx bx-error-circle" style={{ fontSize: '1.1rem', marginTop: '0.1rem' }}></i>
        <span>
          {error.message}
          {detail && error.details && (
            <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.85, marginTop: '0.2rem' }}>
              {detail}
            </span>
          )}
        </span>
      </span>
      <button
        onClick={clearError}
        aria-label="Dismiss alert"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'inherit' }}
      >
        <i className="bx bx-x"></i>
      </button>
    </div>
  );
}
