import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  apiFetch,
  apiFetchStrict,
  apiVoid,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  loadTokens,
  setTokens,
} from '../lib/api';
import { clearAuthCache } from '../lib/queryClient';
import type {
  ConsentState,
  GoogleAuthPayload,
  Me,
  ProfilePatch,
  RegisterResult,
  VerifyEmailResult,
} from '../lib/types';

interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<Me>;
  setGoogleSession: (payload: GoogleAuthPayload) => Promise<Me>;
  register: (
    username: string,
    email: string,
    password: string,
    acceptTerms: boolean,
    acceptPrivacy: boolean,
  ) => Promise<RegisterResult>;
  verifyEmail: (email: string, code: string) => Promise<Me>;
  resendVerification: (email: string) => Promise<boolean>;
  requestPasswordReset: (email: string) => Promise<boolean>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<boolean>;
  acceptPolicies: (acceptTerms: boolean, acceptPrivacy: boolean) => Promise<ConsentState>;
  logout: () => Promise<void>;
  refreshMe: (force?: boolean) => Promise<void>;
  updateProfile: (
    patch: ProfilePatch,
    avatarFile?: { uri: string; name: string; type: string } | null,
  ) => Promise<boolean>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// A copy of /auth/me/ kept outside the query cache so an offline cold start
// still knows who is signed in. Tokens stay in SecureStore; the e-mail address
// here is cleared on wipe by clearAuthCache(), which owns this key too.
const ME_CACHE_KEY = 'cb.me';

async function rememberMe(me: Me | null): Promise<void> {
  try {
    if (me) await AsyncStorage.setItem(ME_CACHE_KEY, JSON.stringify(me));
    else await AsyncStorage.removeItem(ME_CACHE_KEY);
  } catch {
    // Storage hiccups only cost the offline session, never the live one.
  }
}

async function storedMe(): Promise<Me | null> {
  try {
    const raw = await AsyncStorage.getItem(ME_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const lastRefreshRef = useRef(0);

  const applyMe = useCallback((me: Me) => {
    setUser(me);
    void rememberMe(me);
  }, []);

  const userRef = useRef<Me | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const patchMe = useCallback(
    (mutate: (current: Me) => Me) => {
      const current = userRef.current;
      if (current) applyMe(mutate(current));
    },
    [applyMe],
  );

  const refreshMe = useCallback(async (force = false) => {
    if (!getAccessToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    if (!force && Date.now() - lastRefreshRef.current < 15000) return;
    lastRefreshRef.current = Date.now();
    try {
      applyMe(await apiFetchStrict<Me>('/auth/me/'));
    } catch (error) {
      // Offline still counts as signed in: the stored session and cached
      // content render, and queued mutations resume on reconnect.
      if (error instanceof ApiError && error.code === 'network_error') {
        const cached = await storedMe();
        if (cached) setUser((current) => current ?? cached);
        else void rememberMe(null); // no mirror for this token set at all
        return;
      }
      clearTokens();
      setUser(null);
      void rememberMe(null);
      void clearAuthCache();
    } finally {
      setLoading(false);
    }
  }, [applyMe]);

  const startSession = useCallback(async (access: string, refresh: string): Promise<Me> => {
    // Any cache from a previous account must not leak into this session.
    await clearAuthCache();
    setTokens(access, refresh);
    const me = await apiFetchStrict<Me>('/auth/me/');
    applyMe(me);
    setLoading(false);
    return me;
  }, [applyMe]);

  useEffect(() => {
    void loadTokens().then(() => refreshMe(true));
  }, [refreshMe]);

  const login = useCallback(
    async (identifier: string, password: string): Promise<Me> => {
      try {
        const data = await apiFetchStrict<{ access: string; refresh: string }>('/auth/token/', {
          method: 'POST',
          body: JSON.stringify({ username: identifier, password }),
        });
        return await startSession(data.access, data.refresh);
      } catch (error) {
        clearTokens();
        setUser(null);
        void rememberMe(null);
        throw error;
      }
    },
    [startSession],
  );

  const setGoogleSession = useCallback(
    async (payload: GoogleAuthPayload): Promise<Me> => {
      try {
        return await startSession(payload.access, payload.refresh);
      } catch (error) {
        clearTokens();
        setUser(null);
        void rememberMe(null);
        throw error;
      }
    },
    [startSession],
  );

  const register = useCallback(
    async (
      username: string,
      email: string,
      password: string,
      acceptTerms: boolean,
      acceptPrivacy: boolean,
    ): Promise<RegisterResult> => {
      return apiFetchStrict<RegisterResult>('/auth/register/', {
        method: 'POST',
        body: JSON.stringify({
          username,
          email,
          password,
          accept_terms: acceptTerms,
          accept_privacy: acceptPrivacy,
        }),
      });
    },
    [],
  );

  const verifyEmail = useCallback(async (email: string, code: string): Promise<Me> => {
    const data = await apiFetchStrict<VerifyEmailResult>('/auth/verify-email/', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
    await clearAuthCache();
    setTokens(data.access, data.refresh);
    applyMe(data.user);
    setLoading(false);
    return data.user;
  }, [applyMe]);

  const resendVerification = useCallback(async (email: string): Promise<boolean> => {
    return apiVoid('/auth/resend-verification/', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<boolean> => {
    return apiVoid('/auth/password-reset/', { method: 'POST', body: JSON.stringify({ email }) });
  }, []);

  const resetPassword = useCallback(
    async (email: string, code: string, newPassword: string): Promise<boolean> => {
      return apiVoid('/auth/password-reset/confirm/', {
        method: 'POST',
        body: JSON.stringify({ email, code, new_password: newPassword }),
      });
    },
    [],
  );

  const acceptPolicies = useCallback(async (acceptTerms: boolean, acceptPrivacy: boolean) => {
    const data = await apiFetchStrict<{ consent: ConsentState }>('/auth/consent/', {
      method: 'POST',
      body: JSON.stringify({ accept_terms: acceptTerms, accept_privacy: acceptPrivacy }),
    });
    patchMe((current) => ({ ...current, consent: data.consent }));
    return data.consent;
  }, [patchMe]);

  const logout = useCallback(async () => {
    const refresh = getRefreshToken();
    if (refresh && getAccessToken()) {
      await apiVoid('/auth/logout/', { method: 'POST', body: JSON.stringify({ refresh }) });
    }
    clearTokens();
    setUser(null);
    void rememberMe(null);
    await clearAuthCache();
  }, []);

  const updateProfile = useCallback(
    async (
      patch: ProfilePatch,
      avatarFile?: { uri: string; name: string; type: string } | null,
    ): Promise<boolean> => {
      let body: BodyInit;
      if (avatarFile) {
        const form = new FormData();
        for (const [key, value] of Object.entries(patch)) {
          if (value !== undefined) form.append(key, String(value));
        }
        form.append('avatar', avatarFile as unknown as Blob);
        body = form;
      } else {
        body = JSON.stringify(patch);
      }
      const updated = await apiFetch<Me>('/auth/me/', { method: 'PATCH', body });
      if (!updated) return false;
      applyMe(updated);
      return true;
    },
    [applyMe],
  );

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string): Promise<boolean> => {
      const ok = await apiVoid('/auth/change-password/', {
        method: 'POST',
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      if (ok) await refreshMe(true);
      return ok;
    },
    [refreshMe],
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      login,
      setGoogleSession,
      register,
      verifyEmail,
      resendVerification,
      requestPasswordReset,
      resetPassword,
      acceptPolicies,
      logout,
      refreshMe,
      updateProfile,
      changePassword,
    }),
    [
      user,
      loading,
      login,
      setGoogleSession,
      register,
      verifyEmail,
      resendVerification,
      requestPasswordReset,
      resetPassword,
      acceptPolicies,
      logout,
      refreshMe,
      updateProfile,
      changePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
