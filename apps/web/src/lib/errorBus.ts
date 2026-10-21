export interface ErrorPayload {
  message: string;
  code?: string;
}

type ErrorListener = (payload: ErrorPayload) => void;

let listener: ErrorListener | null = null;

export function subscribeErrors(fn: ErrorListener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

/**
 * Global error entry point. Every backend/frontend failure funnels through
 * here so the user always sees one consistent alert.
 */
export function showError(message: string, payload: Omit<ErrorPayload, 'message'> = {}): void {
  if (listener) {
    listener({ message, ...payload });
  } else {
    console.error('[alert]', message, payload);
  }
}
