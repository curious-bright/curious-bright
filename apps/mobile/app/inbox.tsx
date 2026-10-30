import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenHeader } from '../src/components/layout/ScreenHeader';
import { Avatar } from '../src/components/ui/Avatar';
import { CuriousEmpty, CuriousError, CuriousLoading } from '../src/components/ui/CuriousStates';
import { GridBackground } from '../src/components/ui/GridBackground';
import { apiVoid } from '../src/lib/api';
import { fetchNotifications, q } from '../src/lib/queries';
import { fontSize, fonts, radii, spacing, useTheme } from '../src/theme';
import type { NotificationItem } from '../src/lib/types';

const VERB_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  like: 'heart',
  follow: 'person-add',
  comment: 'chatbubble',
  reply: 'chatbubbles',
  accept: 'checkmark-circle',
  helpful: 'thumbs-up',
  solve: 'ribbon',
  mention: 'at',
  badge: 'trophy',
};

function verbIcon(verb: string): keyof typeof Ionicons.glyphMap {
  for (const key of Object.keys(VERB_ICON)) {
    if (verb.includes(key)) return VERB_ICON[key];
  }
  return 'notifications-outline';
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function InboxScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const { data: items = [], isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: q.notifications,
    queryFn: fetchNotifications,
  });

  const markAllRead = useMutation({
    mutationFn: () => apiVoid('/notifications/read-all/', { method: 'POST' }),
    onSuccess: () => {
      qc.setQueryData<NotificationItem[]>(q.notifications, (prev) =>
        prev ? prev.map((n) => ({ ...n, is_read: true })) : prev,
      );
    },
  });

  const unread = items.filter((n) => !n.is_read).length;

  const open = (n: NotificationItem) => {
    if (n.post) router.push(`/post/${n.post}`);
    else if (n.actor) router.push(`/profile/${n.actor.username}`);
  };

  const renderItem = ({ item, index }: { item: NotificationItem; index: number }) => (
    <Animated.View entering={FadeInDown.duration(280).delay(Math.min(index, 6) * 40)} style={styles.cell}>
      <Pressable
        onPress={() => open(item)}
        style={[
          styles.row,
          {
            borderColor: colors.line,
            backgroundColor: item.is_read ? colors.paperCard : '#FDF9EE',
          },
        ]}
      >
        {!item.is_read ? <View style={[styles.unreadBar, { backgroundColor: colors.mustard }]} /> : null}
        {item.actor ? (
          <Avatar username={item.actor.username} uri={item.actor.profile?.avatar} size={36} />
        ) : (
          <View style={[styles.iconBadge, { borderColor: colors.line, backgroundColor: colors.paperHover }]}>
            <Ionicons name={verbIcon(item.verb)} size={16} color={colors.coral} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.text, { color: item.is_read ? colors.fadedInk : colors.ink }]}>
            {item.text}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name={verbIcon(item.verb)} size={11} color={colors.fadedInk} />
            <Text style={[styles.time, { color: colors.fadedInk }]}>{timeAgo(item.created_at)}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={15} color={colors.lineDark} />
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <GridBackground />
      <ScreenHeader
        eyebrow="Activity"
        title={unread > 0 ? `Inbox · ${unread} new` : 'Inbox'}
        right={
          unread > 0 ? (
            <Pressable
              onPress={() => markAllRead.mutate()}
              style={[styles.markBtn, { borderColor: colors.mustard, backgroundColor: `${colors.mustard}1A` }]}
            >
              <Text style={[styles.markText, { color: colors.ink }]}>
                {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
              </Text>
            </Pressable>
          ) : null
        }
      />

      {isLoading ? (
        <CuriousLoading message="Checking your margin notes…" />
      ) : isError && items.length === 0 ? (
        <CuriousError onRetry={() => refetch()} />
      ) : (
        <FlashList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          ListFooterComponent={<View style={styles.listEnd} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              tintColor={colors.coral}
              colors={[colors.coral]}
            />
          }
          ListEmptyComponent={
            <CuriousEmpty
              title="No margin notes yet"
              description="Likes, follows and replies from the community will collect here."
              flourishText="Inbox"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  markBtn: {
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  markText: {
    fontFamily: 'GeneralSans_600',
    fontSize: fontSize.caption,
  },
  cell: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  listEnd: { height: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
  },
  unreadBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: 'GeneralSans_500',
    fontSize: fontSize.small,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  time: {
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
