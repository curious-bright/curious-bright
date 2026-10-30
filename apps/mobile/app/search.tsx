import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../src/components/ui/Avatar';
import { CuriousEmpty, CuriousError, CuriousLoading } from '../src/components/ui/CuriousStates';
import { GridBackground } from '../src/components/ui/GridBackground';
import { NotebookCard } from '../src/components/ui/NotebookCard';
import { PostCard } from '../src/components/feed/PostCard';
import { useAuth } from '../src/state/AuthContext';
import { fetchSearch, q } from '../src/lib/queries';
import { subjectColor } from '../src/lib/subjects';
import { fontSize, fonts, radii, spacing, useTheme } from '../src/theme';
import type { FeedPost, SearchUser } from '../src/lib/types';

const RECENTS_KEY = 'cb.sear…ents';
const RECENTS_MAX = 8;

export default function SearchScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    AsyncStorage.getItem(RECENTS_KEY)
      .then((raw) => setRecents(raw ? (JSON.parse(raw) as string[]) : []))
      .catch(() => setRecents([]));
  }, []);

  const enabled = debounced.length >= 2;
  const { data, isError, refetch, isFetching, isPending } = useQuery({
    queryKey: q.search(debounced),
    queryFn: () => fetchSearch(debounced),
    enabled,
  });

  const remember = (value: string) => {
    const clean = value.trim();
    if (clean.length < 2) return;
    setRecents((prev) => {
      const next = [clean, ...prev.filter((r) => r.toLowerCase() !== clean.toLowerCase())].slice(0, RECENTS_MAX);
      void AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const users: SearchUser[] = data?.users ?? [];
  const posts: FeedPost[] = data?.posts ?? [];
  const hasResults = users.length > 0 || posts.length > 0;

  const openProfile = (username: string) => {
    if (enabled) remember(debounced);
    router.push(`/profile/${username}`);
  };

  const headerHeight = useMemo(() => insets.top + 8, [insets.top]);

  return (
    <View style={[styles.root, { backgroundColor: colors.paper, paddingTop: headerHeight }]}>
      <GridBackground />
      <View style={styles.topRow}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={[styles.iconBtn, { borderColor: colors.line, backgroundColor: colors.paperCard }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={18} color={colors.ink} />
        </Pressable>
        <View
          style={[
            styles.searchBox,
            { borderColor: colors.line, backgroundColor: colors.paperCard },
          ]}
        >
          <Ionicons name="search" size={16} color={colors.fadedInk} />
          <TextInput
            ref={inputRef}
            value={term}
            onChangeText={setTerm}
            onSubmitEditing={() => enabled && remember(debounced)}
            placeholder="People, titles, subjects…"
            placeholderTextColor={colors.fadedInk}
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.ink }]}
          />
          {term ? (
            <Pressable hitSlop={8} onPress={() => setTerm('')} accessibilityLabel="Clear">
              <Ionicons name="close-circle" size={16} color={colors.fadedInk} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {!enabled ? (
          recents.length ? (
            <>
              <Text style={[styles.sectionLabel, { color: colors.fadedInk }]}>Recent searches</Text>
              <View style={styles.recentsWrap}>
                {recents.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => {
                      setTerm(r);
                      inputRef.current?.focus();
                    }}
                    style={[styles.recentChip, { borderColor: colors.line, backgroundColor: colors.paperCard }]}
                  >
                    <Ionicons name="time-outline" size={12} color={colors.fadedInk} />
                    <Text style={[styles.recentText, { color: colors.ink }]} numberOfLines={1}>
                      {r}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={() => {
                  setRecents([]);
                  void AsyncStorage.removeItem(RECENTS_KEY);
                }}
              >
                <Text style={[styles.clearRecents, { color: colors.coral }]}>Clear history</Text>
              </Pressable>
            </>
          ) : (
            <CuriousEmpty
              title="The notebook has an index"
              description="Search two or more characters to find members and entries."
              flourishText="Search"
            />
          )
        ) : isError ? (
          <CuriousError onRetry={() => refetch()} />
        ) : enabled && isPending ? (
          <CuriousLoading message="Searching the notebook…" />
        ) : !isFetching && !hasResults ? (
          <CuriousEmpty
            title={`Nothing filed under “${debounced}”`}
            description="Try a different word, or search by username."
          />
        ) : (
          <>
            {users.length ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.fadedInk }]}>People</Text>
                {users.map((p) => (
                  <NotebookCard key={`u-${p.username}`} style={styles.resultCard}>
                    <Pressable
                      onPress={() => openProfile(p.username)}
                      style={styles.personRow}
                      android_ripple={null}
                    >
                      <Avatar username={p.username} uri={p.avatar_url} size={40} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.personName, { color: colors.ink }]} numberOfLines={1}>
                          @{p.username}
                        </Text>
                        {p.bio ? (
                          <Text style={[styles.personBio, { color: colors.fadedInk }]} numberOfLines={2}>
                            {p.bio}
                          </Text>
                        ) : null}
                      </View>
                      {p.subject_expertise ? (
                        <Text
                          style={[
                            styles.personSubject,
                            { color: subjectColor(p.subject_expertise), borderColor: `${subjectColor(p.subject_expertise)}55` },
                          ]}
                        >
                          {p.subject_expertise}
                        </Text>
                      ) : null}
                    </Pressable>
                  </NotebookCard>
                ))}
              </>
            ) : null}

            {posts.length ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.fadedInk }]}>Entries</Text>
                {posts.map((post) => (
                  <PostCard
                    key={`p-${post.id}`}
                    post={post}
                    me={user ? { username: user.username, can_moderate: user.can_moderate } : null}
                    onOpen={() => {
                      if (enabled) remember(debounced);
                      router.push(`/post/${post.id}`);
                    }}
                    onOpenProfile={() => openProfile(post.author.username)}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
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
  searchBox: {
    flex: 1,
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
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
    gap: spacing.md,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.sm,
  },
  recentsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  recentText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
  },
  clearRecents: {
    fontFamily: 'GeneralSans_600',
    fontSize: fontSize.small,
    marginTop: spacing.xs,
  },
  resultCard: {
    paddingVertical: spacing.xs,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xs,
  },
  personName: {
    fontFamily: 'GeneralSans_600',
    fontSize: fontSize.body,
  },
  personBio: {
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.small,
    marginTop: 2,
  },
  personSubject: {
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    borderWidth: 1,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
