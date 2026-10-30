// Feed mutations with optimistic cache patches and rollback — the react-query
// translation of web FeedContext's toggleLike/toggleFollow/deletePost.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetchStrict, apiVoid } from '../lib/api';
import {
  belongsInTab,
  patchPost,
  patchPostsByAuthor,
  removeAuthorPosts,
  removePost,
  upsertInFeed,
} from '../lib/feedCache';
import { showDanger, showSuccess, showUndo } from '../components/ui/Toast';
import type { FeedPost, PostInput } from '../lib/types';
import { useAuth } from '../state/AuthContext';

const UNDO_VISIBLE_MS = 30_000;

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: number) =>
      apiFetchStrict<{ liked: boolean; like_count: number }>(`/posts/${postId}/like/`, {
        method: 'POST',
      }),
    onMutate: async (postId) => {
      const rollback = patchPost(qc, postId, (p) => {
        const liked = !p.liked_by_me;
        return { ...p, liked_by_me: liked, like_count: Math.max(0, p.like_count + (liked ? 1 : -1)) };
      });
      return { rollback };
    },
    onSuccess: (result, postId) => {
      patchPost(qc, postId, (p) => ({ ...p, liked_by_me: result.liked, like_count: result.like_count }));
    },
    onError: (_err, _postId, context) => {
      context?.rollback();
    },
  });
}

export function useToggleFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, following }: { username: string; following: boolean }) =>
      following
        ? apiVoid(`/auth/profiles/${username}/follow/`, { method: 'DELETE' })
        : apiFetchStrict(`/auth/profiles/${username}/follow/`, { method: 'POST' }).then(() => true),
    onMutate: ({ username, following }) => {
      const undoFlag = patchPostsByAuthor(qc, username, (p) => ({ ...p, is_following_author: !following }));
      return { undoFlag, wasFollowing: following };
    },
    onError: (_err, { username, following }) => {
      patchPostsByAuthor(qc, username, (p) => ({ ...p, is_following_author: following }));
      showDanger('Could not update follow. Check your connection.');
    },
    onSuccess: (_ok, { username, following }) => {
      if (following) {
        // Unfollowing drops that author from the Following feed (web parity);
        // their public posts stay in Discover until refresh.
        const undoRemoval = removeAuthorPosts(qc, username);
        setTimeout(() => undoRemoval, UNDO_VISIBLE_MS);
      }
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (post: FeedPost) =>
      apiVoid(`/posts/${post.id}/`, { method: 'DELETE' }).then((ok) => ({ ok, post })),
    onMutate: (post) => ({ undoRemove: removePost(qc, post.id) }),
    onSuccess: ({ ok, post }) => {
      if (!ok) return;
      showUndo({
        label: 'Post deleted',
        title: post.title,
        expiresAt: Date.now() + UNDO_VISIBLE_MS,
        onUndo: async () => {
          const restored = await apiFetchStrict<FeedPost>(`/posts/${post.id}/restore/`, {
            method: 'POST',
          }).catch(() => null);
          if (restored) {
            upsertInFeed(qc, 'discover', restored);
            upsertInFeed(qc, 'following', restored);
            qc.invalidateQueries({ queryKey: ['browse'] });
            showSuccess('Restored to the notebook.');
          } else {
            showDanger('That post could no longer be restored.');
          }
        },
      });
    },
    onError: (_err, _post, context) => {
      context?.undoRemove();
    },
  });
}

export function useFlagPost() {
  return useMutation({
    mutationFn: (postId: number) => apiVoid(`/posts/${postId}/flag/`, { method: 'POST' }),
    onSuccess: () => showSuccess('Thanks — a moderator will take a look.'),
    onError: () => showDanger('Could not flag this post right now.'),
  });
}

/** Create a post from the composer; prepend to the tabs it belongs to. */
export function useCreatePost(onCreated?: (post: FeedPost) => void) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: PostInput) =>
      apiFetchStrict<FeedPost>('/posts/', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (created) => {
      if (belongsInTab(created, 'discover', user?.username)) upsertInFeed(qc, 'discover', created);
      if (belongsInTab(created, 'following', user?.username)) upsertInFeed(qc, 'following', created);
      qc.invalidateQueries({ queryKey: ['browse'] });
      qc.invalidateQueries({ queryKey: ['profile-posts'] });
      onCreated?.(created);
      showSuccess('Pinned to the notebook.');
    },
  });
}

/** Edit a post (PATCH with optimistic-concurrency token). */
export function useUpdatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      postId,
      patch,
      expectedUpdatedAt,
    }: {
      postId: number;
      patch: Partial<PostInput>;
      expectedUpdatedAt?: string;
    }) =>
      apiFetchStrict<FeedPost>(`/posts/${postId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ ...patch, expected_updated_at: expectedUpdatedAt }),
      }),
    onSuccess: (updated) => {
      patchPost(qc, updated.id, () => updated);
      qc.invalidateQueries({ queryKey: ['browse'] });
    },
  });
}
