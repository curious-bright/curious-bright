// Google sign-in for the native app: authorization-code + PKCE (S256) in the
// system browser. Google only accepts https redirect URIs, so the browser
// lands on the web app's relay page, which reopens the app at
// curiousbright://auth/google with the code. The backend exchanges the code
// (it holds the client secret) and returns our JWT pair.

import * as AuthSession from 'expo-auth-session';
import { apiFetchStrict } from './api';
import type { GoogleAuthPayload } from './types';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// Must be registered verbatim under "Authorized redirect URIs" in Google
// Cloud Console. Override for previews (e.g. a branch deployment).
const RELAY_ORIGIN =
  process.env.EXPO_PUBLIC_GOOGLE_RELAY_ORIGIN || 'https://app.curiousbright.com.ng';
const RELAY_PATH = '/auth/google/mobile';

export function isGoogleSignInEnabled(): boolean {
  return !!process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
}

export async function signInWithGoogle(): Promise<GoogleAuthPayload> {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured.');

  // Google only accepts the https relay URI as redirect. The relay page then
  // reopens this app at the custom-scheme deep link, which Google never sees.
  const relayUri = `${RELAY_ORIGIN}${RELAY_PATH}`;
  const nativeReturn = AuthSession.makeRedirectUri({ path: 'auth/google' });
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri: relayUri,
    scopes: ['openid', 'email', 'profile'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    prompt: AuthSession.Prompt.SelectAccount,
    extraParams: { access_type: 'online' },
  });

  const result = await request.promptAsync({ authorizationEndpoint: AUTH_URL }, { url: nativeReturn });
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
    body: JSON.stringify({ code, code_verifier: request.codeVerifier, redirect_uri: relayUri }),
  });
}
