// Conversation mutations shared by the Chat tab, threads and profiles.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetchStrict, apiVoid } from '../lib/api';
import { q } from '../lib/queries';
import type { ConversationSummary } from '../lib/types';

/** Create-or-reuse a conversation with a username, then open the thread. */
export function useStartConversation(onStarted?: (id: number) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) =>
      apiFetchStrict<ConversationSummary>('/messages/conversations/', {
        method: 'POST',
        body: JSON.stringify({ username }),
      }),
    onSuccess: (summary) => {
      qc.invalidateQueries({ queryKey: q.conversations });
      if (summary?.id) onStarted?.(summary.id);
    },
  });
}

export function useMarkConversationRead(conversationId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiVoid(`/messages/conversations/${conversationId}/read/`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: q.conversations });
      qc.invalidateQueries({ queryKey: q.messagesUnread });
    },
  });
}
