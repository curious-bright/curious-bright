// Google sign-in: authorization-code flow with PKCE, started and completed
// entirely in the browser. The state/verifier pair survives the redirect to
// Google in sessionStorage, so the callback may run in the same tab only.

import { apiFetchStrict } from './api';
import type { Me } from '../state/AuthContext';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const VERIFIER_KEY = 'cb.google_pkce';
const STATE_KEY = 'cb.google_state';
const RETURN_KEY = 'cb.google_return';

export const googleClientId: string | undefined =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

export function isGoogleSignInEnabled(): boolean {
  return !!googleClientId;
}

function randomUrlSafe(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes).slice(0, length);
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function googleRedirectUri(): string {
  return `${window.location.origin}/auth/google/callback`;
}

export async function startGoogleSignIn(returnTo?: string): Promise<void> {
  if (!googleClientId) throw new Error('Google sign-in is not configured.');
  const verifier = randomUrlSafe(64);
  const state = randomUrlSafe(32);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  if (returnTo) sessionStorage.setItem(RETURN_KEY, returnTo);
  else sessionStorage.removeItem(RETURN_KEY);

  const challenge = await sha256Challenge(verifier);
  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  window.location.assign(`${AUTH_URL}?${params.toString()}`);
}

export interface GoogleCallbackInput {
  code?: string | null;
  state?: string | null;
  error?: string | null;
}

function consume(key: string): string | null {
  const value = sessionStorage.getItem(key);
  sessionStorage.removeItem(key);
  return value;
}

export interface GoogleAuthPayload {
  access: string;
  refresh: string;
  user: Me;
  created: boolean;
}

export type GoogleAuthResult =
  | { ok: true; data: GoogleAuthPayload; returnTo: string }
  | { ok: false; reason: string; returnTo: string };

export async function completeGoogleSignIn(input: GoogleCallbackInput): Promise<GoogleAuthResult> {
  const verifier = consume(VERIFIER_KEY);
  const expectedState = consume(STATE_KEY);
  const returnTo = consume(RETURN_KEY) || '/feed';

  if (input.error) {
    return { ok: false, reason: 'Google sign-in was cancelled or rejected.', returnTo };
  }
  if (!input.code || !input.state || input.state !== expectedState || !verifier) {
    return { ok: false, reason: 'The Google sign-in session expired. Please try again.', returnTo };
  }
  const data = await apiFetchStrict<GoogleAuthPayload>('/auth/google/', {
    method: 'POST',
    body: JSON.stringify({ code: input.code, code_verifier: verifier, redirect_uri: googleRedirectUri() }),
  });
  return { ok: true, data, returnTo };
}
