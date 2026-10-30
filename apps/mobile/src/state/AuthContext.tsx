import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const lastRefreshRef = useRef(0);

  const refreshMe = useCallback(async (force = false) => {
    if (!getAccessToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    if (!force && Date.now() - lastRefreshRef.current < 15000) return;
    lastRefreshRef.current = Date.now();
    const data = await apiFetch<Me>('/auth/me/');
    if (data) {
      setUser(data);
    } else {
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadTokens().then(() => refreshMe(true));
  }, [refreshMe]);

  const login = useCallback(async (identifier: string, password: string): Promise<Me> => {
    try {
      const data = await apiFetchStrict<{ access: string; refresh: string }>('/auth/token/', {
        method: 'POST',
        body: JSON.stringify({ username: identifier, password }),
      });
      setTokens(data.access, data.refresh);
      const me = await apiFetchStrict<Me>('/auth/me/');
      setUser(me);
      setLoading(false);
      return me;
    } catch (error) {
      clearTokens();
      setUser(null);
      throw error;
    }
  }, []);

  const setGoogleSession = useCallback(async (payload: GoogleAuthPayload): Promise<Me> => {
    try {
      setTokens(payload.access, payload.refresh);
      const me = await apiFetchStrict<Me>('/auth/me/');
      setUser(me);
      setLoading(false);
      return me;
    } catch (error) {
      clearTokens();
      setUser(null);
      throw error;
    }
  }, []);

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
    setTokens(data.access, data.refresh);
    setUser(data.user);
    setLoading(false);
    return data.user;
  }, []);

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
    setUser((current) => (current ? { ...current, consent: data.consent } : current));
    return data.consent;
  }, []);

  const logout = useCallback(async () => {
    const refresh = getRefreshToken();
    if (refresh && getAccessToken()) {
      await apiVoid('/auth/logout/', { method: 'POST', body: JSON.stringify({ refresh }) });
    }
    clearTokens();
    setUser(null);
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
      setUser(updated);
      return true;
    },
    [],
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
