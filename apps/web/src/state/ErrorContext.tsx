import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { subscribeErrors, showError, type ErrorPayload } from '../lib/errorBus';

interface ErrorContextValue {
  error: ErrorPayload | null;
  showError: (message: string, payload?: Omit<ErrorPayload, 'message'>) => void;
  clearError: () => void;
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<ErrorPayload | null>(null);

  const dismiss = useCallback(() => setError(null), []);

  useEffect(() => subscribeErrors((payload) => setError(payload)), []);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(dismiss, 7000);
    return () => window.clearTimeout(timer);
  }, [error, dismiss]);

  const show = useCallback((message: string, payload: Omit<ErrorPayload, 'message'> = {}) => {
    showError(message, payload);
  }, []);

  const value = useMemo(() => ({ error, showError: show, clearError: dismiss }), [error, show, dismiss]);

  return <ErrorContext.Provider value={value}>{children}</ErrorContext.Provider>;
}

export function useError(): ErrorContextValue {
  const ctx = useContext(ErrorContext);
  if (!ctx) throw new Error('useError must be used inside <ErrorProvider>');
  return ctx;
}
