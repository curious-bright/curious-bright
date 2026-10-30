// Feed post card: comment-corner notebook card with author header, tag row,
// excerpt, equation chips and the like/comment action footer. Mirrors
// apps/web/src/components/PostCard.tsx (including 2-tap delete confirm).

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Avatar } from '../ui/Avatar';
import { BadgeTag, SubjectChip, VisibilityTag } from '../ui/Chip';
import { NotebookCard } from '../ui/NotebookCard';
import { springs } from '../../lib/motion';
import { fontSize, spacing, useTheme } from '../../theme';
import { fonts } from '../../theme/tokens';
import type { FeedPost } from '../../lib/types';

interface PostCardProps {
  post: FeedPost;
  me?: { username: string; can_moderate?: boolean } | null;
  onOpen: () => void;
  onOpenProfile: () => void;
  onToggleLike?: () => void;
  onToggleFollow?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}

function HeartButton({
  liked,
  count,
  disabled,
  onPress,
  color,
  faded,
}: {
  liked: boolean;
  count: number;
  disabled?: boolean;
  onPress: () => void;
  color: string;
  faded: string;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      aria-label={`${count} likes`}
      onPressIn={() => {
        scale.value = withSpring(0.88, springs.pop);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, springs.pop);
      }}
      onPress={() => {
        if (!liked) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        else Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[styles.action, { borderColor: liked ? color : faded }]}
    >
      <Animated.View style={style}>
        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={16} color={liked ? color : faded} />
      </Animated.View>
      <Text style={[styles.actionCount, { color: liked ? color : faded }]}>{count}</Text>
    </Pressable>
  );
}

export function PostCard({
  post,
  me,
  onOpen,
  onOpenProfile,
  onToggleLike,
  onToggleFollow,
  onDelete,
  onEdit,
}: PostCardProps) {
  const { colors } = useTheme();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  const isMine = post.mine ?? me?.username === post.author.username;
  const canDelete = ((post.can_delete ?? isMine) || !!me?.can_moderate) && !!onDelete;
  const canEdit = !!onEdit && (post.can_edit ?? isMine);
  const following = !!post.is_following_author;
  const pendingReview = post.review_status && post.review_status !== 'published';

  const handleDelete = () => {
    if (!onDelete) return;
    if (!confirmingDelete) {
      Haptics.selectionAsync().catch(() => {});
      setConfirmingDelete(true);
      clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmingDelete(false), 4000);
      return;
    }
    clearTimeout(confirmTimer.current);
    setConfirmingDelete(false);
    onDelete();
  };

  return (
    <NotebookCard onPress={onOpen}>
      <View style={styles.head}>
        <Pressable onPress={onOpenProfile} hitSlop={6} style={styles.author}>
          <Avatar username={post.author.username} uri={post.author.profile?.avatar} size={38} />
          <View style={{ minWidth: 0 }}>
            <View style={styles.authorRow}>
              <Text style={[styles.authorName, { color: colors.ink }]} numberOfLines={1}>
                {post.author.username}
              </Text>
              {post.author.profile?.badge_count ? (
                <BadgeTag variant="mustard" dark={colors.ink === '#F2EFE5'}>
                  {`${post.author.profile.badge_count} ★`}
                </BadgeTag>
              ) : null}
            </View>
            <Text style={[styles.date, { color: colors.fadedInk }]}>
              {new Date(post.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              {post.is_edited ? ' · edited' : ''}
            </Text>
          </View>
        </Pressable>
        <View style={styles.headActions}>
          <VisibilityTag visibility={post.visibility} />
          {canEdit ? (
            <Pressable hitSlop={8} onPress={onEdit} accessibilityLabel="Edit post">
              <Ionicons name="create-outline" size={17} color={colors.fadedInk} />
            </Pressable>
          ) : null}
          {canDelete ? (
            <Pressable hitSlop={8} onPress={handleDelete} accessibilityLabel="Delete post">
              {confirmingDelete ? (
                <Text style={[styles.confirmLabel, { color: colors.coral }]}>Confirm?</Text>
              ) : (
                <Ionicons name="trash-outline" size={17} color={colors.fadedInk} />
              )}
            </Pressable>
          ) : null}
          {onToggleFollow && !isMine ? (
            <Pressable
              hitSlop={6}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onToggleFollow();
              }}
              style={[
                styles.followBtn,
                following
                  ? { borderColor: colors.ink }
                  : { backgroundColor: colors.ink },
              ]}
            >
              <Text
                style={[
                  styles.followText,
                  { color: following ? colors.ink : colors.paper },
                ]}
              >
                {following ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.tags}>
        <SubjectChip subject={post.subject} />
        <BadgeTag variant="coral" dark={colors.ink === '#F2EFE5'}>{post.kind}</BadgeTag>
        {post.is_solved ? (
          <BadgeTag variant="teal" icon="checkmark-circle" dark={colors.ink === '#F2EFE5'}>
            solved
          </BadgeTag>
        ) : null}
        {pendingReview ? (
          <BadgeTag variant="mustard" icon="time-outline" dark={colors.ink === '#F2EFE5'}>
            in review
          </BadgeTag>
        ) : null}
        {post.room_name ? (
          <BadgeTag icon="school-outline" dark={colors.ink === '#F2EFE5'}>
            {post.room_name}
          </BadgeTag>
        ) : null}
      </View>

      <Text style={[styles.title, { color: colors.ink }]} numberOfLines={2}>
        {post.title}
      </Text>
      <Text style={[styles.excerpt, { color: colors.fadedInk }]} numberOfLines={4}>
        {post.body.length > 320 ? `${post.body.slice(0, 320)}…` : post.body}
      </Text>

      {post.equations?.length ? (
        <View style={styles.equations}>
          {post.equations.map((eq) => (
            <View
              key={eq.id}
              style={[styles.eqChip, { backgroundColor: colors.paperHover, borderColor: colors.line }]}
            >
              <Text style={[styles.eqLatex, { color: colors.ink }]} numberOfLines={1}>
                {eq.latex}
              </Text>
              {eq.description ? (
                <Text style={[styles.eqDesc, { color: colors.fadedInk }]} numberOfLines={1}>
                  — {eq.description}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {post.attachment_url ? (
        <View style={styles.attachment}>
          <Ionicons name="attach" size={13} color={colors.teal} />
          <Text style={[styles.attachmentText, { color: colors.teal }]} numberOfLines={1}>
            {post.attachment_name || 'Attached paper'}
          </Text>
        </View>
      ) : null}

      <View style={[styles.foot, { borderTopColor: colors.line }]}>
        <HeartButton
          liked={post.liked_by_me}
          count={post.like_count}
          disabled={!onToggleLike}
          onPress={onToggleLike ?? (() => {})}
          color={colors.coral}
          faded={colors.fadedInk}
        />
        <View style={styles.action}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.fadedInk} />
          <Text style={[styles.actionCount, { color: colors.fadedInk }]}>{post.comment_count}</Text>
        </View>
      </View>
    </NotebookCard>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorName: {
    fontFamily: 'GeneralSans_600',
    fontSize: fontSize.small,
    fontWeight: '600',
  },
  date: {
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.caption,
  },
  headActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  confirmLabel: {
    fontFamily: 'GeneralSans_600',
    fontSize: fontSize.caption,
  },
  followBtn: {
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 4,
    borderTopRightRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  followText: {
    fontFamily: 'GeneralSans_600',
    fontSize: fontSize.caption,
    fontWeight: '600',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: 'ClashDisplay_600',
    fontSize: fontSize.lead,
    lineHeight: fontSize.lead * 1.3,
    marginBottom: spacing.xs,
  },
  excerpt: {
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.small,
    lineHeight: 21,
  },
  equations: {
    marginTop: spacing.sm,
    gap: 6,
  },
  eqChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 4,
    borderTopRightRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    gap: 6,
    maxWidth: '100%',
  },
  eqLatex: {
    fontFamily: fonts.mono,
    fontSize: fontSize.small,
  },
  eqDesc: {
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.caption,
    flexShrink: 1,
  },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: spacing.sm,
  },
  attachmentText: {
    fontFamily: 'GeneralSans_500',
    fontSize: fontSize.caption,
    flex: 1,
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'transparent',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionCount: {
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
  },
});
