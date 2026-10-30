import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PostCard } from '../feed/PostCard';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { CuriousEmpty, CuriousError, CuriousLoading } from '../ui/CuriousStates';
import { Field } from '../ui/Field';
import { HighlighterText } from '../ui/HighlighterText';
import { NotebookCard } from '../ui/NotebookCard';
import { showDanger, showSuccess } from '../ui/Toast';
import { useAuth } from '../../state/AuthContext';
import { useToggleFollow, useToggleLike } from '../../hooks/useFeedActions';
import { fetchAuthorPosts, fetchIsFollowing, fetchProfile, q } from '../../lib/queries';
import { subjectColor } from '../../lib/subjects';
import { fontSize, fonts, radii, spacing, useTheme } from '../../theme';
import type { FeedPost, ProfilePatch } from '../../lib/types';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function ProfileView({ username }: { username: string }) {
  const { colors } = useTheme();
  const { user, updateProfile, refreshMe } = useAuth();
  const qc = useQueryClient();
  const isMe = !!user && user.username === username;

  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState('');
  const [expertise, setExpertise] = useState('');
  const [avatarPick, setAvatarPick] = useState<{ uri: string; name: string; type: string } | null>(null);

  const profileQuery = useQuery({
    queryKey: q.profile(username),
    queryFn: () => fetchProfile(username),
  });

  const followingQuery = useQuery({
    queryKey: [...q.profile(username), 'is-following'],
    queryFn: () => fetchIsFollowing(username),
    enabled: !isMe && !!user,
  });

  const postsQuery = useInfiniteQuery({
    queryKey: q.profilePosts(username),
    queryFn: ({ pageParam }) => fetchAuthorPosts(username, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next,
  });

  const like = useToggleLike();
  const follow = useToggleFollow();

  const profile = profileQuery.data;
  const following = followingQuery.data ?? false;

  const saveProfile = useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      if (avatarPick) {
        const size = await imageBytes(avatarPick.uri);
        if (size != null && size > MAX_AVATAR_BYTES) {
          throw new Error('Avatar images must be 5 MB or smaller.');
        }
      }
      const ok = await updateProfile(patch, avatarPick);
      if (!ok) throw new Error('Could not save your profile.');
      return ok;
    },
    onSuccess: async () => {
      setEditing(false);
      setAvatarPick(null);
      await refreshMe(true);
      qc.invalidateQueries({ queryKey: q.profile(username) });
      showSuccess('Profile saved.');
    },
    onError: (err: Error) => showDanger(err.message),
  });

  const posts = useMemo(() => {
    const seen = new Set<number>();
    const merged: FeedPost[] = [];
    for (const page of postsQuery.data?.pages ?? []) {
      for (const p of page.posts) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          merged.push(p);
        }
      }
    }
    return merged;
  }, [postsQuery.data]);

  const startEdit = () => {
    setBio(profile?.bio ?? '');
    setExpertise(profile?.subject_expertise ?? '');
    setAvatarPick(null);
    setEditing(true);
  };

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showDanger('Curious Bright needs photo access to change your avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];
    setAvatarPick({
      uri: asset.uri,
      name: asset.fileName || 'avatar.jpg',
      type: asset.mimeType || 'image/jpeg',
    });
  };

  if (profileQuery.isLoading) {
    return <CuriousLoading message="Opening their page…" />;
  }
  if (profileQuery.isError || !profile) {
    return <CuriousError onRetry={() => profileQuery.refetch()} />;
  }

  const toggleFollowNow = () => {
    follow.mutate(
      { username, following },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: [...q.profile(username), 'is-following'] });
        },
      },
    );
  };

  const renderItem = ({ item, index }: { item: FeedPost; index: number }) => (
    <Animated.View entering={FadeInDown.duration(280).delay(Math.min(index, 6) * 40)}>
      <PostCard
        post={item}
        me={user ? { username: user.username, can_moderate: user.can_moderate } : null}
        onOpen={() => router.push(`/post/${item.id}`)}
        onOpenProfile={() => {
          if (item.author.username !== username) router.push(`/profile/${item.author.username}`);
        }}
        onToggleLike={() => like.mutate(item.id)}
      />
    </Animated.View>
  );

  return (
    <FlashList
      data={posts}
      getItemType={(item) => item.kind}
      key={username}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      onEndReached={() => {
        if (postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) postsQuery.fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View style={styles.header}>
          <NotebookCard style={styles.cardGap}>
            <View style={styles.identityRow}>
              <Pressable onPress={isMe && editing ? pickAvatar : undefined} disabled={!isMe || !editing}>
                <Avatar
                  username={profile.username}
                  uri={avatarPick?.uri || profile.avatar_url || profile.avatar}
                  size={64}
                />
                {isMe && editing ? (
                  <View style={[styles.cameraTag, { backgroundColor: colors.ink }]}>
                    <Ionicons name="camera" size={11} color={colors.paper} />
                  </View>
                ) : null}
              </Pressable>
              <View style={styles.identityText}>
                <Text style={[styles.name, { color: colors.ink }]}>{profile.username}</Text>
                {profile.subject_expertise ? (
                  <Text
                    style={[
                      styles.expertise,
                      { color: subjectColor(profile.subject_expertise), backgroundColor: `${subjectColor(profile.subject_expertise)}1A` },
                    ]}
                  >
                    helps with {profile.subject_expertise}
                  </Text>
                ) : null}
              </View>
              <View style={styles.actionCol}>
                {isMe ? (
                  <>
                    {!editing ? (
                      <Button small variant="secondary" title="Edit profile" onPress={startEdit} />
                    ) : null}
                    <Pressable
                      onPress={() => router.push('/settings')}
                      hitSlop={6}
                      style={[styles.gear, { borderColor: colors.line, backgroundColor: colors.paperHover }]}
                      accessibilityLabel="Settings"
                    >
                      <Ionicons name="settings-outline" size={16} color={colors.ink} />
                    </Pressable>
                  </>
                ) : user ? (
                  <Button
                    small
                    variant={following ? 'secondary' : 'primary'}
                    title={following ? 'Following' : 'Follow'}
                    onPress={toggleFollowNow}
                  />
                ) : null}
              </View>
            </View>

            <Text style={[styles.bio, { color: colors.fadedInk }]}>
              {profile.bio || 'This member hasn’t written a bio yet.'}
            </Text>
            {profile.school || profile.country ? (
              <View style={styles.metaRow}>
                {profile.school ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="school-outline" size={12} color={colors.fadedInk} />
                    <Text style={[styles.metaText, { color: colors.fadedInk }]} numberOfLines={1}>
                      {profile.school}
                    </Text>
                  </View>
                ) : null}
                {profile.country ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={12} color={colors.fadedInk} />
                    <Text style={[styles.metaText, { color: colors.fadedInk }]}>{profile.country}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {editing ? (
              <View style={[styles.editBlock, { borderTopColor: colors.line }]}>
                <Field label="Bio" value={bio} onChangeText={setBio} multiline maxLength={500} placeholder="What do you enjoy teaching or researching?" />
                <Field
                  label="Helps with (expertise)"
                  value={expertise}
                  onChangeText={setExpertise}
                  placeholder="e.g. Algebra, Essay writing, Machine learning"
                />
                <View style={styles.editActions}>
                  <Button
                    small
                    title={saveProfile.isPending ? 'Saving…' : 'Save'}
                    loading={saveProfile.isPending}
                    onPress={() => saveProfile.mutate({ bio, subject_expertise: expertise })}
                  />
                  <Button small variant="ghost" title="Cancel" onPress={() => setEditing(false)} />
                </View>
              </View>
            ) : null}

            <View style={[styles.statsRow, { borderTopColor: colors.line }]}>
              <Stat label="Posts" value={profile.post_count} />
              <Stat label="Followers" value={profile.followers_count} />
              <Stat label="Following" value={profile.following_count} />
              <Stat label="Badges" value={profile.badges.length || profile.badge_count} />
            </View>
          </NotebookCard>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <HighlighterText color="#F4B43D">Badges</HighlighterText>
            </Text>
            {profile.badges.length === 0 ? (
              <Text style={[styles.noBadges, { color: colors.fadedInk }]}>
                No badges yet — teach an answer, solve a problem, or collaborate on research.
              </Text>
            ) : (
              <View style={styles.badgeWrap}>
                {profile.badges.map((b) => (
                  <View
                    key={b.code}
                    style={[styles.badgeCard, { borderColor: colors.line, backgroundColor: colors.paperCard }]}
                  >
                    <Ionicons name="trophy-outline" size={16} color={colors.mustard} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.badgeName, { color: colors.ink }]}>{b.name}</Text>
                      <Text style={[styles.badgeDesc, { color: colors.fadedInk }]} numberOfLines={2}>
                        {b.description}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <HighlighterText color="#00A896">Posts</HighlighterText>
            </Text>
            {postsQuery.isLoading ? (
              <CuriousLoading message="Turning their pages…" />
            ) : postsQuery.isError ? (
              <CuriousError onRetry={() => postsQuery.refetch()} />
            ) : null}
          </View>
        </View>
      }
      ListEmptyComponent={
        !postsQuery.isLoading ? (
          <CuriousEmpty
            title="No posts yet"
            description={`${profile.username} hasn’t shared anything publicly.`}
            flourishText="Notebook"
          />
        ) : null
      }
      refreshing={postsQuery.isRefetching && !postsQuery.isFetchingNextPage}
      onRefresh={() => postsQuery.refetch()}
    />
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.ink }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.fadedInk }]}>{label}</Text>
    </View>
  );
}

async function imageBytes(uri: string): Promise<number | null> {
  try {
    const file = new File(uri);
    return file.size;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
    gap: spacing.md,
  },
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  cardGap: { gap: spacing.md },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  identityText: { flex: 1, gap: 4 },
  name: {
    fontFamily: 'ClashDisplay_700',
    fontSize: fontSize.h3,
  },
  expertise: {
    alignSelf: 'flex-start',
    fontFamily: fonts.mono,
    fontSize: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    overflow: 'hidden',
  },
  actionCol: { alignItems: 'flex-end', gap: spacing.sm },
  gear: {
    width: 34,
    height: 34,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraTag: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bio: {
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.small,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '48%' },
  metaText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.3 },
  editBlock: { borderTopWidth: 1.5, paddingTop: spacing.md, gap: spacing.md },
  editActions: { flexDirection: 'row', gap: spacing.sm },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1.5,
    paddingTop: spacing.md,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: 'ClashDisplay_600', fontSize: fontSize.body },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#6B685C',
  },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.lead },
  noBadges: { fontFamily: 'GeneralSans_400', fontSize: fontSize.small },
  badgeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
    maxWidth: '100%',
    minWidth: 150,
    flex: 1,
  },
  badgeName: { fontFamily: 'GeneralSans_600', fontSize: fontSize.small },
  badgeDesc: { fontFamily: 'GeneralSans_400', fontSize: fontSize.caption, marginTop: 1 },
});
