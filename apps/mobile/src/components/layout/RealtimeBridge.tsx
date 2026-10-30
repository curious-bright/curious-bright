// Invisible provider child: keeps /ws/notifications/ open while authenticated
// and maps server events onto the query cache. Reconnect itself is handled by
// useRealtime; the AppState/NetInfo refetch lives in online-manager.

import React from 'react';
import { q } from '../../lib/queries';
import { queryClient } from '../../lib/queryClient';
import { useRealtime } from '../../lib/realtime';
import { useAuth } from '../../state/AuthContext';

export function RealtimeBridge() {
  const { isAuthenticated } = useAuth();

  useRealtime(isAuthenticated ? '/ws/notifications/' : null, ({ event }) => {
    if (event === 'notification.created' || event === 'notifications.read') {
      queryClient.invalidateQueries({ queryKey: q.notifications });
    }
  });

  return null;
}
