import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from './AuthContext';

export interface FeedAuthor {
  id: number;
  username: string;
  profile: {
    username: string;
    avatar: string;
    bio: string;
    post_count: number;
    followers_count: number;
    following_count: number;
    badge_count: number;
    badges: { code: string; name: string; description: string; icon: string }[];
  };
}

export interface FeedEquation {
  id: number;
  latex: string;
  description: string;
}

export interface FeedComment {
  id: number;
  post: number;
  parent: number | null;
  body: string;
  is_accepted: boolean;
  helpful_count: number;
  i_found_helpful: boolean;
  mine: boolean;
  author: FeedAuthor | null;
  replies: FeedComment[];
  is_deleted?: boolean;
  deleted_at?: string | null;
  created_at: string;
}

export interface FeedPost {
  id: number;
  author: FeedAuthor;
  title: string;
  body: string;
  subject: string;
  kind: string;
  is_solved: boolean;
  like_count: number;
  comment_count: number;
  equations: FeedEquation[];
  liked_by_me: boolean;
  created_at: string;
  comments?: FeedComment[];
}

export type FeedTab = 'following' | 'discover';

interface FeedContextValue {
  tab: FeedTab;
  posts: FeedPost[];
  loading: boolean;
  page: number;
  hasMore: boolean;
  setTab: (tab: FeedTab) => void;
  loadFeed: (tab: FeedTab, page?: number) => Promise<void>;
  loadMore: () => Promise<void>;
  toggleLike: (postId: number) => Promise<void>;
  toggleFollow: (username: string) => Promise<boolean>;
  isFollowing: (username: string) => boolean;
  addPost: (payload: { title: string; body: string; subject: string; kind: string; equations?: { latex: string; description?: string }[] }) => Promise<FeedPost | null>;
}

const FeedContext = createContext<FeedContextValue | null>(null);

interface RawPage {
  results: FeedPost[];
  next: string | null;
}

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [tab, setTabState] = useState<FeedTab>('discover');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [followState, setFollowState] = useState<Record<string, boolean>>({});
  const requestRef = useRef(0);

  const loadFeed = useCallback(
    async (nextTab: FeedTab, nextPage = 1) => {
      const requestId = ++requestRef.current;
      setLoading(true);
      const endpoint = nextTab === 'following' ? '/feed/following/' : '/feed/discover/';
      const data = await apiFetch<RawPage>(`${endpoint}?page=${nextPage}`);
      if (requestId !== requestRef.current) return;
      if (data) {
        setPosts((prev) => (nextPage === 1 ? data.results : [...prev, ...data.results]));
        setHasMore(!!data.next);
        setPage(nextPage);
        // Following feed implies we follow every author shown there
        if (nextTab === 'following') {
          setFollowState((prev) => {
            const next = { ...prev };
            for (const p of data.results) next[p.author.username] = true;
            return next;
          });
        }
      }
      setLoading(false);
    },
    [],
  );

  const setTab = useCallback(
    (nextTab: FeedTab) => {
      setTabState(nextTab);
      setPosts([]);
      void loadFeed(nextTab, 1);
    },
    [loadFeed],
  );

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    await loadFeed(tab, page + 1);
  }, [loading, hasMore, loadFeed, tab, page]);

  const toggleLike = useCallback(async (postId: number) => {
    // Optimistic flip — no reload
    const snapshot: { post: FeedPost | null } = { post: null };
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        snapshot.post = { ...p };
        const liked = !p.liked_by_me;
        return { ...p, liked_by_me: liked, like_count: Math.max(0, p.like_count + (liked ? 1 : -1)) };
      }),
    );
    const result = await apiFetch<{ liked: boolean; like_count: number }>(`/posts/${postId}/like/`, {
      method: 'POST',
    });
    if (result && typeof result.like_count === 'number') {
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, liked_by_me: result.liked, like_count: result.like_count } : p)),
      );
    } else if (snapshot.post) {
      const rb = snapshot.post;
      setPosts((prev) => prev.map((p) => (p.id === postId ? rb : p)));
    }
  }, []);

  const isFollowing = useCallback((username: string) => followState[username] ?? false, []);

  const toggleFollow = useCallback(
    async (username: string): Promise<boolean> => {
      const current = followState[username] ?? false;
      setFollowState((prev) => ({ ...prev, [username]: !current }));
      const result = current
        ? await apiFetch(`/auth/profiles/${username}/follow/`, { method: 'DELETE' })
        : await apiFetch<{ id: number }>(`/auth/profiles/${username}/follow/`, { method: 'POST' });
      if (result === null) {
        setFollowState((prev) => ({ ...prev, [username]: current }));
        return false;
      }
      return true;
    },
    [followState],
  );

  const addPost = useCallback(
    async (payload: {
      title: string;
      body: string;
      subject: string;
      kind: string;
      equations?: { latex: string; description?: string }[];
    }): Promise<FeedPost | null> => {
      const created = await apiFetch<FeedPost>('/posts/', { method: 'POST', body: JSON.stringify(payload) });
      if (created) {
        setPosts((prev) => [created, ...prev]);
      }
      return created;
    },
    [],
  );

  // When logged out, clear the following feed
  React.useEffect(() => {
    if (!isAuthenticated && tab === 'following') {
      setTab('discover');
    }
  }, [isAuthenticated, tab, setTab]);

  const value = useMemo(
    () => ({
      tab,
      posts,
      loading,
      page,
      hasMore,
      setTab,
      loadFeed,
      loadMore,
      toggleLike,
      toggleFollow,
      isFollowing,
      addPost,
    }),
    [tab, posts, loading, page, hasMore, setTab, loadFeed, loadMore, toggleLike, toggleFollow, isFollowing, addPost],
  );

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed(): FeedContextValue {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error('useFeed must be used inside <FeedProvider>');
  return ctx;
}
