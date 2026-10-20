import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, clearTokens, getAccessToken, getRefreshToken, setTokens } from '../lib/api';

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
    subject_expertise: string;
    post_count: number;
    followers_count: number;
    following_count: number;
    badge_count: number;
    badges: BadgeInfo[];
    created_at: string;
  };
}

interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  updateProfile: (patch: Partial<{ bio: string; avatar: string; subject_expertise: string }>) => Promise<void>;
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
    async (identifier: string, password: string): Promise<boolean> => {
      const data = await apiFetch<{ access: string; refresh: string }>('/auth/token/', {
        method: 'POST',
        body: JSON.stringify({ username: identifier, password }),
      });
      if (!data?.access) return false;
      setTokens(data.access, data.refresh);
      await refreshMe();
      return true;
    },
    [refreshMe],
  );

  const register = useCallback(
    async (username: string, email: string, password: string): Promise<boolean> => {
      const created = await apiFetch<{ id: number }>('/auth/register/', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      });
      if (!created) return false;
      return login(username, password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    const refresh = getRefreshToken();
    if (refresh && getAccessToken()) {
      await apiFetch('/auth/logout/', { method: 'POST', body: JSON.stringify({ refresh }) });
    }
    clearTokens();
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<{ bio: string; avatar: string; subject_expertise: string }>) => {
      const updated = await apiFetch<Me>('/auth/me/', { method: 'PATCH', body: JSON.stringify(patch) });
      if (updated) setUser(updated);
    },
    [],
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
    }),
    [user, loading, login, register, logout, refreshMe, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
