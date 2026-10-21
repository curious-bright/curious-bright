import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { useAuth } from './AuthContext';

export interface Notification {
  id: number;
  actor: { id: number; username: string; profile?: { avatar: string } } | null;
  verb: string;
  text: string;
  post: number | null;
  comment: number | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  load: () => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const seenRef = useRef<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    const data = await apiFetch<{ results: Notification[] }>('/notifications/?page_size=50');
    if (data?.results) {
      setNotifications(data.results);
      seenRef.current = new Set(data.results.map((n) => n.id));
    }
    setLoading(false);
  }, [isAuthenticated]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await apiFetch('/notifications/read-all/', { method: 'POST' });
  }, []);

  // Initial load, then real-time delivery over WebSockets.
  useEffect(() => {
    void load();
  }, [isAuthenticated, load]);

  const { connected } = useRealtime(isAuthenticated ? '/ws/notifications/' : null, ({ event, data }) => {
    if (event === 'notification.created') {
      const incoming = data as Notification;
      if (seenRef.current.has(incoming.id)) return;
      seenRef.current.add(incoming.id);
      setNotifications((prev) => [incoming, ...prev]);
    } else if (event === 'notifications.read') {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  });

  const wasConnected = useRef(false);
  useEffect(() => {
    if (connected && wasConnected.current) {
      // Catch anything missed while the socket was down.
      void load();
    }
    wasConnected.current = connected;
  }, [connected, load]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  const value = useMemo(
    () => ({ notifications, unreadCount, loading, load, markAllRead }),
    [notifications, unreadCount, loading, load, markAllRead],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationProvider>');
  return ctx;
}
