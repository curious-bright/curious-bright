import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostCard } from '../../src/components/feed/PostCard';
import { ScreenEnter } from '../../src/components/layout/ScreenEnter';
import { CuriousEmpty, CuriousError, CuriousLoading } from '../../src/components/ui/CuriousStates';
import { GridBackground } from '../../src/components/ui/GridBackground';
import { HighlighterText } from '../../src/components/ui/HighlighterText';
import { NotificationBell } from '../../src/components/ui/NotificationBell';
import { useAuth } from '../../src/state/AuthContext';
import { useToggleFollow, useToggleLike } from '../../src/hooks/useFeedActions';
import { fetchBrowsePage, q } from '../../src/lib/queries';
import { ACADEMIC_LEVELS } from '../../src/lib/subjects';
import { fontSize, fonts, radii, spacing, useTheme } from '../../src/theme';
import type { FeedPost } from '../../src/lib/types';

type Shelf = 'PAPERS' | 'NOTES';

export default function BrowseScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [shelf, setShelf] = useState<Shelf>('PAPERS');
  const [level, setLevel] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [debounced, setDebounced] = useState('');

  const filters = useMemo(() => {
    const f: Parameters<typeof fetchBrowsePage>[0] = {
      attachment: shelf === 'PAPERS' ? 'only' : 'none',
    };
    if (level !== 'ALL') f.academic_level = level;
    if (debounced) f.search = debounced;
    return f;
  }, [shelf, level, debounced]);

  const query = useInfiniteQuery({
    queryKey: q.browse(filters),
    queryFn: ({ pageParam }) => fetchBrowsePage(filters, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next,
  });

  const posts = useMemo(() => {
    const seen = new Set<number>();
    const merged: FeedPost[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const p of page.posts) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          merged.push(p);
        }
      }
    }
    return merged;
  }, [query.data]);

  const like = useToggleLike();
  const follow = useToggleFollow();

  const onSearchSubmit = () => setDebounced(searchTerm.trim());

  const renderItem = ({ item, index }: { item: FeedPost; index: number }) => (
    <Animated.View entering={FadeInDown.duration(300).delay(Math.min(index, 6) * 40)}>
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
      />
    </Animated.View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.paper, paddingTop: insets.top + spacing.md }]}>
      <GridBackground />
      <ScreenEnter>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <HighlighterText key={shelf}>
              {shelf === 'PAPERS' ? 'Shared Papers' : 'Community Notes'}
            </HighlighterText>
            <NotificationBell />
          </View>
          <Text style={[styles.subtitle, { color: colors.fadedInk }]}>
            {shelf === 'PAPERS'
              ? 'Downloadable PDFs the community filed away.'
              : 'Notes, questions and explanations from everyone.'}
          </Text>

          <View
            style={[
              styles.switcher,
              { borderColor: colors.line, backgroundColor: colors.paperCard },
            ]}
          >
            {(['PAPERS', 'NOTES'] as Shelf[]).map((s) => (
              <Pressable
                key={s}
                onPress={() => setShelf(s)}
                style={[
                  styles.switchItem,
                  shelf === s && { backgroundColor: colors.ink },
                ]}
              >
                <Ionicons
                  name={s === 'PAPERS' ? 'document-attach-outline' : 'create-outline'}
                  size={15}
                  color={shelf === s ? colors.paper : colors.fadedInk}
                />
                <Text
                  style={[
                    styles.switchText,
                    { color: shelf === s ? colors.paper : colors.fadedInk },
                  ]}
                >
                  {s === 'PAPERS' ? 'Papers' : 'Notes'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View
            style={[styles.searchBox, { borderColor: colors.line, backgroundColor: colors.paperCard }]}
          >
            <Ionicons name="search" size={15} color={colors.fadedInk} />
            <TextInput
              value={searchTerm}
              onChangeText={setSearchTerm}
              onEndEditing={onSearchSubmit}
              onSubmitEditing={onSearchSubmit}
              returnKeyType="search"
              placeholder={shelf === 'PAPERS' ? 'Search papers by title or summary…' : 'Search notes and questions…'}
              placeholderTextColor={colors.fadedInk}
              style={[styles.searchInput, { color: colors.ink }]}
            />
          </View>

          <ScrollViewChips
            active={level}
            onPick={setLevel}
          />
        </View>

        {query.isLoading ? (
          <CuriousLoading message="Shelving the repository…" />
        ) : query.isError ? (
          <CuriousError onRetry={() => query.refetch()} />
        ) : (
          <FlashList
            data={posts}
            key={`${shelf}-${level}-${debounced}`}
            renderItem={renderItem}
            getItemType={(item) => item.kind}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching && !query.isFetchingNextPage}
                onRefresh={() => query.refetch()}
                tintColor={colors.coral}
                colors={[colors.coral]}
              />
            }
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
            }}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              <CuriousEmpty
                title={debounced ? `No entries match “${debounced}”` : 'This shelf is empty'}
                description={
                  shelf === 'PAPERS'
                    ? 'Upload the first shared paper from the Submit page.'
                    : 'The community has not written notes with these filters yet.'
                }
                flourishText={shelf === 'PAPERS' ? 'Papers' : 'Notes'}
              />
            }
          />
        )}

        <Pressable
          onPress={() => router.push('/submit')}
          style={[styles.fab, { backgroundColor: colors.mustard }]}
          accessibilityLabel="Submit a resource"
        >
          <Ionicons name="cloud-upload-outline" size={22} color={colors.ink} />
          <View style={styles.fabEar} />
        </Pressable>
      </ScreenEnter>
    </View>
  );
}

function ScrollViewChips({
  active,
  onPick,
}: {
  active: string;
  onPick: (value: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <FlashlessChipRow>
      {ACADEMIC_LEVELS.map((l) => (
        <Pressable
          key={l.value}
          onPress={() => onPick(l.value)}
          style={[
            styles.levelChip,
            {
              borderColor: active === l.value ? colors.teal : colors.line,
              backgroundColor: active === l.value ? `${colors.teal}1A` : colors.paperCard,
            },
          ]}
        >
          <Text
            style={[
              styles.levelText,
              { color: active === l.value ? colors.teal : colors.fadedInk },
            ]}
          >
            {l.label}
          </Text>
        </Pressable>
      ))}
    </FlashlessChipRow>
  );
}

function FlashlessChipRow({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.levelRow}>
      <Ionicons name="funnel-outline" size={13} color={colors.fadedInk} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  subtitle: {
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.small,
    marginTop: -spacing.xs,
  },
  switcher: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    padding: 3,
    gap: 3,
  },
  switchItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: radii.md - 1,
  },
  switchText: {
    fontFamily: 'GeneralSans_600',
    fontSize: fontSize.small,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.body,
    padding: 0,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  levelChip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  levelText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
    gap: spacing.md,
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
