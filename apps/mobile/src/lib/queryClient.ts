// React Query setup with AsyncStorage persistence so the feed renders from
// cache on cold start (offline-first). Tokens never enter this cache —
// logout clears everything via clearAuthCache().

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient, type Persister } from '@tanstack/react-query-persist-client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const PERSIST_STORAGE_KEY = 'cb.reactQuery';

export const queryPersister: Persister = {
  persistClient: async (client) => {
    await AsyncStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify(client));
  },
  restoreClient: async () => {
    const raw = await AsyncStorage.getItem(PERSIST_STORAGE_KEY);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  },
  removeClient: async () => {
    await AsyncStorage.removeItem(PERSIST_STORAGE_KEY);
  },
};

export const QUERY_PERSIST_BUSTER = 'cb-mobile-v1';

let persistStarted = false;

export function startQueryPersistence(): void {
  if (persistStarted) return;
  persistStarted = true;
  persistQueryClient({
    queryClient,
    persister: queryPersister,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    buster: QUERY_PERSIST_BUSTER,
  });
}

export async function clearAuthCache(): Promise<void> {
  queryClient.clear();
  await queryPersister.removeClient();
}
