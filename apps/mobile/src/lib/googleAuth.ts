// Google sign-in for the native app: authorization-code + PKCE (S256) in the
// system browser, redirecting back to curiousbright://auth/google. The backend
// exchanges the code (it holds the client secret) and returns our JWT pair.

import * as AuthSession from 'expo-auth-session';
import { apiFetchStrict } from './api';
import type { GoogleAuthPayload } from './types';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export function isGoogleSignInEnabled(): boolean {
  return !!process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
}

export async function signInWithGoogle(): Promise<GoogleAuthPayload> {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured.');

  const redirectUri = AuthSession.makeRedirectUri({ path: 'auth/google' });
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: ['openid', 'email', 'profile'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    prompt: AuthSession.Prompt.SelectAccount,
    extraParams: { access_type: 'online' },
  });

  const result = await request.promptAsync({ authorizationEndpoint: AUTH_URL });
  if (result.type !== 'success') {
    throw new Error(result.type === 'cancel' ? 'Sign-in cancelled.' : 'Sign-in did not complete.');
  }

  const code = result.params.code;
  if (!code || result.params.state !== request.state) {
    throw new Error(result.params.error_description || 'Google returned an invalid response.');
  }
  if (!request.codeVerifier) {
    throw new Error('PKCE verifier is missing. Please try again.');
  }

  return apiFetchStrict<GoogleAuthPayload>('/auth/google/', {
    method: 'POST',
    body: JSON.stringify({ code, code_verifier: request.codeVerifier, redirect_uri: redirectUri }),
  });
}
