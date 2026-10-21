import React from 'react';
import { showError } from '../lib/errorBus';

interface State {
  hasError: boolean;
}

/**
 * Last line of defence for render-time failures. Route-level API errors are
 * handled by lib/api + AlertHost; this catches everything else so the user
 * never sees a blank white screen.
 */
export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
    showError('This page ran into a problem. Reload to try again.');
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{ maxWidth: 520, margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
        <div className="comment-corner-card">
          <i className="bx bx-error-circle" style={{ fontSize: '2.5rem', color: 'var(--color-coral)' }}></i>
          <h2 style={{ marginTop: '1rem' }}>Something went wrong</h2>
          <p className="text-muted text-sm mt-2" style={{ lineHeight: 1.6 }}>
            An unexpected error stopped this page from rendering. Your data is safe.
          </p>
          <div className="flex justify-center gap-3 mt-6">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload page
            </button>
            <a className="btn btn-secondary" href="/feed">
              Back to feed
            </a>
          </div>
        </div>
      </div>
    );
  }
}
