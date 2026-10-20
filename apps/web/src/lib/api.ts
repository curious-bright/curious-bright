import { showError } from './errorBus';

export const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const ACCESS_KEY = 'lb_access';
const REFRESH_KEY = 'lb_refresh';

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Record<string, string[]>;
  status: number;
}

export class ApiError extends Error implements ApiErrorShape {
  code: string;
  details?: Record<string, string[]>;
  status: number;

  constructor(code: string, message: string, status: number, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
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

function formatDetails(details?: Record<string, string[]>): string | undefined {
  if (!details) return undefined;
  const parts = Object.values(details).flat();
  return parts.length ? parts.join(' ') : undefined;
}

async function parseError(response: Response): Promise<ApiError> {
  let code = 'unknown_error';
  let message = `Request failed (${response.status})`;
  let details: Record<string, string[]> | undefined;
  try {
    const body = await response.json();
    if (body && typeof body === 'object') {
      code = body.code || code;
      message = body.message || message;
      details = body.details;
    }
  } catch {
    // non-JSON error body (e.g. HTML page) — keep defaults
  }
  return new ApiError(code, message, response.status, details);
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

async function request(endpoint: string, options: RequestInit = {}, allowRetry = true): Promise<unknown> {
  const url = endpoint.startsWith('/api/') || endpoint.startsWith('http')
    ? endpoint
    : `${API_URL}/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

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

/**
 * The single API wrapper. Catches every failure, surfaces it through the
 * global error alert, and resolves with `null` so calling components need
 * no individual try/catch.
 */
export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
  try {
    return (await request(endpoint, options)) as T;
  } catch (err) {
    if (err instanceof ApiError) {
      const detail = formatDetails(err.details);
      showError(detail ? `${err.message} — ${detail}` : err.message, {
        code: err.code,
        details: err.details,
      });
      if (err.code === 'unauthenticated' || err.status === 401) {
        clearTokens();
      }
      return null;
    }
    showError('Something went wrong. Please try again.');
    return null;
  }
}
