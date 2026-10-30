import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { ScreenEnter } from '../../src/components/layout/ScreenEnter';
import { GridBackground } from '../../src/components/ui/GridBackground';
import { HighlighterText } from '../../src/components/ui/HighlighterText';
import { PostCard } from '../../src/components/feed/PostCard';
import { CuriousEmpty, CuriousError, CuriousLoading } from '../../src/components/ui/CuriousStates';
import { NotificationBell } from '../../src/components/ui/NotificationBell';
import { useFeed } from '../../src/hooks/useFeed';
import { useDeletePost, useFlagPost, useToggleFollow, useToggleLike } from '../../src/hooks/useFeedActions';
import { spacing, useTheme, fontSize, fonts } from '../../src/theme';
import { useAuth } from '../../src/state/AuthContext';
import type { FeedPost } from '../../src/lib/types';

type Tab = 'discover' | 'following';

export default function FeedScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('discover');
  const feed = useFeed(tab);
  const like = useToggleLike();
  const follow = useToggleFollow();
  const del = useDeletePost();
  const flag = useFlagPost();

  const renderItem = ({ item, index }: { item: FeedPost; index: number }) => (
    <Animated.View entering={FadeInDown.duration(320).delay(Math.min(index, 6) * 45)}>
      <PostCard
        post={item}
        me={user ? { username: user.username, can_moderate: user.can_moderate } : null}
        onOpen={() => router.push(`/post/${item.id}`)}
        onOpenProfile={() => router.push(`/profile/${item.author.username}`)}
        onToggleLike={() => like.mutate(item.id)}
        onToggleFollow={
          item.mine || !user
            ? undefined
            : () => follow.mutate({ username: item.author.username, following: !!item.is_following_author })
        }
        onDelete={() => del.mutate(item)}
      />
    </Animated.View>
  );

  const headerTitle = tab === 'discover' ? 'Curious Bright' : 'Your Circle';

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <GridBackground />
      <ScreenEnter>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <HighlighterText key={tab}>{headerTitle}</HighlighterText>
            <View style={styles.headerActions}>
              <NotificationBell />
              <Pressable
                hitSlop={8}
                onPress={() => router.push('/search')}
                style={[styles.iconBtn, { borderColor: colors.line, backgroundColor: colors.paperCard }]}
                accessibilityLabel="Search"
              >
                <Ionicons name="search" size={18} color={colors.ink} />
              </Pressable>
            </View>
          </View>
          <View style={styles.tabRow}>
            {(['discover', 'following'] as Tab[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[
                  styles.pill,
                  {
                    borderColor: tab === t ? colors.ink : colors.line,
                    backgroundColor: tab === t ? colors.ink : colors.paperCard,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: tab === t ? colors.paper : colors.fadedInk },
                  ]}
                >
                  {t === 'discover' ? 'Discover' : 'Following'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {feed.isLoading && !feed.posts.length ? (
          <CuriousLoading message="Unrolling the community notebook…" />
        ) : feed.isError ? (
          <CuriousError onRetry={() => feed.refetch()} />
        ) : (
          <FlashList
            data={feed.posts}
            key={tab}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            getItemType={(item) => item.kind}
            refreshControl={
              <RefreshControl
                refreshing={feed.isRefetching}
                onRefresh={() => feed.refetch()}
                tintColor={colors.coral}
                colors={[colors.coral]}
              />
            }
            onEndReached={() => {
              if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
            }}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              tab === 'discover' ? (
                <CuriousEmpty
                  title="The first page is blank"
                  description="Be the first to ask a question or share an explanation today."
                  action={
                    <Pressable onPress={() => router.push('/composer')}>
                      <Text style={[styles.emptyCta, { color: colors.coral }]}>Write the first entry</Text>
                    </Pressable>
                  }
                />
              ) : (
                <CuriousEmpty
                  title="Your circle is small"
                  description="Follow curious people and their entries collect here."
                  flourishText="Following"
                />
              )
            }
            ListFooterComponent={
              feed.isFetchingNextPage ? (
                <ActivityIndicator style={styles.footerSpinner} color={colors.coral} />
              ) : null
            }
          />
        )}

        <Pressable
          onPress={() => router.push('/composer')}
          style={[styles.fab, { backgroundColor: colors.coral }]}
          accessibilityLabel="Compose a post"
        >
          <Ionicons name="pencil" size={22} color="#FFF" />
          <View style={styles.fabEar} />
        </Pressable>
      </ScreenEnter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 4,
    borderTopRightRadius: 0,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pill: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  pillText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
    gap: spacing.md,
  },
  footerSpinner: {
    marginVertical: spacing.lg,
  },
  emptyCta: {
    fontFamily: 'GeneralSans_600',
    fontSize: fontSize.small,
    marginTop: spacing.sm,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xxl,
    width: 56,
    height: 56,
    borderRadius: 10,
    borderTopRightRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  fabEar: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 9,
    height: 9,
    borderRadius: 2,
    backgroundColor: 'rgba(247,246,242,0.9)',
  },
});
