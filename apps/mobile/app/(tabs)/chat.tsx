import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
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
import { Avatar } from '../../src/components/ui/Avatar';
import { CuriousEmpty, CuriousError, CuriousLoading } from '../../src/components/ui/CuriousStates';
import { useStartConversation } from '../../src/hooks/useChat';
import { fetchConversations, fetchSearch, q } from '../../src/lib/queries';
import { fontSize, fonts, radii, spacing, useTheme } from '../../src/theme';
import type { ConversationSummary } from '../../src/lib/types';

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function previewLine(conversation: ConversationSummary): string {
  if (conversation.is_blocked) return 'Blocked';
  if (conversation.last_message?.deleted) return 'Message deleted';
  return conversation.last_message?.body || 'Say hello';
}

function NewChatSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const start = useStartConversation((id) => {
    onClose();
    router.push(`/chat/${id}`);
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(timer);
  }, [term]);

  const { data, isFetching } = useQuery({
    queryKey: q.search(`chat-users:${debounced}`),
    queryFn: () => fetchSearch(debounced),
    enabled: visible && debounced.length >= 2,
  });
  const users = useMemo(() => (data?.users ?? []).slice(0, 12), [data]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: 'rgba(20,20,26,0.5)' }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.paper, borderTopColor: colors.line }]}>
        <View style={styles.sheetHead}>
          <Text style={[styles.sheetTitle, { color: colors.ink }]}>New conversation</Text>
          <Pressable hitSlop={10} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.fadedInk} />
          </Pressable>
        </View>
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder="Search members by name…"
          placeholderTextColor={colors.fadedInk}
          autoCapitalize="none"
          autoFocus
          style={[
            styles.sheetInput,
            { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paperCard },
          ]}
        />
        {debounced.length < 2 ? (
          <Text style={[styles.sheetHint, { color: colors.fadedInk }]}>
            Type at least two letters to find someone.
          </Text>
        ) : isFetching ? (
          <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.coral} />
        ) : users.length === 0 ? (
          <Text style={[styles.sheetHint, { color: colors.fadedInk }]}>
            No members match “{debounced}”.
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
            {users.map((u) => (
              <Pressable
                key={u.username}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  start.mutate(u.username);
                }}
                style={[styles.sheetRow, { borderColor: colors.line, backgroundColor: colors.paperCard }]}
              >
                <Avatar username={u.username} uri={u.avatar_url} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.sheetName, { color: colors.ink }]}>@{u.username}</Text>
                  {u.subject_expertise ? (
                    <Text style={[styles.sheetMeta, { color: colors.fadedInk }]} numberOfLines={1}>
                      helps with {u.subject_expertise}
                    </Text>
                  ) : null}
                </View>
                {start.isPending && start.variables === u.username ? (
                  <ActivityIndicator color={colors.coral} size="small" />
                ) : (
                  <Ionicons name="chatbubble-outline" size={16} color={colors.coral} />
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export default function ChatScreen() {
  const { colors } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  const {
    data: conversations = [],
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({ queryKey: q.conversations, queryFn: fetchConversations });

  const renderItem = ({ item, index }: { item: ConversationSummary; index: number }) => (
    <Animated.View entering={FadeInDown.duration(280).delay(Math.min(index, 8) * 35)} style={styles.cell}>
      <Pressable
        onPress={() => router.push(`/chat/${item.id}`)}
        style={[styles.row, { borderColor: colors.line, backgroundColor: colors.paperCard }]}
      >
        <Avatar username={item.other_user.username} uri={item.other_user.profile?.avatar_url || item.other_user.profile?.avatar} size={42} />
        <View style={styles.rowCopy}>
          <View style={styles.rowTop}>
            <Text style={[styles.rowName, { color: colors.ink }]} numberOfLines={1}>
              @{item.other_user.username}
            </Text>
            <Text style={[styles.rowTime, { color: colors.fadedInk }]}>{timeAgo(item.updated_at)}</Text>
          </View>
          <Text
            style={[
              styles.rowPreview,
              { color: item.is_blocked ? colors.danger : colors.fadedInk },
            ]}
            numberOfLines={1}
          >
            {previewLine(item)}
          </Text>
        </View>
        {item.unread_count > 0 ? (
          <View style={[styles.unreadPill, { backgroundColor: colors.mustard }]}>
            <Text style={styles.unreadText}>{item.unread_count > 9 ? '9+' : item.unread_count}</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={15} color={colors.lineDark} />
        )}
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <GridBackground />
      <ScreenEnter>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <HighlighterText>Messages</HighlighterText>
            <NotificationBell />
          </View>
          <Text style={[styles.subtitle, { color: colors.fadedInk }]}>
            Private threads. Only the two of you can read them.
          </Text>
        </View>

        {conversations.length === 0 && (isLoading || isError) ? (
          isError ? (
            <CuriousError onRetry={() => refetch()} />
          ) : (
            <CuriousLoading message="Opening your conversations…" />
          )
        ) : (
          <FlashList
            data={conversations}
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
                title="No conversations yet"
                description="Start one from a member's profile or with the compose button."
                flourishText="Private"
              />
            }
          />
        )}
      </ScreenEnter>

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setSheetOpen(true);
        }}
        style={[styles.fab, { backgroundColor: colors.coral }]}
        accessibilityLabel="New conversation"
      >
        <Ionicons name="pencil" size={20} color="#FFF" />
        <View style={styles.fabEar} />
      </Pressable>

      <NewChatSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
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
  subtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    marginBottom: spacing.sm,
  },
  cell: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  listEnd: { height: 140 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.small,
    flex: 1,
    minWidth: 0,
  },
  rowTime: {
    fontFamily: fonts.mono,
    fontSize: 10,
  },
  rowPreview: {
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    marginTop: 3,
  },
  unreadPill: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: '#14141A',
  },
  scrim: { flex: 1 },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: 0,
    borderWidth: 1.5,
    borderTopWidth: 1.5,
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
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: fontSize.h3,
  },
  sheetInput: {
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  sheetHint: {
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  sheetName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.small,
  },
  sheetMeta: {
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
});
