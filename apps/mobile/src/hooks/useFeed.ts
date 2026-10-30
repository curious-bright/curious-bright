// Feed infinite query + WebSocket event mapping — the react-query mirror of
// web FeedContext.applyRealtime (dotted event names, targeted patches).

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { belongsInTab, patchPost, removePost, upsertInFeed } from '../lib/feedCache';
import { fetchFeedPage, q } from '../lib/queries';
import { useRealtime } from '../lib/realtime';
import { useAuth } from '../state/AuthContext';
import type { FeedPost } from '../lib/types';

export function useFeed(tab: 'discover' | 'following') {
  const qc = useQueryClient();
  const { user, isAuthenticated } = useAuth();

  const query = useInfiniteQuery({
    queryKey: q.feed(tab),
    queryFn: ({ pageParam }) => fetchFeedPage(tab, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next,
    enabled: isAuthenticated,
  });

  const posts = useMemo(() => {
    const pages = query.data?.pages ?? [];
    const seen = new Set<number>();
    const merged: FeedPost[] = [];
    for (const page of pages) {
      for (const post of page.posts) {
        if (!seen.has(post.id)) {
          seen.add(post.id);
          merged.push(post);
        }
      }
    }
    return merged;
  }, [query.data]);

  useRealtime(isAuthenticated ? '/ws/feed/' : null, ({ event, data }) => {
    if (event === 'post.created' || event === 'post.updated') {
      const incoming = data as FeedPost;
      if (belongsInTab(incoming, tab, user?.username)) upsertInFeed(qc, tab, incoming);
      else removePost(qc, incoming.id);
      return;
    }
    if (event === 'post.deleted') {
      removePost(qc, (data as { id: number }).id);
      return;
    }
    if (event === 'post.like_count') {
      const { id, like_count } = data as { id: number; like_count: number };
      patchPost(qc, id, (p) => ({ ...p, like_count }));
      return;
    }
    if (event === 'post.solved') {
      const { id, is_solved } = data as { id: number; is_solved: boolean };
      patchPost(qc, id, (p) => ({ ...p, is_solved }));
      return;
    }
    if (event === 'comment.created' || event === 'comment.deleted') {
      const payload = data as { comment_count?: number; post?: number; comment?: { post?: number } };
      const postId =
        event === 'comment.created' ? payload.comment?.post : payload.post;
      if (postId && typeof payload.comment_count === 'number') {
        patchPost(qc, postId, (p) => ({ ...p, comment_count: payload.comment_count! }));
      }
    }
  });

  return {
    posts,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isError: query.isError,
    isLoading: query.isLoading,
    isPending: query.isPending,
    error: query.error,
  };
}
