// Single import site for query keys + fetchers. Every fetcher must use
// apiFetchStrict: the soft apiFetch swallows errors to null, which would
// break react-query's isError/retry semantics.

import { apiFetchStrict, resultsOf, type Paginated } from './api';
import type {
  ConsentState,
  FeedComment,
  FeedPost,
  NotificationItem,
  ProfileSummary,
} from './types';

export const q = {
  feed: (tab: 'discover' | 'following') => ['feed', tab] as const,
  post: (id: number | string) => ['post', String(id)] as const,
  comments: (id: number | string) => ['comments', String(id)] as const,
  browse: (filters: Record<string, string | number | boolean | 'undefined'>) => ['browse', filters] as const,
  notifications: ['notifications'] as const,
  profile: (username: string) => ['profile', username] as const,
  profilePosts: (username: string) => ['profile-posts', username] as const,
  search: (term: string) => ['search', term] as const,
  consent: ['consent'] as const,
};

function pageParamFromNext(next: string | null): number | undefined {
  if (!next) return undefined;
  try {
    const page = new URL(next).searchParams.get('page');
    return page ? Number(page) : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchFeedPage(tab: 'discover' | 'following', page: number): Promise<{ posts: FeedPost[]; next: number | undefined }> {
  const data = await apiFetchStrict<{ results: FeedPost[]; next: string | null }>(
    `/feed/${tab}/?page=${page}`,
  );
  return { posts: resultsOf(data), next: pageParamFromNext(data?.next ?? null) };
}

export async function fetchBrowsePage(
  filters: { academic_level?: string; attachment?: 'only' | 'none'; search?: string; author?: string },
  page: number,
): Promise<{ posts: FeedPost[]; next: number | undefined }> {
  const params = new URLSearchParams({ status: 'published', page: String(page) });
  if (filters.academic_level && filters.academic_level !== 'ALL') params.set('academic_level', filters.academic_level);
  if (filters.attachment) params.set('attachment', filters.attachment);
  if (filters.search) params.set('search', filters.search);
  if (filters.author) params.set('author', filters.author);
  const data = await apiFetchStrict<{ results: FeedPost[]; next: string | null }>(`/posts/?${params.toString()}`);
  return { posts: resultsOf(data), next: pageParamFromNext(data?.next ?? null) };
}

export const fetchPost = (id: number | string) => apiFetchStrict<FeedPost>(`/posts/${id}/`);

export const fetchComments = (id: number | string) =>
  apiFetchStrict<FeedComment[] | Paginated<FeedComment>>(`/posts/${id}/comments/`).then(resultsOf);

export const fetchNotifications = () =>
  apiFetchStrict<NotificationItem[] | Paginated<NotificationItem>>('/notifications/?page_size=50').then(resultsOf);

export const fetchProfile = (username: string) => apiFetchStrict<ProfileSummary>(`/auth/profiles/${username}/`);

export const fetchIsFollowing = async (username: string): Promise<boolean> => {
  const data = await apiFetchStrict<{ following: boolean }>(`/auth/profiles/${username}/is-following/`);
  return !!data?.following;
};

export const fetchConsent = () => apiFetchStrict<ConsentState>('/auth/consent/');

export interface SearchResults {
  posts: FeedPost[];
  rooms: { id: number; name: string; topic?: string }[];
  users: ProfileSummary[];
}

export async function fetchSearch(term: string): Promise<SearchResults> {
  const data = await apiFetchStrict<Partial<SearchResults>>(`/search/?q=${encodeURIComponent(term)}`);
  return { posts: data?.posts ?? [], rooms: data?.rooms ?? [], users: data?.users ?? [] };
}

export async function fetchAuthorPosts(username: string, page: number): Promise<{ posts: FeedPost[]; next: number | undefined }> {
  return fetchBrowsePage({ author: username }, page);
}
