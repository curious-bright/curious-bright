import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenEnter } from '../../src/components/layout/ScreenEnter';
import { GridBackground } from '../../src/components/ui/GridBackground';
import { HighlighterText } from '../../src/components/ui/HighlighterText';
import { NotificationBell } from '../../src/components/ui/NotificationBell';
import { Button } from '../../src/components/ui/Button';
import { CuriousEmpty, CuriousError, CuriousLoading } from '../../src/components/ui/CuriousStates';
import { apiFetchStrict } from '../../src/lib/api';
import { fetchRoomsPage, q } from '../../src/lib/queries';
import { fontSize, fonts, radii, spacing, useTheme } from '../../src/theme';
import type { RoomInfo } from '../../src/lib/types';

function CreateRoomSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () =>
      apiFetchStrict<RoomInfo>('/rooms/', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          topic: topic.trim() || 'General Study',
          description: description.trim(),
        }),
      }),
    onSuccess: (room) => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      onClose();
      setName('');
      setTopic('');
      setDescription('');
      if (room?.id) router.push(`/room/${room.id}`);
    },
  });

  const fieldStyle = {
    color: colors.ink,
    borderColor: colors.line,
    backgroundColor: colors.paperCard,
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: 'rgba(20,20,26,0.5)' }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.paper, borderTopColor: colors.line }]}>
        <View style={styles.sheetHead}>
          <Text style={[styles.sheetTitle, { color: colors.ink }]}>Create a study room</Text>
          <Pressable hitSlop={10} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.fadedInk} />
          </Pressable>
        </View>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Room name · e.g. Quantum Physics Ch. 3"
          placeholderTextColor={colors.fadedInk}
          maxLength={120}
          style={[styles.input, fieldStyle]}
        />
        <TextInput
          value={topic}
          onChangeText={setTopic}
          placeholder="Subject or topic tag (optional)"
          placeholderTextColor={colors.fadedInk}
          maxLength={80}
          style={[styles.input, fieldStyle]}
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What will you work on? Helps the right people find the room."
          placeholderTextColor={colors.fadedInk}
          multiline
          numberOfLines={3}
          maxLength={500}
          style={[styles.input, styles.inputMultiline, fieldStyle]}
        />
        <Button
          title={create.isPending ? 'Creating…' : 'Create room'}
          loading={create.isPending}
          disabled={!name.trim()}
          onPress={() => create.mutate()}
        />
        {create.isError ? (
          <Text style={[styles.sheetError, { color: colors.danger }]}>
            Could not create the room. Check the name and try again.
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

export default function RoomsScreen() {
  const { colors } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const rooms = useInfiniteQuery({
    queryKey: q.rooms(),
    queryFn: ({ pageParam }) => fetchRoomsPage(pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next,
  });

  const allRooms = useMemo(
    () => rooms.data?.pages.flatMap((p) => p.rooms) ?? [],
    [rooms.data],
  );
  const visibleRooms = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return allRooms;
    return allRooms.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        (r.topic || '').toLowerCase().includes(term) ||
        (r.description || '').toLowerCase().includes(term),
    );
  }, [allRooms, filter]);

  const renderRoom = ({ item, index }: { item: RoomInfo; index: number }) => (
    <Animated.View entering={FadeInDown.duration(280).delay(Math.min(index, 8) * 35)}>
      <Pressable
        onPress={() => router.push(`/room/${item.id}`)}
        style={[styles.card, { borderColor: colors.line, backgroundColor: colors.paperCard }]}
      >
        <View style={styles.cardTop}>
          <View
            style={[styles.topicTag, { backgroundColor: `${colors.mustard}1A`, borderColor: colors.mustard }]}
          >
            <Text style={[styles.topicText, { color: colors.ink }]}>
              {item.topic || 'General Topic'}
            </Text>
          </View>
          <View style={styles.tagGroup}>
            {item.mine ? (
              <View style={[styles.miniTag, { backgroundColor: `${colors.coral}1A` }]}>
                <Text style={[styles.miniTagText, { color: colors.coral }]}>HOST</Text>
              </View>
            ) : null}
            {!item.mine && item.is_member ? (
              <View style={[styles.miniTag, { backgroundColor: `${colors.teal}1A` }]}>
                <Text style={[styles.miniTagText, { color: colors.teal }]}>JOINED</Text>
              </View>
            ) : null}
            <View style={styles.members}>
              <Ionicons name="people-outline" size={12} color={colors.fadedInk} />
              <Text style={[styles.membersText, { color: colors.fadedInk }]}>{item.member_count}</Text>
            </View>
          </View>
        </View>
        <Text style={[styles.roomName, { color: colors.ink }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.roomDesc, { color: colors.fadedInk }]} numberOfLines={2}>
          {item.description ||
            'A shared study space with live chat and an always-visible member list.'}
        </Text>
        <View style={[styles.cardFoot, { borderTopColor: colors.line }]}>
          <Text style={[styles.host, { color: colors.fadedInk }]}>
            {item.mine ? 'You host this room' : item.created_by ? `Hosted by @${item.created_by}` : 'Hosted by the community'}
          </Text>
          <View style={[styles.openTag, { backgroundColor: colors.ink }]}>
            <Text style={[styles.openTagText, { color: colors.paper }]}>
              {item.is_member ? 'Open room' : 'Join room'}
            </Text>
            <Ionicons name="arrow-forward" size={12} color={colors.paper} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <GridBackground />
      <ScreenEnter>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <HighlighterText>Study Rooms</HighlighterText>
            <NotificationBell />
          </View>
          <Text style={[styles.subtitle, { color: colors.fadedInk }]}>
            Join co-authors and scholars in shared rooms for live discussion.
          </Text>
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Filter rooms by name or topic…"
            placeholderTextColor={colors.fadedInk}
            style={[
              styles.input,
              styles.filterInput,
              { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paperCard },
            ]}
          />
        </View>

        {rooms.isLoading ? (
          <CuriousLoading message="Opening the room directory…" />
        ) : rooms.isError ? (
          <CuriousError onRetry={() => rooms.refetch()} />
        ) : (
          <FlashList
            data={visibleRooms}
            renderItem={renderRoom}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={rooms.isRefetching}
                onRefresh={() => rooms.refetch()}
                tintColor={colors.coral}
                colors={[colors.coral]}
              />
            }
            onEndReached={() => {
              if (rooms.hasNextPage && !rooms.isFetchingNextPage) rooms.fetchNextPage();
            }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              rooms.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.coral} /> : null
            }
            ListEmptyComponent={
              allRooms.length === 0 ? (
                <CuriousEmpty
                  title="No study rooms yet"
                  description="Create the first room for your subject or manuscript."
                  flourishText="Rooms"
                />
              ) : (
                <CuriousEmpty
                  title="No rooms match that filter"
                  description="Try another name or topic."
                  flourishText="Filter"
                />
              )
            }
          />
        )}
      </ScreenEnter>

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setSheetOpen(true);
        }}
        style={[styles.fab, { backgroundColor: colors.teal }]}
        accessibilityLabel="Create a study room"
      >
        <Ionicons name="add" size={24} color="#FFF" />
        <View style={styles.fabEar} />
      </Pressable>

      <CreateRoomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
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
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    marginBottom: spacing.md,
  },
  input: {
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  filterInput: { marginBottom: spacing.sm },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
    gap: spacing.md,
  },
  card: {
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  topicTag: {
    borderWidth: 1,
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  topicText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tagGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  miniTag: { borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  miniTagText: { fontFamily: fonts.mono, fontSize: 8.5, letterSpacing: 0.5 },
  members: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  membersText: { fontFamily: fonts.mono, fontSize: 10 },
  roomName: { fontFamily: fonts.display, fontSize: fontSize.lead },
  roomDesc: { fontFamily: fonts.body, fontSize: fontSize.caption, lineHeight: 17 },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1.5,
    paddingTop: spacing.sm,
  },
  host: { fontFamily: fonts.bodyMedium, fontSize: 10.5 },
  openTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  openTagText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 88,
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    borderTopRightRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabEar: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 9,
    height: 9,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  scrim: { flex: 1 },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: 0,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: { fontFamily: fonts.display, fontSize: fontSize.h3 },
  sheetError: { fontFamily: fonts.body, fontSize: fontSize.caption, textAlign: 'center' },
});
