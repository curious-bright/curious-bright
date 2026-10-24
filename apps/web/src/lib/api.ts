import { showError } from './errorBus';

export const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const ACCESS_KEY = 'lb_access';
const REFRESH_KEY = 'lb_refresh';

export interface ApiErrorShape {
  code: string;
  message: string;
  status: number;
}

export class ApiError extends Error implements ApiErrorShape {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Django's paginated list responses arrive as {count,next,previous,results};
 * a few endpoints return bare arrays. Components should always read lists
 * through this helper so either shape works and a failed request yields [].
 */
export function resultsOf<T = any>(data: Partial<Paginated<T>> | T[] | null | undefined): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const wrapped = (data as Partial<Paginated<T>>).results;
  return Array.isArray(wrapped) ? wrapped : [];
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh?: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function parseError(response: Response): Promise<ApiError> {
  let code = 'unknown_error';
  let message = `Request failed (${response.status})`;
  try {
    const body = await response.json();
    if (body && typeof body === 'object') {
      code = body.code || code;
      message = body.message || message;
    }
  } catch {
    // non-JSON error body (e.g. HTML page) — keep defaults
  }
  return new ApiError(code, message, response.status);
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/token/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        });
        if (!response.ok) {
          clearTokens();
          return false;
        }
        const data = await response.json();
        if (data?.access) {
          setTokens(data.access, data.refresh || refresh);
          return true;
        }
        clearTokens();
        return false;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

function resolveUrl(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  return `${API_URL}${path}`;
}

async function request(endpoint: string, options: RequestInit = {}, allowRetry = true): Promise<unknown> {
  const url = resolveUrl(endpoint);

  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers, credentials: 'omit' });
  } catch {
    throw new ApiError('network_error', 'Cannot reach the server. Check your connection.', 0);
  }

  if (response.status === 401 && allowRetry && !endpoint.includes('/auth/token') && !endpoint.includes('/auth/logout')) {
    if (await tryRefresh()) {
      return request(endpoint, options, false);
    }
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return response.text();
}

function reportError(err: unknown): void {
  if (err instanceof ApiError) {
    showError(err.message, { code: err.code });
    if (err.code === 'unauthenticated' || err.status === 401) {
      clearTokens();
    }
    return;
  }
  showError('Something went wrong. Please try again.');
}

/**
 * Fetch a JSON resource. Failures are surfaced through the global alert and
 * resolve to `null`. Use `apiVoid` for endpoints whose success body is empty
 * (204), and `apiDownload` for file attachments.
 */
export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
  try {
    return (await request(endpoint, options)) as T;
  } catch (err) {
    reportError(err);
    return null;
  }
}

/**
 * Strict JSON request for flows that must inspect an API error code (for
 * example routing an unverified login to the verification screen). Callers are
 * responsible for surfacing the thrown ApiError.
 */
export async function apiFetchStrict<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  return (await request(endpoint, options)) as T;
}

/**
 * Ask the API for a single-use WebSocket credential. Keeping the JWT out of
 * the socket URL means access logs never contain a replayable access token.
 * Returns null when the request fails; callers fall back to a token for one
 * release so older backends keep working.
 */
export async function createWebSocketTicket(): Promise<string | null> {
  try {
    const data = await apiFetchStrict<{ ticket?: string }>('/api/auth/ws-ticket/', {
      method: 'POST',
    });
    const ticket = data?.ticket;
    return typeof ticket === 'string' && ticket ? ticket : null;
  } catch {
    return null;
  }
}

/**
 * Run a mutating request where only success/failure matters. Unlike
 * `apiFetch`, a 204 success returns `true` rather than `null`.
 */
export async function apiVoid(endpoint: string, options: RequestInit = {}): Promise<boolean> {
  try {
    await request(endpoint, options);
    return true;
  } catch (err) {
    reportError(err);
    return false;
  }
}

/**
 * Download an authenticated file (account export, CSV template/export).
 * Returns false when the request failed and the error was already surfaced.
 */
export async function apiDownload(endpoint: string, fallbackName = 'download'): Promise<boolean> {
  const url = resolveUrl(endpoint);
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  try {
    let response = await fetch(url, { headers, credentials: 'omit' });
    if (response.status === 401 && (await tryRefresh())) {
      const refreshed = getAccessToken();
      if (refreshed) headers.set('Authorization', `Bearer ${refreshed}`);
      response = await fetch(url, { headers, credentials: 'omit' });
    }
    if (!response.ok) throw await parseError(response);

    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const filename = match ? decodeURIComponent(match[1].trim()) : fallbackName;

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch (err) {
    if (err instanceof ApiError) {
      showError(err.message, { code: err.code });
    } else {
      showError('Could not download that file. Please try again.');
    }
    return false;
  }
}
