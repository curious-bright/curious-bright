import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ScreenHeader } from '../../src/components/layout/ScreenHeader';
import { Avatar } from '../../src/components/ui/Avatar';
import { Button } from '../../src/components/ui/Button';
import { CuriousError, CuriousLoading } from '../../src/components/ui/CuriousStates';
import { GridBackground } from '../../src/components/ui/GridBackground';
import { useStartConversation } from '../../src/hooks/useChat';
import { apiFetch, apiFetchStrict, apiVoid } from '../../src/lib/api';
import { useRealtime } from '../../src/lib/realtime';
import { fetchRoom, fetchRoomMembers, fetchRoomMessages, q } from '../../src/lib/queries';
import { fontSize, fonts, radii, spacing, useTheme } from '../../src/theme';
import { useAuth } from '../../src/state/AuthContext';
import type { RoomInfo, RoomMessage } from '../../src/lib/types';

function messageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (date.toDateString() === new Date().toDateString()) return 'Today';
  if (date.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function RoomScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const qc = useQueryClient();
  const rawId = useLocalSearchParams<{ id: string }>().id;
  const roomId = Number(rawId);
  const valid = Number.isFinite(roomId) && roomId > 0;

  const [text, setText] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<number>>(new Set());
  const typingTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const lastIdRef = useRef(0);
  const lastTypingSent = useRef(0);

  const roomQuery = useQuery({
    queryKey: q.room(roomId),
    queryFn: () => fetchRoom(roomId),
    enabled: valid,
  });
  const room = roomQuery.data;
  const joined = !!room?.is_member;

  const membersQuery = useQuery({
    queryKey: q.roomMembers(roomId),
    queryFn: () => fetchRoomMembers(roomId),
    enabled: valid && joined,
  });
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);

  const messagesQuery = useQuery({
    queryKey: q.roomMessages(roomId),
    queryFn: () => fetchRoomMessages(roomId),
    enabled: valid && joined,
  });
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  useEffect(() => {
    for (const m of messages) lastIdRef.current = Math.max(lastIdRef.current, m.id);
  }, [messages]);

  useEffect(() => {
    const timers = typingTimers.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  const appendMessages = useCallback(
    (incoming: RoomMessage[]) => {
      qc.setQueryData<RoomMessage[]>(q.roomMessages(roomId), (prev = []) => {
        const seen = new Set(prev.map((m) => m.id));
        const fresh = incoming.filter((m) => !seen.has(m.id));
        if (fresh.length === 0) return prev;
        for (const m of fresh) lastIdRef.current = Math.max(lastIdRef.current, m.id);
        return [...prev, ...fresh];
      });
    },
    [qc, roomId],
  );

  const pollNew = useCallback(async () => {
    if (lastIdRef.current > 0) {
      const incoming = await apiFetch<RoomMessage[]>(
        `/rooms/${roomId}/messages/?after=${lastIdRef.current}`,
      );
      if (Array.isArray(incoming)) appendMessages(incoming);
    } else {
      const incoming = await apiFetch<RoomMessage[]>(`/rooms/${roomId}/messages/`);
      if (Array.isArray(incoming)) appendMessages(incoming);
    }
  }, [roomId, appendMessages]);

  const { connected, send } = useRealtime(
    valid && joined ? `/ws/rooms/${roomId}/` : null,
    ({ event, data }) => {
      if (event === 'room.message') {
        appendMessages([data as RoomMessage]);
        return;
      }
      if (event === 'room.members') {
        const payload = data as { members: { id: number }[] };
        setOnlineIds(new Set(payload.members.map((m) => m.id)));
        return;
      }
      if (event === 'room.presence') {
        const payload = data as { action: 'joined' | 'left'; user: { id: number } };
        setOnlineIds((prev) => {
          const next = new Set(prev);
          if (payload.action === 'joined') next.add(payload.user.id);
          else next.delete(payload.user.id);
          return next;
        });
        return;
      }
      if (event === 'room.typing') {
        const payload = data as { user: { id: number; username: string }; is_typing: boolean };
        if (user && payload.user.id === user.id) return;
        clearTimeout(typingTimers.current[payload.user.id]);
        if (payload.is_typing) {
          setTypingUsers((prev) => (prev.includes(payload.user.username) ? prev : [...prev, payload.user.username]));
          typingTimers.current[payload.user.id] = setTimeout(() => {
            setTypingUsers((prev) => prev.filter((name) => name !== payload.user.username));
          }, 4000);
        } else {
          setTypingUsers((prev) => prev.filter((name) => name !== payload.user.username));
        }
      }
    },
  );

  // REST fallback while the socket is down (web parity: 8s after=<lastId>).
  useEffect(() => {
    if (!valid || !joined || connected || roomQuery.isLoading) return;
    const timer = setInterval(() => void pollNew(), 8000);
    return () => clearInterval(timer);
  }, [valid, joined, connected, roomQuery.isLoading, pollNew]);

  const join = useMutation({
    mutationFn: () => apiFetchStrict<RoomInfo>(`/rooms/${roomId}/join/`, { method: 'POST' }),
    onSuccess: (updated) => {
      qc.setQueryData(q.room(roomId), updated);
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: q.roomMembers(roomId) });
    },
  });

  const leave = useMutation({
    mutationFn: () => apiVoid(`/rooms/${roomId}/join/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: q.room(roomId) });
      qc.invalidateQueries({ queryKey: ['rooms'] });
      router.back();
    },
  });

  const startChat = useStartConversation((id) => router.push(`/chat/${id}`));

  const postMessage = useMutation({
    mutationFn: ({ content, tempId }: { content: string; tempId: number }) =>
      apiFetchStrict<RoomMessage>(`/rooms/${roomId}/messages/`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }).then((created) => ({ created, tempId })),
    onMutate: ({ content, tempId }) => {
      if (!user) return;
      appendMessages([
        {
          id: tempId,
          room: roomId,
          sender: { id: user.id, username: user.username },
          content,
          created_at: new Date().toISOString(),
          pending: true,
        },
      ]);
    },
    onSuccess: ({ created, tempId }) => {
      qc.setQueryData<RoomMessage[]>(q.roomMessages(roomId), (prev = []) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === created.id) ? withoutTemp : [...withoutTemp, created];
      });
      send({ type: 'typing', is_typing: false });
    },
    onError: (_err, { content, tempId }) => {
      qc.setQueryData<RoomMessage[]>(q.roomMessages(roomId), (prev = []) => prev.filter((m) => m.id !== tempId));
      setText((current) => current || content);
    },
  });

  const submit = () => {
    const content = text.trim();
    if (!content || postMessage.isPending || !joined) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setText('');
    postMessage.mutate({ content, tempId: -Date.now() });
  };

  if (!valid) {
    return (
      <View style={[styles.root, { backgroundColor: colors.paper }]}>
        <ScreenHeader eyebrow="Room" title="Not found" />
        <CuriousError title="Bad room link" message="This room address is not valid." />
      </View>
    );
  }

  if (roomQuery.isLoading || messagesQuery.isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.paper }]}>
        <ScreenHeader eyebrow="Room" title={room?.name ?? 'Study room'} />
        <CuriousLoading message="Opening study room…" />
      </View>
    );
  }

  if (!room) {
    return (
      <View style={[styles.root, { backgroundColor: colors.paper }]}>
        <ScreenHeader eyebrow="Room" title="Study room" />
        <CuriousError onRetry={() => roomQuery.refetch()} />
      </View>
    );
  }

  if (!joined) {
    return (
      <View style={[styles.root, { backgroundColor: colors.paper }]}>
        <GridBackground />
        <ScreenHeader eyebrow="Members only workspace" title={room.name} />
        <View style={styles.gateWrap}>
          <View style={[styles.gateCard, { borderColor: colors.line, backgroundColor: colors.paperCard }]}>
            <View style={[styles.gateIcon, { backgroundColor: `${colors.teal}1A` }]}>
              <Ionicons name="people" size={22} color={colors.teal} />
            </View>
            <Text style={[styles.gateTitle, { color: colors.ink }]}>Join “{room.name}”</Text>
            {room.topic ? (
              <View style={[styles.topicTag, { backgroundColor: `${colors.mustard}1A`, borderColor: colors.mustard }]}>
                <Text style={[styles.topicText, { color: colors.ink }]}>{room.topic}</Text>
              </View>
            ) : null}
            <Text style={[styles.gateBody, { color: colors.fadedInk }]}>
              {room.description ? `${room.description}\n\n` : ''}
              {room.member_count} {room.member_count === 1 ? 'member is' : 'members are'} already
              collaborating here. Join to read the discussion and chat live.
            </Text>
            <Button
              title={join.isPending ? 'Joining…' : 'Join study room'}
              loading={join.isPending}
              onPress={() => join.mutate()}
            />
            {join.isError ? (
              <Text style={[styles.gateError, { color: colors.danger }]}>
                Could not join right now. Please try again.
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  const meId = user?.id;

  const renderRow = ({ item, index }: { item: RoomMessage; index: number }) => {
    const mine = !!meId && item.sender.id === meId;
    const prev = index > 0 ? messages[index - 1] : null;
    const showDay = !prev || dayKey(prev.created_at) !== dayKey(item.created_at);
    return (
      <View>
        {showDay ? (
          <Text style={[styles.daySeparator, { color: colors.fadedInk }]}>{dayLabel(item.created_at)}</Text>
        ) : null}
        <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
          {!mine && (
            <Pressable onPress={() => router.push(`/profile/${item.sender.username}`)}>
              <Avatar
                username={item.sender.username}
                uri={item.sender.profile?.avatar_url || item.sender.profile?.avatar}
                size={28}
                ring={onlineIds.has(item.sender.id)}
              />
            </Pressable>
          )}
          <View
            style={[
              styles.bubble,
              {
                backgroundColor: mine ? colors.ink : colors.paperCard,
                borderColor: mine ? colors.ink : colors.line,
              },
            ]}
          >
            {!mine ? (
              <Text style={[styles.sender, { color: colors.teal }]}>@{item.sender.username}</Text>
            ) : null}
            <Text style={[styles.bubbleText, { color: mine ? colors.paper : colors.ink }]}>{item.content}</Text>
            <View style={styles.metaRow}>
              <Text style={[styles.meta, { color: mine ? 'rgba(247,246,242,0.55)' : colors.fadedInk }]}>
                {messageTime(item.created_at)}
              </Text>
              {mine && item.pending ? (
                <Text style={[styles.meta, { color: colors.mustard }]}>Sending…</Text>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <View style={[styles.root, { backgroundColor: colors.paper }]}>
        <ScreenHeader
          eyebrow={`${room.topic || 'Study room'} · ${room.member_count} member${room.member_count === 1 ? '' : 's'}`}
          title={room.name}
          right={
            <View style={styles.headerActions}>
              <View
                style={[
                  styles.liveDot,
                  { backgroundColor: connected ? colors.teal : colors.coral },
                ]}
              />
              {!room.mine ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => leave.mutate()}
                  disabled={leave.isPending}
                  style={[styles.iconBtn, { borderColor: colors.line, backgroundColor: colors.paperCard }]}
                  accessibilityLabel="Leave room"
                >
                  <Ionicons name="log-out-outline" size={17} color={colors.fadedInk} />
                </Pressable>
              ) : null}
            </View>
          }
        />

        {members.length > 0 ? (
          <View style={[styles.railWrap, { borderBottomColor: colors.line }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {members.slice(0, 15).map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    if (m.user.id === meId) return;
                    Haptics.selectionAsync().catch(() => {});
                    startChat.mutate(m.user.username);
                  }}
                  style={styles.railItem}
                  accessibilityLabel={m.user.id === meId ? 'You' : `Message @${m.user.username}`}
                >
                  <Avatar
                    username={m.user.username}
                    uri={m.user.profile?.avatar_url || m.user.profile?.avatar}
                    size={34}
                    ring={onlineIds.has(m.user.id)}
                  />
                  {onlineIds.has(m.user.id) ? (
                    <View style={[styles.onlineDot, { backgroundColor: colors.teal }]} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <FlashList
          data={messages}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
          ListEmptyComponent={
            <Text style={[styles.emptyNote, { color: colors.fadedInk }]}>
              No messages yet. Start the discussion below.
            </Text>
          }
        />

        {typingUsers.length > 0 ? (
          <Animated.View entering={FadeIn.duration(160)}>
            <Text style={[styles.typing, { color: colors.fadedInk }]} numberOfLines={1}>
              {typingUsers.map((n) => `@${n}`).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
            </Text>
          </Animated.View>
        ) : null}

        <View style={[styles.composer, { borderTopColor: colors.line, backgroundColor: colors.paper }]}>
          <TextInput
            value={text}
            onChangeText={(value) => {
              setText(value);
              const now = Date.now();
              if (value.trim() && now - lastTypingSent.current > 1500) {
                lastTypingSent.current = now;
                send({ type: 'typing', is_typing: true });
              }
            }}
            placeholder={`Message #${room.name}…`}
            placeholderTextColor={colors.fadedInk}
            multiline
            maxLength={2000}
            style={[
              styles.input,
              { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paperCard },
            ]}
          />
          <Pressable
            onPress={submit}
            disabled={!text.trim() || postMessage.isPending}
            style={[
              styles.sendBtn,
              { backgroundColor: text.trim() ? colors.teal : colors.line, opacity: text.trim() ? 1 : 0.6 },
            ]}
            accessibilityLabel="Send message"
          >
            {postMessage.isPending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="paper-plane" size={17} color="#FFF" />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateWrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  gateCard: {
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  gateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateTitle: { fontFamily: fonts.display, fontSize: fontSize.h2, textAlign: 'center' },
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
  gateBody: {
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    lineHeight: 20,
    textAlign: 'center',
  },
  gateError: { fontFamily: fonts.body, fontSize: fontSize.caption },
  railWrap: { borderBottomWidth: 1.5 },
  rail: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  railItem: { position: 'relative' },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  listContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    borderWidth: 1.5,
    borderRadius: radii.lg,
    borderBottomLeftRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sender: { fontFamily: fonts.mono, fontSize: 9.5, marginBottom: 3 },
  bubbleText: { fontFamily: fonts.body, fontSize: fontSize.body, lineHeight: 21 },
  metaRow: { flexDirection: 'row', gap: 6, alignSelf: 'flex-end', marginTop: 2 },
  meta: { fontFamily: fonts.mono, fontSize: 9 },
  daySeparator: {
    alignSelf: 'center',
    fontFamily: fonts.mono,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  emptyNote: {
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  typing: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.caption,
    paddingHorizontal: spacing.lg,
    paddingBottom: 4,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    borderTopWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    maxHeight: 110,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
