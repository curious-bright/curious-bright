import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, apiVoid, clearTokens, getAccessToken, getRefreshToken, setTokens } from '../lib/api';

export interface BadgeInfo {
  code: string;
  name: string;
  description: string;
  icon: string;
  awarded_at?: string;
}

export interface Me {
  id: number;
  username: string;
  email: string;
  profile: {
    username: string;
    email: string;
    bio: string;
    avatar: string;
    avatar_url?: string;
    subject_expertise: string;
    country: string;
    school: string;
    post_count: number;
    followers_count: number;
    following_count: number;
    badge_count: number;
    badges: BadgeInfo[];
    created_at: string;
  };
  is_moderator: boolean;
  can_moderate: boolean;
  must_change_password: boolean;
}

export type ProfilePatch = Partial<{
  bio: string;
  avatar: string;
  subject_expertise: string;
  country: string;
  school: string;
}>;

interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<Me | null>;
  register: (username: string, email: string, password: string) => Promise<Me | null>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  updateProfile: (patch: ProfilePatch, avatarFile?: File | null) => Promise<boolean>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState<boolean>(!!getAccessToken());

  const refreshMe = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    const data = await apiFetch<Me>('/auth/me/');
    if (data) {
      setUser(data);
      localStorage.setItem('user', JSON.stringify({ id: data.id, name: data.username, email: data.email }));
    } else {
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const login = useCallback(
    async (identifier: string, password: string): Promise<Me | null> => {
      const data = await apiFetch<{ access: string; refresh: string }>('/auth/token/', {
        method: 'POST',
        body: JSON.stringify({ username: identifier, password }),
      });
      if (!data?.access) return null;
      setTokens(data.access, data.refresh);
      const me = await apiFetch<Me>('/auth/me/');
      if (!me) {
        clearTokens();
        setUser(null);
        return null;
      }
      setUser(me);
      setLoading(false);
      localStorage.setItem('user', JSON.stringify({ id: me.id, name: me.username, email: me.email }));
      return me;
    },
    [],
  );

  const register = useCallback(
    async (username: string, email: string, password: string): Promise<Me | null> => {
      const created = await apiFetch<{ id: number }>('/auth/register/', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      });
      if (!created) return null;
      return login(username, password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    const refresh = getRefreshToken();
    if (refresh && getAccessToken()) {
      // A revoked/expired token must never prevent the local sign-out.
      await apiVoid('/auth/logout/', { method: 'POST', body: JSON.stringify({ refresh }) });
    }
    clearTokens();
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (patch: ProfilePatch, avatarFile?: File | null): Promise<boolean> => {
      let body: BodyInit;
      if (avatarFile) {
        const form = new FormData();
        for (const [key, value] of Object.entries(patch)) {
          if (value !== undefined) form.append(key, value);
        }
        form.append('avatar_file', avatarFile);
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
      if (ok) await refreshMe();
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
      register,
      logout,
      refreshMe,
      updateProfile,
      changePassword,
    }),
    [user, loading, login, register, logout, refreshMe, updateProfile, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
