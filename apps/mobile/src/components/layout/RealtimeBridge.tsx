// Invisible provider child: keeps /ws/notifications/ and /ws/messages/ open
// while authenticated, maps server events onto the query cache, and keeps the
// native push token registered. Reconnect itself is handled by useRealtime;
// the AppState/NetInfo refetch lives in online-manager.

import { useRouter } from 'expo-router';
import React from 'react';
import {
  attachNotificationResponseListener,
  registerForPushNotifications,
  unregisterPushToken,
} from '../../lib/nativePush';
import { q } from '../../lib/queries';
import { queryClient } from '../../lib/queryClient';
import { useRealtime } from '../../lib/realtime';
import { useAuth } from '../../state/AuthContext';

/** A dropped socket misses every event published while it was down. */
function useReconnectCatchUp(connected: boolean, keys: readonly (readonly unknown[])[]) {
  const dropped = React.useRef(false);
  React.useEffect(() => {
    if (!connected) {
      dropped.current = true;
      return;
    }
    if (!dropped.current) return;
    dropped.current = false;
    for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
  }, [connected, keys]);
}

const ACTIVITY_KEYS = [q.notifications] as const;
const CHAT_KEYS = [q.conversations, q.messagesUnread] as const;

export function RealtimeBridge() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    attachNotificationResponseListener((route) => router.push(route as never));
  }, [router]);

  React.useEffect(() => {
    if (isAuthenticated) void registerForPushNotifications();
    else void unregisterPushToken();
  }, [isAuthenticated]);

  const activity = useRealtime(isAuthenticated ? '/ws/notifications/' : null, ({ event }) => {
    if (event === 'notification.created' || event === 'notifications.read') {
      queryClient.invalidateQueries({ queryKey: q.notifications });
    }
  });

  const chat = useRealtime(isAuthenticated ? '/ws/messages/' : null, ({ event }) => {
    if (event === 'message.created' || event === 'message.read' || event === 'message.deleted' || event === 'conversation.unread') {
      queryClient.invalidateQueries({ queryKey: q.conversations });
      queryClient.invalidateQueries({ queryKey: q.messagesUnread });
    }
  });

  useReconnectCatchUp(activity.connected, ACTIVITY_KEYS);
  useReconnectCatchUp(chat.connected, CHAT_KEYS);

  return null;
}
