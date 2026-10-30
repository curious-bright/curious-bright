// Wire types mirroring the Django API as consumed by apps/web
// (FeedContext.tsx interfaces + AuthContext.tsx Me shape). These are the
// accurate contracts; @curious-bright/types describes the retired Prisma API.

export type PostVisibility = 'public' | 'followers' | 'room_only';
export type FeedTab = 'following' | 'discover';

export interface BadgeInfo {
  code: string;
  name: string;
  description: string;
  icon: string;
  awarded_at?: string;
}

export interface PolicyConsentState {
  version: string;
  accepted_version: string | null;
  accepted_at: string | null;
  accepted: boolean;
}

export interface ConsentState {
  terms: PolicyConsentState;
  privacy: PolicyConsentState;
  last_updated: string;
}

export interface ProfileSummary {
  username: string;
  email: string;
  bio: string;
  avatar: string;
  avatar_url?: string;
  subject_expertise: string;
  country: string;
  school: string;
  post_count: number;
  followers_count: number;
  following_count: number;
  badge_count: number;
  badges: BadgeInfo[];
  message_privacy: 'anyone' | 'follows' | 'nobody';
  created_at: string;
}

export interface Me {
  id: number;
  username: string;
  email: string;
  profile: ProfileSummary;
  is_moderator: boolean;
  is_email_verified: boolean;
  can_moderate: boolean;
  must_change_password: boolean;
  consent: ConsentState;
}

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
    badges: BadgeInfo[];
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

export interface RegisterResult {
  id: number;
  username: string;
  email: string;
  verification_required: boolean;
  code_expires_in: number;
  resend_after: number;
  email_sent: boolean | null;
  email_queued: boolean;
}

export interface VerifyEmailResult {
  access: string;
  refresh: string;
  user: Me;
}

export interface GoogleAuthPayload {
  access: string;
  refresh: string;
  user: Me;
  created: boolean;
}

export interface NotificationItem {
  id: number;
  actor: { id: number; username: string; profile?: { avatar: string } } | null;
  verb: string;
  text: string;
  post: number | null;
  comment: number | null;
  is_read: boolean;
  created_at: string;
}

export interface ConversationSummary {
  id: number;
  peer: FeedAuthor;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface DirectMessage {
  id: number;
  conversation: number;
  sender: FeedAuthor;
  body: string;
  created_at: string;
  mine: boolean;
  is_read?: boolean;
}

export type ProfilePatch = Partial<{
  bio: string;
  avatar: string;
  subject_expertise: string;
  country: string;
  school: string;
  message_privacy: 'anyone' | 'follows' | 'nobody';
}>;
