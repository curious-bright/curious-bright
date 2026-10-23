export type AlertVariant = 'error' | 'success' | 'info';

export interface ErrorPayload {
  message: string;
  code?: string;
  variant?: AlertVariant;
}

type ErrorListener = (payload: ErrorPayload) => void;

let listener: ErrorListener | null = null;

export function subscribeErrors(fn: ErrorListener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

function publish(message: string, payload: Omit<ErrorPayload, 'message'> = {}): void {
  if (listener) {
    listener({ message, ...payload });
  } else {
    console.error('[alert]', message, payload);
  }
}

/**
 * Global error entry point. Every backend/frontend failure funnels through
 * here so the user always sees one consistent alert.
 */
export function showError(message: string, payload: Omit<ErrorPayload, 'message'> = {}): void {
  publish(message, { ...payload, variant: 'error' });
}

/** Non-error notices use the same single global alert host. */
export function showSuccess(message: string, payload: Omit<ErrorPayload, 'message'> = {}): void {
  publish(message, { ...payload, variant: 'success' });
}

export function showInfo(message: string, payload: Omit<ErrorPayload, 'message'> = {}): void {
  publish(message, { ...payload, variant: 'info' });
}
