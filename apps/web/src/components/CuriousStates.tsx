import { motion, useReducedMotion } from 'framer-motion';

interface LoadingStateProps {
  message?: string;
}

export function CuriousLoading({ message = 'Connecting you to your team...' }: LoadingStateProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="loading-container">
      <motion.div
        className="loading-nametag-arriving"
        initial={shouldReduceMotion ? {} : { scale: 0.8, y: 10 }}
        animate={shouldReduceMotion ? {} : { scale: [0.95, 1.05, 0.95], y: [0, -6, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="flex items-center gap-1.5">
          <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '1rem' }}></i>
          Collaborator arriving...
        </span>
      </motion.div>
      <p style={{ fontSize: '0.9375rem', fontWeight: 500, color: 'var(--color-faded-ink)' }}>
        {message}
      </p>
    </div>
  );
}

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionButton?: React.ReactNode;
  flourishText?: string;
}

export function CuriousEmpty({
  title = 'Nothing here yet',
  description = 'Start a document and invite someone to write with you.',
  actionButton,
  flourishText = 'Shared Notebook',
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-illustrative">
        <span className="flex items-center gap-1.5">
          <i className="bx bx-book-content" style={{ fontSize: '1.1rem' }}></i>
          {flourishText}
        </span>
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-desc">{description}</p>
      {actionButton && <div>{actionButton}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function CuriousError({
  title = 'Something unexpected happened',
  message = 'We could not load this section right now. Please try again in a moment.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="alert alert-error flex flex-col items-start gap-2" style={{ maxWidth: '560px', margin: '2rem auto' }}>
      <div className="font-semibold text-sm flex items-center gap-1.5" style={{ fontSize: '1rem' }}>
        <i className="bx bx-error-circle" style={{ fontSize: '1.25rem', color: 'var(--danger)' }}></i>
        {title}
      </div>
      <p style={{ fontSize: '0.875rem', color: 'var(--danger)' }}>{message}</p>
      {onRetry && (
        <button
          className="btn btn-secondary mt-2"
          onClick={onRetry}
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
        >
          Try Again
        </button>
      )}
    </div>
  );
}
