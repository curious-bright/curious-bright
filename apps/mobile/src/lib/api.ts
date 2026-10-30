// Django API client for the Expo app. Mirrors apps/web/src/lib/api.ts:
// single-flight token refresh on 401, typed ApiError, Django pagination
// helper. Tokens live in expo-secure-store behind an in-memory cache because
// SecureStore reads are async and too slow for per-request hot paths.

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { showDanger } from '../components/ui/Toast';

const ACCESS_KEY = 'cb_access';
const REFRESH_KEY = 'cb_refresh';

function resolveApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  // Expo dev server host (exp://192.168.x.x:8081) also hosts the API in dev.
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:8000`;
  if (Platform.OS === 'android') return 'http://10.0.2.2:8000';
  return 'http://127.0.0.1:8000';
}

export const API_URL = resolveApiUrl();
export const WS_URL = process.env.EXPO_PUBLIC_WS_URL || API_URL.replace(/^http/, 'ws');

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

export function resultsOf<T = any>(data: Partial<Paginated<T>> | T[] | null | undefined): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const wrapped = (data as Partial<Paginated<T>>).results;
  return Array.isArray(wrapped) ? wrapped : [];
}

let accessMemory: string | null = null;
let refreshMemory: string | null = null;
let tokensLoaded = false;

export async function loadTokens(): Promise<void> {
  try {
    [accessMemory, refreshMemory] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_KEY),
      SecureStore.getItemAsync(REFRESH_KEY),
    ]);
  } catch {
    accessMemory = null;
    refreshMemory = null;
  }
  tokensLoaded = true;
}

export function getAccessToken(): string | null {
  return accessMemory;
}

export function getRefreshToken(): string | null {
  return refreshMemory;
}

export function setTokens(access: string, refresh?: string): void {
  accessMemory = access;
  if (refresh) refreshMemory = refresh;
  void Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, access),
    refresh ? SecureStore.setItemAsync(REFRESH_KEY, refresh) : Promise.resolve(),
  ]);
}

export function clearTokens(): void {
  accessMemory = null;
  refreshMemory = null;
  void Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}

async function parseError(response: Response): Promise<ApiError> {
  let code = 'unknown_error';
  let message = `Request failed (${response.status})`;
  try {
    const body = await response.json();
    if (body && typeof body === 'object') {
      code = body.code || code;
      message = body.message || body.detail || message;
    }
  } catch {
    // non-JSON error body — keep defaults
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

export function resolveUrl(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const path = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  return `${API_URL}${path}`;
}

async function request(endpoint: string, options: RequestInit = {}, allowRetry = true): Promise<unknown> {
  if (!tokensLoaded) await loadTokens();
  const url = resolveUrl(endpoint);

  const headers: Record<string, string> = {};
  new Headers(options.headers || {}).forEach((value, key) => {
    headers[key] = value;
  });
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isForm && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
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
    showDanger(err.message);
    if (err.code === 'unauthenticated' || err.status === 401) {
      clearTokens();
    }
    return;
  }
  showDanger('Something went wrong. Please try again.');
}

/** Soft JSON request: failures surface as a toast and resolve to null. */
export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
  try {
    return (await request(endpoint, options)) as T;
  } catch (err) {
    reportError(err);
    return null;
  }
}

/** Strict JSON request for flows that must inspect ApiError.code themselves. */
export async function apiFetchStrict<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  return (await request(endpoint, options)) as T;
}

/** Mutating request where only success/failure matters (204 -> true). */
export async function apiVoid(endpoint: string, options: RequestInit = {}): Promise<boolean> {
  try {
    await request(endpoint, options);
    return true;
  } catch (err) {
    reportError(err);
    return false;
  }
}

/** Single-use WebSocket credential so the JWT never appears in a socket URL. */
export async function createWebSocketTicket(): Promise<string | null> {
  try {
    const data = await apiFetchStrict<{ ticket?: string }>('/auth/ws-ticket/', { method: 'POST' });
    const ticket = data?.ticket;
    return typeof ticket === 'string' && ticket ? ticket : null;
  } catch {
    return null;
  }
}

/** Fetch an authenticated binary/file response into a device File via expo-file-system. */
export async function fetchWithAuth(url: string): Promise<Response> {
  if (!tokensLoaded) await loadTokens();
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let response = await fetch(url, { headers });
  if (response.status === 401 && (await tryRefresh())) {
    const refreshed = getAccessToken();
    if (refreshed) headers.Authorization = `Bearer ${refreshed}`;
    response = await fetch(url, { headers });
  }
  if (!response.ok) throw await parseError(response);
  return response;
}
