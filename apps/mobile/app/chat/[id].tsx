import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import { showSuccess } from '../../src/components/ui/Toast';
import { useMarkConversationRead } from '../../src/hooks/useChat';
import { apiFetchStrict, apiVoid } from '../../src/lib/api';
import { useRealtime } from '../../src/lib/realtime';
import {
  fetchConversation,
  fetchConversationMessages,
  fetchConversations,
  q,
  type MessagePage,
} from '../../src/lib/queries';
import { fontSize, fonts, radii, spacing, useTheme } from '../../src/theme';
import { useAuth } from '../../src/state/AuthContext';
import type { ChatMessage, ConversationSummary } from '../../src/lib/types';

function mergeIncoming(rows: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  if (rows.some((row) => row.id === msg.id)) return rows;
  if (msg.client_id) {
    const idx = rows.findIndex((row) => row.pending && row.client_id === msg.client_id);
    if (idx >= 0) {
      const next = [...rows];
      next[idx] = msg;
      return next;
    }
  }
  return [...rows, msg];
}

function messageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (date.toDateString() === today) return 'Today';
  if (date.toDateString() === yesterday) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

interface ActionTarget {
  message: ChatMessage;
  mine: boolean;
}

export default function ConversationThreadScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const qc = useQueryClient();
  const rawId = useLocalSearchParams<{ id: string }>().id;
  const convId = Number(rawId);
  const valid = Number.isFinite(convId) && convId > 0;

  const [text, setText] = useState('');
  const [typingUser, setTypingUser] = useState('');
  const [action, setAction] = useState<ActionTarget | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const lastTypingSent = useRef(0);
  const typingHideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { data: conversations = [] } = useQuery({
    queryKey: q.conversations,
    queryFn: fetchConversations,
    enabled: valid,
  });
  const cached = conversations.find((c) => c.id === convId) ?? null;

  const {
    data: fetchedSummary,
    isPending: summaryPending,
    isError: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: q.conversation(convId),
    queryFn: () => fetchConversation(convId),
    enabled: valid && !cached,
  });
  const summary: ConversationSummary | null = cached ?? fetchedSummary ?? null;

  const { data: page, isLoading: messagesLoading } = useQuery({
    queryKey: q.messages(convId),
    queryFn: () => fetchConversationMessages(convId),
    enabled: valid,
  });
  const messages = page?.messages ?? [];
  const hasMore = !!page?.has_more;

  const markRead = useMarkConversationRead(convId);
  useEffect(() => {
    if (valid) markRead.mutate();
    // Opening the thread marks everything read (web parity).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, convId]);

  useEffect(() => () => clearTimeout(typingHideTimer.current), []);

  const updateMessages = useCallback(
    (fn: (rows: ChatMessage[]) => ChatMessage[]) => {
      qc.setQueryData<MessagePage>(q.messages(convId), (prev) =>
        prev ? { ...prev, messages: fn(prev.messages) } : prev,
      );
    },
    [qc, convId],
  );

  const { connected, send } = useRealtime(
    valid ? `/ws/conversations/${convId}/` : null,
    ({ event, data }) => {
      if (event === 'message.created') {
        const msg = data as ChatMessage;
        if (msg.conversation !== convId) return;
        updateMessages((rows) => mergeIncoming(rows, msg));
        if (user && msg.sender.id !== user.id) markRead.mutate();
      }
      if (event === 'message.deleted') {
        const msg = data as ChatMessage;
        updateMessages((rows) => rows.map((row) => (row.id === msg.id ? msg : row)));
      }
      if (event === 'message.read') {
        const payload = data as { reader_id: number; read_at: string };
        if (!user || payload.reader_id === user.id) return;
        updateMessages((rows) =>
          rows.map((row) =>
            row.sender.id === user.id && !row.read_at && !row.pending
              ? { ...row, read_at: payload.read_at }
              : row,
          ),
        );
      }
      if (event === 'conversation.typing') {
        const payload = data as { user: { id: number }; is_typing: boolean };
        if (user && payload.user.id === user.id) return;
        clearTimeout(typingHideTimer.current);
        if (payload.is_typing) {
          setTypingUser(summary?.other_user.username ?? 'Someone');
          typingHideTimer.current = setTimeout(() => setTypingUser(''), 2800);
        } else {
          setTypingUser('');
        }
      }
    },
  );

  const sendMessage = useMutation({
    mutationFn: ({ body, clientId }: { body: string; clientId: string }) =>
      apiFetchStrict<ChatMessage>(`/messages/conversations/${convId}/messages/`, {
        method: 'POST',
        body: JSON.stringify({ body, client_id: clientId }),
      }),
    onMutate: ({ body, clientId }) => {
      if (!user) return;
      const temp: ChatMessage = {
        id: -Date.now(),
        conversation: convId,
        sender: { id: user.id, username: user.username },
        body,
        client_id: clientId,
        created_at: new Date().toISOString(),
        read_at: null,
        deleted_at: null,
        deleted: false,
        pending: true,
      };
      updateMessages((rows) => [...rows, temp]);
    },
    onSuccess: (created) => {
      updateMessages((rows) => mergeIncoming(rows, created));
      send({ type: 'typing', is_typing: false });
      qc.invalidateQueries({ queryKey: q.conversations });
    },
    onError: () => {
      const clientId = sendMessage.variables?.clientId;
      updateMessages((rows) => rows.filter((row) => !(row.pending && row.client_id === clientId)));
      setText((current) => current || (sendMessage.variables?.body ?? ''));
    },
  });

  const submit = () => {
    const body = text.trim();
    if (!body || sendMessage.isPending || !summary?.can_send || summary.is_blocked) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setText('');
    sendMessage.mutate({ body, clientId: randomUUID() });
  };

  const deleteMessage = useMutation({
    mutationFn: (messageId: number) => apiVoid(`/messages/${messageId}/`, { method: 'DELETE' }),
    onSuccess: (_ok, messageId) => {
      updateMessages((rows) =>
        rows.map((row) =>
          row.id === messageId
            ? { ...row, body: '', deleted: true, deleted_at: new Date().toISOString() }
            : row,
        ),
      );
      setAction(null);
      // The sidebar preview and unread pill both come from the summary row.
      qc.invalidateQueries({ queryKey: q.conversations });
    },
  });

  const reportMessage = useMutation({
    mutationFn: ({ messageId, reason }: { messageId: number; reason: string }) =>
      apiVoid(`/messages/${messageId}/report/`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      setAction(null);
      setReporting(false);
      setReportReason('');
      showSuccess('Thanks — a moderator will take a look.');
    },
  });

  const block = useMutation({
    mutationFn: () => {
      const username = summary?.other_user.username;
      if (!username) throw new Error('no user');
      const endpoint = `/messages/blocks/${username}/`;
      return summary?.blocked_by_me
        ? apiVoid(endpoint, { method: 'DELETE' })
        : apiVoid(endpoint, { method: 'POST' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: q.conversations });
      qc.invalidateQueries({ queryKey: q.conversation(convId) });
    },
  });

  const loadOlder = async () => {
    const oldest = messages[0]?.id;
    if (!oldest || oldest < 0 || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await fetchConversationMessages(convId, oldest);
      qc.setQueryData<MessagePage>(q.messages(convId), (prev) => {
        if (!prev) return older;
        const seen = new Set(prev.messages.map((m) => m.id));
        return {
          messages: [...older.messages.filter((m) => !seen.has(m.id)), ...prev.messages],
          has_more: older.has_more,
        };
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  if (!valid) {
    return (
      <View style={[styles.root, { backgroundColor: colors.paper }]}>
        <ScreenHeader eyebrow="Private" title="Thread" />
        <CuriousError title="Bad thread link" message="This conversation address is not valid." />
      </View>
    );
  }

  if (!summary || !summary.other_user) {
    if (summaryPending || messagesLoading) {
      return (
        <View style={[styles.root, { backgroundColor: colors.paper }]}>
          <ScreenHeader eyebrow="Private" title="Thread" />
          <CuriousLoading message="Loading messages…" />
        </View>
      );
    }
    return (
      <View style={[styles.root, { backgroundColor: colors.paper }]}>
        <ScreenHeader eyebrow="Private" title="Thread" />
        <CuriousError
          title="Conversation unavailable"
          message="This thread was deleted, or it belongs to an account you can no longer message."
          onRetry={() => refetchSummary()}
        />
      </View>
    );
  }

  const canSend = summary.can_send && !summary.is_blocked && !summary.blocked_by_other;
  const meId = user?.id;

  const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    const mine = !!meId && item.sender.id === meId;
    const prev = index > 0 ? messages[index - 1] : null;
    const showDay = !prev || dayKey(prev.created_at) !== dayKey(item.created_at);
    return (
      <View style={styles.cell}>
        {showDay ? (
          <Text style={[styles.daySeparator, { color: colors.fadedInk }]}>{dayLabel(item.created_at)}</Text>
        ) : null}
        <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
          {!mine && (
            <Avatar
              username={item.sender.username}
              uri={item.sender.profile?.avatar_url || item.sender.profile?.avatar}
              size={28}
            />
          )}
          <Pressable
            onLongPress={
              item.deleted
                ? undefined
                : () => {
                    Haptics.selectionAsync().catch(() => {});
                    setReporting(false);
                    setAction({ message: item, mine });
                  }
            }
            delayLongPress={320}
            style={[
              styles.bubble,
              {
                backgroundColor: mine ? colors.ink : colors.paperCard,
                borderColor: mine ? colors.ink : colors.line,
              },
            ]}
          >
            {item.deleted ? (
              <Text style={[styles.bubbleDeleted, { color: colors.fadedInk }]}>
                This message was deleted
              </Text>
            ) : (
              <Text style={[styles.bubbleText, { color: mine ? colors.paper : colors.ink }]}>
                {item.body}
              </Text>
            )}
            <View style={styles.metaRow}>
              <Text style={[styles.meta, { color: mine ? 'rgba(247,246,242,0.55)' : colors.fadedInk }]}>
                {messageTime(item.created_at)}
              </Text>
              {mine && !item.deleted ? (
                <Text style={[styles.receipt, { color: item.read_at ? colors.teal : colors.mustard }]}>
                  {item.pending ? 'Sending…' : item.read_at ? 'Read' : 'Sent'}
                </Text>
              ) : null}
            </View>
          </Pressable>
        </View>
      </View>
    );
  };

  const blockedNote = summary.blocked_by_me
    ? 'You blocked this member. Unblock to send new messages; history stays available.'
    : summary.blocked_by_other
      ? 'This member blocked you. Your conversation history stays available.'
      : 'This member is not accepting new messages.';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <View style={[styles.root, { backgroundColor: colors.paper }]}>
        <ScreenHeader
          eyebrow={`@${summary.other_user.username}`}
          title={summary.is_blocked ? 'Messaging is blocked' : connected ? 'Private · realtime' : 'Private · reconnecting'}
          right={
            <View style={styles.headerActions}>
              {summary.blocked_by_me || !summary.blocked_by_other ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => block.mutate()}
                  disabled={block.isPending}
                  style={[
                    styles.iconBtn,
                    {
                      borderColor: colors.line,
                      backgroundColor: summary.blocked_by_me ? `${colors.coral}1A` : colors.paperCard,
                    },
                  ]}
                  accessibilityLabel={summary.blocked_by_me ? 'Unblock member' : 'Block member'}
                >
                  <Ionicons
                    name={summary.blocked_by_me ? 'ban' : 'ban-outline'}
                    size={17}
                    color={summary.blocked_by_me ? colors.danger : colors.fadedInk}
                  />
                </Pressable>
              ) : null}
              <Pressable
                hitSlop={8}
                onPress={() => router.push(`/profile/${summary.other_user.username}`)}
                style={[styles.iconBtn, { borderColor: colors.line, backgroundColor: colors.paperCard }]}
                accessibilityLabel="View profile"
              >
                <Ionicons name="person-outline" size={17} color={colors.ink} />
              </Pressable>
            </View>
          }
        />

        <FlashList
          data={messages}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
          ListHeaderComponent={
            hasMore ? (
              <Pressable
                onPress={() => void loadOlder()}
                style={[styles.olderBtn, { borderColor: colors.line, backgroundColor: colors.paperCard }]}
              >
                {loadingOlder ? (
                  <ActivityIndicator size="small" color={colors.coral} />
                ) : (
                  <Text style={[styles.olderText, { color: colors.fadedInk }]}>Load earlier messages</Text>
                )}
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            messagesLoading ? null : (
              <Text style={[styles.emptyNote, { color: colors.fadedInk }]}>
                No messages yet. Say hello below.
              </Text>
            )
          }
        />

        {typingUser ? (
          <Animated.View entering={FadeIn.duration(160)}>
            <Text style={[styles.typing, { color: colors.fadedInk }]}>@{typingUser} is typing…</Text>
          </Animated.View>
        ) : null}

        {canSend ? (
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
              placeholder="Write a private message…"
              placeholderTextColor={colors.fadedInk}
              multiline
              maxLength={4000}
              style={[
                styles.input,
                { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paperCard },
              ]}
            />
            <Pressable
              onPress={submit}
              disabled={!text.trim() || sendMessage.isPending}
              style={[
                styles.sendBtn,
                { backgroundColor: text.trim() ? colors.coral : colors.line, opacity: text.trim() ? 1 : 0.6 },
              ]}
              accessibilityLabel="Send message"
            >
              {sendMessage.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="paper-plane" size={17} color="#FFF" />
              )}
            </Pressable>
          </View>
        ) : (
          <View style={[styles.blockedNote, { borderTopColor: colors.line, backgroundColor: colors.paperHover }]}>
            <Ionicons name="lock-closed" size={14} color={colors.fadedInk} />
            <Text style={[styles.blockedText, { color: colors.fadedInk }]}>{blockedNote}</Text>
          </View>
        )}
      </View>

      <Modal visible={!!action} transparent animationType="fade" onRequestClose={() => setAction(null)}>
        <Pressable style={[styles.scrim, { backgroundColor: 'rgba(20,20,26,0.5)' }]} onPress={() => setAction(null)}>
          <View
            style={[styles.actionSheet, { backgroundColor: colors.paper, borderColor: colors.line }]}
            onStartShouldSetResponder={() => true}
          >
            {action && !action.mine && reporting ? (
              <>
                <Text style={[styles.actionTitle, { color: colors.ink }]}>Tell us what’s wrong</Text>
                <TextInput
                  value={reportReason}
                  onChangeText={setReportReason}
                  placeholder="Harassment, spam, or another safety concern…"
                  placeholderTextColor={colors.fadedInk}
                  multiline
                  maxLength={500}
                  style={[
                    styles.reportInput,
                    { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paperCard },
                  ]}
                />
                <Button
                  title={reportMessage.isPending ? 'Sending…' : 'Send report'}
                  variant="danger"
                  disabled={!reportReason.trim()}
                  onPress={() =>
                    action && reportMessage.mutate({ messageId: action.message.id, reason: reportReason.trim() })
                  }
                />
                <Button
                  title="Cancel"
                  variant="ghost"
                  onPress={() => {
                    setAction(null);
                    setReporting(false);
                    setReportReason('');
                  }}
                />
              </>
            ) : (
              <>
                <Text style={[styles.actionTitle, { color: colors.ink }]}>Message actions</Text>
                {action?.mine ? (
                  <Button
                    title={deleteMessage.isPending ? 'Deleting…' : 'Delete for everyone'}
                    variant="danger"
                    onPress={() => action && deleteMessage.mutate(action.message.id)}
                  />
                ) : (
                  <Button title="Report message" variant="secondary" onPress={() => setReporting(true)} />
                )}
                <Button
                  title="Cancel"
                  variant="ghost"
                  onPress={() => {
                    setAction(null);
                    setReporting(false);
                    setReportReason('');
                  }}
                />
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cell: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
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
  bubbleText: { fontFamily: fonts.body, fontSize: fontSize.body, lineHeight: 21 },
  bubbleDeleted: { fontFamily: fonts.body, fontSize: fontSize.small, fontStyle: 'italic' },
  metaRow: { flexDirection: 'row', gap: 6, alignSelf: 'flex-end', marginTop: 2 },
  meta: { fontFamily: fonts.mono, fontSize: 9 },
  receipt: { fontFamily: fonts.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 },
  daySeparator: {
    alignSelf: 'center',
    fontFamily: fonts.mono,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  olderBtn: {
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    alignSelf: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  olderText: { fontFamily: fonts.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
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
  blockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  blockedText: { flex: 1, fontFamily: fonts.body, fontSize: fontSize.caption, lineHeight: 17 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  actionSheet: {
    margin: spacing.md,
    marginBottom: spacing.xxl,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    borderTopRightRadius: 0,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  actionTitle: { fontFamily: fonts.display, fontSize: fontSize.h3, marginBottom: spacing.xs },
  reportInput: {
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    padding: spacing.md,
    minHeight: 90,
    textAlignVertical: 'top',
  },
});
