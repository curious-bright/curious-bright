// Cache surgery shared by feed mutations and the realtime handler: every
// patch walks the paginated ['feed'] / ['browse'] caches plus the single
// ['post'] cache and returns an undo closure for optimistic rollbacks.

import type { QueryClient } from '@tanstack/react-query';
import type { FeedPost } from './types';

type Patcher = (post: FeedPost) => FeedPost;

function walkFeedCaches(qc: QueryClient, fn: (posts: FeedPost[]) => FeedPost[]) {
  const undone: Array<() => void> = [];
  for (const query of qc.getQueryCache().getAll()) {
    const key = query.queryKey;
    const isFeed = key[0] === 'feed' || key[0] === 'browse' || key[0] === 'profile-posts';
    const data = query.state.data as { pages?: { posts: FeedPost[] }[] } | undefined;
    if (!isFeed || !data?.pages) continue;
    const prevPages = data.pages;
    const nextPages = prevPages.map((page) => ({ ...page, posts: fn(page.posts) }));
    const same = nextPages.every((p, i) => p.posts === prevPages[i].posts);
    if (same) continue;
    qc.setQueryData(query.queryKey, { ...data, pages: nextPages });
    undone.push(() => qc.setQueryData(query.queryKey, { ...data, pages: prevPages }));
  }
  return undone;
}

/** Optimistically patch a post everywhere it is cached. Returns undo(). */
export function patchPost(qc: QueryClient, postId: number, patch: Patcher): () => void {
  const undone = walkFeedCaches(qc, (posts) =>
    posts.map((p) => (p.id === postId ? patch(p) : p)),
  );
  const single = qc.getQueryData<FeedPost>(['post', String(postId)]);
  if (single) {
    qc.setQueryData(['post', String(postId)], patch(single));
    undone.push(() => qc.setQueryData(['post', String(postId)], single));
  }
  return () => undone.forEach((u) => u());
}

/** Patch by author (e.g. follow state changes flag all their cached posts). */
export function patchPostsByAuthor(qc: QueryClient, username: string, patch: Patcher): () => void {
  const undone = walkFeedCaches(qc, (posts) =>
    posts.map((p) => (p.author.username === username ? patch(p) : p)),
  );
  return () => undone.forEach((u) => u());
}

/** Remove a post from all cached lists; returns undo(). */
export function removePost(qc: QueryClient, postId: number): () => void {
  const undone = walkFeedCaches(qc, (posts) => posts.filter((p) => p.id !== postId));
  const single = qc.getQueryData<FeedPost>(['post', String(postId)]);
  if (single) qc.removeQueries({ queryKey: ['post', String(postId)] });
  return () => {
    undone.forEach((u) => u());
    if (single) qc.setQueryData(['post', String(postId)], single);
  };
}

/** Drop an unfollowed author's posts (their own posts stay in Following). */
export function removeAuthorPosts(qc: QueryClient, username: string): () => void {
  const undone = walkFeedCaches(qc, (posts) =>
    posts.filter((p) => p.author.username !== username || p.mine),
  );
  return () => undone.forEach((u) => u());
}

/** Fields a list card shows that the detail screen can change (comment,
 * solve, accept, like). Copied across without the comment tree, which would
 * bloat every cached row. */
const MIRRORED_FIELDS = [
  'title',
  'body',
  'subject',
  'kind',
  'academic_level',
  'visibility',
  'review_status',
  'is_solved',
  'like_count',
  'comment_count',
  'liked_by_me',
  'attachment_url',
  'attachment_name',
  'equations',
  'is_edited',
  'edited_at',
  'updated_at',
] as const;

export function mirrorPostInLists(qc: QueryClient, post: FeedPost): void {
  const fresh = post as unknown as Record<string, unknown>;
  walkFeedCaches(qc, (posts) =>
    posts.map((row) => {
      if (row.id !== post.id) return row;
      let changed = false;
      const next = { ...row };
      for (const field of MIRRORED_FIELDS) {
        const value = fresh[field];
        if (value !== undefined && value !== row[field]) {
          (next as Record<string, unknown>)[field] = value;
          changed = true;
        }
      }
      return changed ? next : row;
    }),
  );
}

export function belongsInTab(post: FeedPost, tab: 'discover' | 'following', meUsername?: string): boolean {
  const published = !post.review_status || post.review_status === 'published';
  if (!published) return false;
  if (tab === 'discover') return post.visibility === 'public';
  const mine = post.mine ?? post.author.username === meUsername;
  return !!mine || !!post.is_following_author;
}

/** Prepend a created/updated post to a tab's first page when it belongs. */
export function upsertInFeed(qc: QueryClient, tab: 'discover' | 'following', post: FeedPost) {
  const key = ['feed', tab];
  qc.setQueryData<{ pages: { posts: FeedPost[]; next?: number }[]; pageParams: number[] }>(
    key,
    (current) => {
      const pages = current?.pages?.length ? current.pages : [{ posts: [], next: undefined }];
      const exists = pages.some((page) => page.posts.some((p) => p.id === post.id));
      if (exists) {
        return {
          pageParams: current?.pageParams ?? [1],
          pages: pages.map((page) => ({
            ...page,
            posts: page.posts.map((p) => (p.id === post.id ? post : p)),
          })),
        };
      }
      const [first, ...rest] = pages;
      return {
        pageParams: current?.pageParams ?? [1],
        pages: [{ ...first, posts: [post, ...first.posts] }, ...rest],
      };
    },
  );
}
