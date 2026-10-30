// React Query setup with AsyncStorage persistence so the feed renders from
// cache on cold start (offline-first). Tokens never enter this cache —
// logout clears everything via clearAuthCache().

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, type Query } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
  type PersistedClient,
  type Persister,
} from '@tanstack/react-query-persist-client';

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
// The AuthContext session mirror lives in the same store so one wipe removes
// every trace of the previous account.
const ME_STORAGE_KEY = 'cb.me';
// One AsyncStorage write per burst of cache events instead of one per event:
// a single feed refresh touches dozens of queries and each write serialises
// the whole cache.
const SAVE_DEBOUNCE_MS = 1_200;
// Cold start only needs enough scrollback to feel instant; deeper pages are
// refetched on demand.
const MAX_PERSISTED_PAGES = 4;

export const queryPersister: Persister = {
  persistClient: async (client) => {
    await AsyncStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify(trimPages(client)));
  },
  restoreClient: async () => {
    const raw = await AsyncStorage.getItem(PERSIST_STORAGE_KEY);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as PersistedClient;
    } catch {
      return undefined;
    }
  },
  removeClient: async () => {
    await AsyncStorage.removeItem(PERSIST_STORAGE_KEY);
  },
};

export const QUERY_PERSIST_BUSTER = 'cb-mobile-v1';

/** Transient keys: typed-as-you-go search results are never worth storing. */
const VOLATILE_ROOTS = new Set(['search']);

function shouldPersist(query: Query): boolean {
  return query.state.status === 'success' && !VOLATILE_ROOTS.has(String(query.queryKey[0]));
}

const dehydrateOptions = {
  shouldDehydrateQuery: shouldPersist,
  // Mutations are mid-flight work, not data: persisting them replays a send
  // that already happened after a restart.
  shouldDehydrateMutation: () => false,
};

/**
 * Drops persisted mutations and all but the first pages of infinite queries.
 * Truncating from the end keeps page 1..N intact, so the next fetch continues
 * from the page the stored list actually ended at.
 */
function trimPages(client: PersistedClient): PersistedClient {
  const queries = (client.clientState.queries ?? []).map((entry) => {
    const state = entry?.state as { data?: { pages?: unknown[]; pageParams?: unknown[] } } | undefined;
    const pages = state?.data?.pages;
    if (!Array.isArray(pages) || pages.length <= MAX_PERSISTED_PAGES) return entry;
    const trimmed = { ...state!.data, pages: pages.slice(0, MAX_PERSISTED_PAGES) };
    if (Array.isArray(state!.data?.pageParams)) {
      trimmed.pageParams = state!.data!.pageParams!.slice(0, MAX_PERSISTED_PAGES);
    }
    return { ...entry, state: { ...entry.state, data: trimmed } };
  });
  return { ...client, clientState: { queries, mutations: [] } };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let stopSubscriptions: (() => void) | null = null;
let restorePromise: Promise<void> | null = null;

function saveNow(): void {
  void persistQueryClientSave({
    queryClient,
    persister: queryPersister,
    buster: QUERY_PERSIST_BUSTER,
    dehydrateOptions,
  });
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, SAVE_DEBOUNCE_MS);
}

function cancelPendingSave(): void {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
}

function watchCache(): void {
  if (stopSubscriptions) return;
  const offs = [queryClient.getQueryCache().subscribe(scheduleSave), queryClient.getMutationCache().subscribe(scheduleSave)];
  stopSubscriptions = () => offs.forEach((off) => off());
}

/**
 * Restores the stored cache into memory and starts persisting changes.
 * Resolves once restoration has finished (or failed) so the first render can
 * wait for cached data instead of flashing empty screens.
 */
export function startQueryPersistence(): Promise<void> {
  if (!restorePromise) {
    watchCache();
    restorePromise = persistQueryClientRestore({
      queryClient,
      persister: queryPersister,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      buster: QUERY_PERSIST_BUSTER,
    }).catch(() => undefined);
  }
  return restorePromise;
}

export async function clearAuthCache(): Promise<void> {
  // A login can land while the cold-start restore is still reading storage;
  // clearing before it finishes would let that older blob hydrate afterwards.
  if (restorePromise) await restorePromise;
  cancelPendingSave();
  stopSubscriptions?.();
  stopSubscriptions = null;
  queryClient.clear();
  await Promise.all([
    queryPersister.removeClient(),
    AsyncStorage.removeItem(ME_STORAGE_KEY),
  ]);
  watchCache();
}
