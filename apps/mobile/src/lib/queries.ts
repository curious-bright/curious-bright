// Single import site for query keys + fetchers. Every fetcher must use
// apiFetchStrict: the soft apiFetch swallows errors to null, which would
// break react-query's isError/retry semantics.

import { apiFetchStrict, resultsOf, type Paginated } from './api';
import type {
  ChatMessage,
  ConsentState,
  ConversationSummary,
  FeedComment,
  FeedPost,
  NotificationItem,
  ProfileSummary,
  RoomInfo,
  RoomMember,
  RoomMessage,
} from './types';

export const q = {
  feed: (tab: 'discover' | 'following') => ['feed', tab] as const,
  post: (id: number | string) => ['post', String(id)] as const,
  comments: (id: number | string) => ['comments', String(id)] as const,
  browse: (filters: Record<string, string | number | boolean | 'undefined'>) => ['browse', filters] as const,
  notifications: ['notifications'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: number | string) => ['conversation', String(id)] as const,
  messages: (conversationId: number | string) => ['messages', String(conversationId)] as const,
  messagesUnread: ['messages', 'unread'] as const,
  rooms: (filters: Record<string, string> = {}) => ['rooms', filters] as const,
  room: (id: number | string) => ['room', String(id)] as const,
  roomMembers: (id: number | string) => ['room-members', String(id)] as const,
  roomMessages: (id: number | string) => ['room-messages', String(id)] as const,
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

export interface MessagesUnread {
  total: number;
  by_conversation: Record<string, number>;
}

export const fetchMessagesUnread = () => apiFetchStrict<MessagesUnread>('/messages/unread/');

export const fetchConversations = () =>
  apiFetchStrict<ConversationSummary[] | Paginated<ConversationSummary>>('/messages/conversations/').then(resultsOf);

export const fetchConversation = (id: number | string) =>
  apiFetchStrict<ConversationSummary>(`/messages/conversations/${id}/`);

export interface MessagePage {
  messages: ChatMessage[];
  has_more: boolean;
}

/** Cached ascending (oldest first); lists render bottom-up via startRenderingFromBottom. */
export async function fetchConversationMessages(id: number | string, before?: number): Promise<MessagePage> {
  const params = new URLSearchParams({ limit: '50' });
  if (before) params.set('before', String(before));
  const data = await apiFetchStrict<MessagePage>(`/messages/conversations/${id}/messages/?${params.toString()}`);
  return { messages: data.messages ?? [], has_more: !!data.has_more };
}

export async function fetchRoomsPage(page: number): Promise<{ rooms: RoomInfo[]; next: number | undefined }> {
  const data = await apiFetchStrict<Paginated<RoomInfo>>(`/rooms/?page=${page}`);
  const next = pageParamFromNext(data?.next ?? null);
  return { rooms: resultsOf(data), next: next && next !== page ? next : undefined };
}

export const fetchRoom = (id: number | string) => apiFetchStrict<RoomInfo>(`/rooms/${id}/`);

export const fetchRoomMembers = (id: number | string) =>
  apiFetchStrict<RoomMember[] | Paginated<RoomMember>>(`/rooms/${id}/members/`).then(resultsOf);

/** Newest 100 (or everything after `after` when polling) — ascending by id. */
export async function fetchRoomMessages(id: number | string, after?: number): Promise<RoomMessage[]> {
  const suffix = after ? `?after=${after}` : '';
  const data = await apiFetchStrict<RoomMessage[] | Paginated<RoomMessage>>(`/rooms/${id}/messages/${suffix}`);
  return resultsOf(data);
}

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
