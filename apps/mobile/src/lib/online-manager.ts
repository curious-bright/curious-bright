// Bridges NetInfo + AppState to React Query: offline mutations pause until
// reconnect, and returning to foreground invalidates queries so cached-first
// screens refresh without a manual pull.

import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';
import { queryClient } from './queryClient';

export function startOnlineManager(): () => void {
  onlineManager.setEventListener((setQueryStatus) => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const reachable = state.isConnected === true && state.isInternetReachable !== false;
      setQueryStatus(reachable);
      if (reachable) void queryClient.resumePausedMutations();
    });
    return unsubscribe;
  });

  const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') queryClient.invalidateQueries();
  });

  return () => {
    onlineManager.setEventListener(() => () => {});
    appStateSub.remove();
  };
}
