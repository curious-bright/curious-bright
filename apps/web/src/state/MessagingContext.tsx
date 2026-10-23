import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { useAuth } from './AuthContext';

export interface ChatUser {
  id: number;
  username: string;
  profile?: {
    avatar?: string;
    avatar_url?: string;
    subject_expertise?: string;
  };
}

export interface ChatMessage {
  id: number;
  conversation: number;
  sender: ChatUser;
  body: string;
  client_id?: string | null;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
  deleted: boolean;
}

export interface ConversationSummary {
  id: number;
  other_user: ChatUser;
  last_message: ChatMessage | null;
  unread_count: number;
  is_blocked: boolean;
  blocked_by_me: boolean;
  blocked_by_other: boolean;
  can_send: boolean;
  created_at: string;
  updated_at: string;
}

interface MessagingContextValue {
  conversations: ConversationSummary[];
  unreadTotal: number;
  loading: boolean;
  refresh: () => Promise<void>;
  startConversation: (username: string, message?: string) => Promise<number | null>;
}

const MessagingContext = createContext<MessagingContextValue | null>(null);

export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const refreshTimer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setConversations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await apiFetch<ConversationSummary[]>('/messages/conversations/');
    setConversations(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const scheduleRefresh = useCallback(() => {
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void refresh(), 180);
  }, [refresh]);

  useRealtime(isAuthenticated ? '/ws/messages/' : null, ({ event }) => {
    if (
      event === 'message.created' ||
      event === 'message.read' ||
      event === 'message.deleted' ||
      event === 'conversation.unread'
    ) {
      scheduleRefresh();
    }
  });

  useEffect(
    () => () => {
      window.clearTimeout(refreshTimer.current);
    },
    [],
  );

  const startConversation = useCallback(
    async (username: string, message?: string): Promise<number | null> => {
      const data = await apiFetch<ConversationSummary>('/messages/conversations/', {
        method: 'POST',
        body: JSON.stringify({ username, message: message || '' }),
      });
      if (!data?.id) return null;
      await refresh();
      return data.id;
    },
    [refresh],
  );

  const unreadTotal = useMemo(
    () => conversations.reduce((total, conversation) => total + (conversation.unread_count || 0), 0),
    [conversations],
  );

  const value = useMemo(
    () => ({ conversations, unreadTotal, loading, refresh, startConversation }),
    [conversations, unreadTotal, loading, refresh, startConversation],
  );

  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>;
}

export function useMessaging(): MessagingContextValue {
  const ctx = useContext(MessagingContext);
  if (!ctx) throw new Error('useMessaging must be used inside <MessagingProvider>');
  return ctx;
}
