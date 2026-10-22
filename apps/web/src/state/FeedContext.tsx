import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, apiVoid } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { useAuth } from './AuthContext';

export type PostVisibility = 'public' | 'followers' | 'room_only';

export interface FeedAuthor {
  id: number;
  username: string;
  profile: {
    username: string;
    avatar: string;
    bio: string;
    subject_expertise?: string;
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
  can_edit?: boolean;
  can_delete?: boolean;
  is_edited?: boolean;
  edited_at?: string | null;
  updated_at?: string;
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
  academic_level?: string;
  visibility: PostVisibility;
  visibility_label?: string;
  room: number | null;
  room_name?: string | null;
  organization: number | null;
  organization_slug?: string | null;
  is_solved: boolean;
  review_status?: string;
  attachment_url?: string | null;
  attachment_name?: string;
  like_count: number;
  comment_count: number;
  equations: FeedEquation[];
  liked_by_me: boolean;
  is_following_author?: boolean;
  mine?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
  is_edited?: boolean;
  edited_at?: string | null;
  updated_at?: string;
  created_at: string;
  comments?: FeedComment[];
}

export interface PostInput {
  title: string;
  body: string;
  subject: string;
  kind: string;
  visibility?: PostVisibility;
  room?: number | null;
  equations?: { latex: string; description?: string }[];
}

export type FeedTab = 'following' | 'discover';

interface PendingUndo {
  post: FeedPost;
  expiresAt: number;
}

interface FeedContextValue {
  tab: FeedTab;
  posts: FeedPost[];
  loading: boolean;
  page: number;
  hasMore: boolean;
  pendingUndo: PendingUndo | null;
  setTab: (tab: FeedTab) => void;
  loadFeed: (tab: FeedTab, page?: number) => Promise<void>;
  loadMore: () => Promise<void>;
  toggleLike: (postId: number) => Promise<void>;
  toggleFollow: (username: string, currentOverride?: boolean) => Promise<boolean>;
  isFollowing: (username: string) => boolean;
  followStatus: (username: string) => boolean | undefined;
  addPost: (payload: PostInput) => Promise<FeedPost | null>;
  updatePost: (postId: number, payload: Partial<PostInput> & { expected_updated_at?: string }) => Promise<FeedPost | null>;
  deletePost: (postId: number, fallback?: FeedPost) => Promise<boolean>;
  undoDelete: () => Promise<FeedPost | null>;
  dismissUndo: () => void;
}

const UNDO_VISIBLE_MS = 30_000;

const FeedContext = createContext<FeedContextValue | null>(null);

interface RawPage {
  results: FeedPost[];
  next: string | null;
}

function updateFollowFlag(post: FeedPost, username: string, following: boolean): FeedPost {
  if (post.author.username !== username) return post;
  return { ...post, is_following_author: following };
}

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [tab, setTabState] = useState<FeedTab>('discover');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [followState, setFollowState] = useState<Record<string, boolean>>({});
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const requestRef = useRef(0);
  const ownerRef = useRef<number | null | undefined>(undefined);
  const undoTimer = useRef<number | undefined>(undefined);
  const inFlightRef = useRef<Map<string, Promise<void>>>(new Map());

  const clearPendingUndo = useCallback(() => {
    window.clearTimeout(undoTimer.current);
    setPendingUndo(null);
  }, []);

  const loadFeed = useCallback(
    (nextTab: FeedTab, nextPage = 1): Promise<void> => {
      // React StrictMode, auth hydration and a page remount can all ask for the
      // same first page at once. Share the in-flight request instead of
      // hitting the API twice and replacing the list mid-render.
      const key = `${nextTab}:${nextPage}`;
      const existing = inFlightRef.current.get(key);
      if (existing) return existing;

      const requestId = ++requestRef.current;
      const endpoint = nextTab === 'following' ? '/feed/following/' : '/feed/discover/';
      setLoading(true);

      const task = (async () => {
        const data = await apiFetch<RawPage>(`${endpoint}?page=${nextPage}`);
        if (requestId !== requestRef.current) return;
        if (data) {
          setPosts((prev) => (nextPage === 1 ? data.results : [...prev, ...data.results]));
          setHasMore(!!data.next);
          setPage(nextPage);
          setFollowState((prev) => {
            const next = { ...prev };
            for (const post of data.results) {
              next[post.author.username] = nextTab === 'following' ? true : !!post.is_following_author;
            }
            return next;
          });
        }
        setLoading(false);
      })().finally(() => {
        // Only remove our own entry: an account change may have cleared the
        // map and registered a fresh request under the same key.
        if (inFlightRef.current.get(key) === task) inFlightRef.current.delete(key);
      });

      inFlightRef.current.set(key, task);
      return task;
    },
    [],
  );

  const setTab = useCallback(
    (nextTab: FeedTab) => {
      setTabState(nextTab);
      setPosts([]);
      setHasMore(false);
      setPage(1);
      void loadFeed(nextTab, 1);
    },
    [loadFeed],
  );

  // A different account (or a sign-out) must never inherit the previous
  // member's posts, follow flags or undo buffer.
  useEffect(() => {
    const userId = user?.id ?? null;
    if (ownerRef.current === userId) return;
    const firstRun = ownerRef.current === undefined;
    ownerRef.current = userId;
    requestRef.current += 1;
    inFlightRef.current.clear();
    setPosts([]);
    setFollowState({});
    setPage(1);
    setHasMore(false);
    setLoading(!!userId);
    clearPendingUndo();
    if (!userId) {
      setTabState('discover');
    }
    // The Feed page owns the very first anonymous request. Every later account
    // change (sign-in, sign-out, switching members) reloads the feed here,
    // even if the member is currently on another page.
    if (!firstRun) {
      void loadFeed('discover', 1);
    }
  }, [user?.id, loadFeed, clearPendingUndo]);

  const belongsInTab = useCallback(
    (post: FeedPost, targetTab: FeedTab): boolean => {
      const published = !post.review_status || post.review_status === 'published';
      if (!published) return false;
      if (targetTab === 'discover') return post.visibility === 'public';
      const mine = post.mine ?? post.author.username === user?.username;
      return !!mine || (followState[post.author.username] ?? !!post.is_following_author);
    },
    [followState, user?.username],
  );

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    await loadFeed(tab, page + 1);
  }, [loading, hasMore, loadFeed, tab, page]);

  const toggleLike = useCallback(async (postId: number) => {
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
      const rollback = snapshot.post;
      setPosts((prev) => prev.map((p) => (p.id === postId ? rollback : p)));
    }
  }, []);

  const isFollowing = useCallback(
    (username: string) => followState[username] ?? false,
    [followState],
  );

  const followStatus = useCallback(
    (username: string): boolean | undefined => followState[username],
    [followState],
  );

  const toggleFollow = useCallback(
    async (username: string, currentOverride?: boolean): Promise<boolean> => {
      const current = currentOverride ?? followState[username] ?? false;
      const next = !current;
      setFollowState((prev) => ({ ...prev, [username]: next }));
      setPosts((prev) => prev.map((p) => updateFollowFlag(p, username, next)));

      const ok = current
        ? await apiVoid(`/auth/profiles/${username}/follow/`, { method: 'DELETE' })
        : !!(await apiFetch<{ id: number }>(`/auth/profiles/${username}/follow/`, { method: 'POST' }));

      if (!ok) {
        setFollowState((prev) => ({ ...prev, [username]: current }));
        setPosts((prev) => prev.map((p) => updateFollowFlag(p, username, current)));
        return current;
      }

      if (!next) {
        // Unfollowing removes that author from the following feed, but the
        // member's own posts stay (they are always in their own feed).
        setPosts((prev) =>
          prev.filter((p) => p.author.username !== username || p.mine),
        );
      }
      return next;
    },
    [followState],
  );

  const addPost = useCallback(async (payload: PostInput): Promise<FeedPost | null> => {
    const created = await apiFetch<FeedPost>('/posts/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (created && belongsInTab(created, tab)) {
      setPosts((prev) => (prev.some((p) => p.id === created.id) ? prev : [created, ...prev]));
    }
    return created;
  }, [belongsInTab, tab]);

  const updatePost = useCallback(
    async (postId: number, payload: Partial<PostInput> & { expected_updated_at?: string }): Promise<FeedPost | null> => {
      const updated = await apiFetch<FeedPost>(`/posts/${postId}/`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (updated) {
        setPosts((prev) => {
          const exists = prev.some((p) => p.id === postId);
          if (!belongsInTab(updated, tab)) return prev.filter((p) => p.id !== postId);
          if (!exists) return [updated, ...prev];
          return prev.map((p) => (p.id === postId ? updated : p));
        });
      }
      return updated;
    },
    [belongsInTab, tab],
  );

  const dismissUndo = useCallback(() => {
    clearPendingUndo();
  }, [clearPendingUndo]);

  const deletePost = useCallback(
    async (postId: number, fallback?: FeedPost): Promise<boolean> => {
      const snapshot = posts.find((p) => p.id === postId) || fallback;
      const ok = await apiVoid(`/posts/${postId}/`, { method: 'DELETE' });
      if (!ok) return false;

      setPosts((prev) => prev.filter((p) => p.id !== postId));
      if (snapshot) {
        window.clearTimeout(undoTimer.current);
        const entry: PendingUndo = { post: snapshot, expiresAt: Date.now() + UNDO_VISIBLE_MS };
        setPendingUndo(entry);
        undoTimer.current = window.setTimeout(() => {
          setPendingUndo((current) => (current === entry ? null : current));
        }, UNDO_VISIBLE_MS);
      }
      return true;
    },
    [posts],
  );

  const undoDelete = useCallback(async (): Promise<FeedPost | null> => {
    const entry = pendingUndo;
    if (!entry) return null;
    const restored = await apiFetch<FeedPost>(`/posts/${entry.post.id}/restore/`, { method: 'POST' });
    if (!restored) {
      clearPendingUndo();
      return null;
    }
    setPosts((prev) => {
      if (prev.some((p) => p.id === restored.id)) return prev;
      return belongsInTab(restored, tab) ? [restored, ...prev] : prev;
    });
    clearPendingUndo();
    return restored;
  }, [pendingUndo, clearPendingUndo, belongsInTab, tab]);

  const applyRealtime = useCallback(
    ({ event, data }: { event: string; data: any }) => {
      if (event === 'post.created' || event === 'post.updated') {
        const incoming = data as FeedPost;
        const visible = belongsInTab(incoming, tab);

        setPosts((prev) => {
          const exists = prev.some((p) => p.id === incoming.id);
          if (!visible) return prev.filter((p) => p.id !== incoming.id);
          if (!exists) return [incoming, ...prev];
          return prev.map((p) => (p.id === incoming.id ? incoming : p));
        });
        return;
      }
      if (event === 'post.deleted') {
        const id = (data as { id: number }).id;
        setPosts((prev) => prev.filter((p) => p.id !== id));
        setPendingUndo((current) => (current?.post.id === id ? null : current));
        return;
      }
      if (event === 'post.like_count') {
        const { id: postId, like_count } = data as { id: number; like_count: number };
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, like_count } : p)));
        return;
      }
      if (event === 'post.solved') {
        const { id: postId, is_solved } = data as { id: number; is_solved: boolean };
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, is_solved } : p)));
        return;
      }
      if (event === 'comment.created' || event === 'comment.deleted') {
        const payload = data as { comment_count?: number };
        const postId = event === 'comment.created'
          ? (data as { comment?: { post?: number } }).comment?.post
          : (data as { post?: number }).post;
        if (postId && typeof payload.comment_count === 'number') {
          setPosts((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, comment_count: payload.comment_count! } : p)),
          );
        }
      }
    },
    [belongsInTab, tab],
  );

  useRealtime('/ws/feed/', applyRealtime);

  useEffect(() => {
    return () => window.clearTimeout(undoTimer.current);
  }, []);

  const value = useMemo(
    () => ({
      tab,
      posts,
      loading,
      page,
      hasMore,
      pendingUndo,
      setTab,
      loadFeed,
      loadMore,
      toggleLike,
      toggleFollow,
      isFollowing,
      followStatus,
      addPost,
      updatePost,
      deletePost,
      undoDelete,
      dismissUndo,
    }),
    [
      tab,
      posts,
      loading,
      page,
      hasMore,
      pendingUndo,
      setTab,
      loadFeed,
      loadMore,
      toggleLike,
      toggleFollow,
      isFollowing,
      followStatus,
      addPost,
      updatePost,
      deletePost,
      undoDelete,
      dismissUndo,
    ],
  );

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed(): FeedContextValue {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error('useFeed must be used inside <FeedProvider>');
  return ctx;
}
