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

  useRealtime(isAuthenticated ? '/ws/notifications/' : null, ({ event }) => {
    if (event === 'notification.created' || event === 'notifications.read') {
      queryClient.invalidateQueries({ queryKey: q.notifications });
    }
  });

  useRealtime(isAuthenticated ? '/ws/messages/' : null, ({ event }) => {
    if (event === 'message.created' || event === 'message.read' || event === 'message.deleted' || event === 'conversation.unread') {
      queryClient.invalidateQueries({ queryKey: q.conversations });
      queryClient.invalidateQueries({ queryKey: q.messagesUnread });
    }
  });

  return null;
}
