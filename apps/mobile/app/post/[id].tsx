import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Avatar } from '../../src/components/ui/Avatar';
import { Button } from '../../src/components/ui/Button';
import { BadgeTag, SubjectChip } from '../../src/components/ui/Chip';
import { CuriousEmpty, CuriousError, CuriousLoading } from '../../src/components/ui/CuriousStates';
import { GridBackground } from '../../src/components/ui/GridBackground';
import { HighlighterText } from '../../src/components/ui/HighlighterText';
import { NotebookCard } from '../../src/components/ui/NotebookCard';
import { ScreenHeader } from '../../src/components/layout/ScreenHeader';
import { showDanger, showInfo, showSuccess, showUndo } from '../../src/components/ui/Toast';
import { useAuth } from '../../src/state/AuthContext';
import { useDeletePost, useToggleFollow, useToggleLike } from '../../src/hooks/useFeedActions';
import { apiFetchStrict } from '../../src/lib/api';
import { fetchPost, q } from '../../src/lib/queries';
import { mirrorPostInLists } from '../../src/lib/feedCache';
import { useRealtime } from '../../src/lib/realtime';
import { subjectColor } from '../../src/lib/subjects';
import { fontSize, fonts, radii, spacing, useTheme } from '../../src/theme';
import type { FeedComment, FeedPost } from '../../src/lib/types';

const MAX_DEPTH = 3;
const UNDO_MS = 30_000;

export default function PostDetailScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id: string }>();
  const postId = Number(params.id);

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');

  const query = useQuery({
    queryKey: q.post(postId),
    queryFn: () => fetchPost(postId),
    enabled: Number.isFinite(postId),
  });

  const reload = useCallback(() => {
    void query.refetch();
  }, [query]);

  useRealtime(Number.isFinite(postId) ? `/ws/posts/${postId}/` : null, () => {
    void qc.invalidateQueries({ queryKey: q.post(postId) });
  });

  const post = query.data;

  useEffect(() => {
    if (post) mirrorPostInLists(qc, post);
  }, [post, qc]);

  const isMine = !!post && (post.mine ?? user?.username === post.author.username);
  const canModerate = !!user?.can_moderate;
  const canDelete = !!post && (post.can_delete ?? (isMine || canModerate));
  const canEdit = !!post && (post.can_edit ?? isMine);

  const like = useToggleLike();
  const follow = useToggleFollow();
  const del = useDeletePost();

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: q.post(postId) });
  }, [qc, postId]);

  const addComment = useMutation({
    mutationFn: ({ body, parent }: { body: string; parent?: number }) =>
      apiFetchStrict<FeedComment>(`/posts/${postId}/comments/`, {
        method: 'POST',
        body: JSON.stringify({ body, ...(parent ? { parent } : {}) }),
      }),
    onSuccess: () => {
      setDraft('');
      setReplyTo(null);
      invalidate();
      showSuccess('Added to the margin.');
    },
    onError: () => showDanger('Could not post your comment.'),
  });

  const toggleHelpful = useMutation({
    mutationFn: (commentId: number) =>
      apiFetchStrict<{ helpful_count: number; i_found_helpful: boolean }>(`/comments/${commentId}/helpful/`, {
        method: 'POST',
      }),
    onSuccess: () => invalidate(),
  });

  const acceptAnswer = useMutation({
    mutationFn: (commentId: number) => apiFetchStrict(`/comments/${commentId}/accept/`, { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      showSuccess('Marked as the accepted answer.');
    },
    onError: () => showDanger('Could not accept this answer.'),
  });

  const solvePost = useMutation({
    mutationFn: () => apiFetchStrict(`/posts/${postId}/solve/`, { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      showSuccess('Solved — nice work.');
    },
  });

  const flagPost = useMutation({
    mutationFn: (reason: string) =>
      apiFetchStrict(`/posts/${postId}/flag/`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      setReporting(false);
      setReportReason('');
      showSuccess('Thanks — a moderator will take a look.');
    },
    onError: () => showDanger('Could not report this post right now.'),
  });

  const submitComment = () => {
    const body = draft.trim();
    if (!body || addComment.isPending) return;
    addComment.mutate({ body, parent: replyTo?.id });
  };

  const comments = useMemo(() => post?.comments ?? [], [post]);

  if (query.isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.paper, paddingTop: insets.top }]}>
        <GridBackground />
        <CuriousLoading message="Loading discussion…" />
      </View>
    );
  }
  if (query.isError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.paper, paddingTop: insets.top }]}>
        <GridBackground />
        <CuriousError onRetry={() => query.refetch()} />
      </View>
    );
  }
  if (!post) {
    return (
      <View style={[styles.root, { backgroundColor: colors.paper, paddingTop: insets.top }]}>
        <GridBackground />
        <CuriousEmpty
          title="Post not found"
          description="It may have been removed, or it is only visible to a different audience."
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <GridBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ paddingTop: insets.top + spacing.xs }}>
          <ScreenHeader eyebrow={post.kind} title={post.room_name ? `Room · ${post.room_name}` : 'Entry'} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(320)}>
          <NotebookCard style={styles.postCard}>
            <Pressable style={styles.authorRow} onPress={() => router.push(`/profile/${post.author.username}`)}>
              <Avatar
                username={post.author.username}
                uri={post.author.profile?.avatar}
                size={40}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.authorName, { color: colors.ink }]}>{post.author.username}</Text>
                <Text style={[styles.authorMeta, { color: colors.fadedInk }]}>
                  {new Date(post.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {post.is_edited ? ' · edited' : ''}
                </Text>
              </View>
              {user && !isMine ? (
                <Pressable
                  onPress={() =>
                    follow.mutate({
                      username: post.author.username,
                      following: !!post.is_following_author,
                    })
                  }
                  style={[
                    styles.followBtn,
                    {
                      borderColor: post.is_following_author ? colors.line : colors.ink,
                      backgroundColor: post.is_following_author ? colors.paperHover : colors.ink,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.followText,
                      { color: post.is_following_author ? colors.fadedInk : colors.paper },
                    ]}
                  >
                    {post.is_following_author ? 'Following' : 'Follow'}
                  </Text>
                </Pressable>
              ) : null}
            </Pressable>

            <Text style={styles.title}>
              <HighlighterText>{post.title}</HighlighterText>
            </Text>

            <View style={styles.tagRow}>
              <SubjectChip subject={post.subject} />
              <BadgeTag variant="coral">{post.kind}</BadgeTag>
              {post.is_solved ? <BadgeTag variant="teal" icon="checkmark-done">solved</BadgeTag> : null}
              {post.review_status && post.review_status !== 'published' ? (
                <BadgeTag variant="mustard" icon="hourglass-outline">in review</BadgeTag>
              ) : null}
              {post.room_name ? <BadgeTag icon="school-outline">{post.room_name}</BadgeTag> : null}
              {post.visibility !== 'public' ? (
                <BadgeTag icon="lock-closed-outline">{post.visibility_label ?? post.visibility}</BadgeTag>
              ) : null}
            </View>

            <Text style={[styles.body, { color: colors.ink }]}>{post.body}</Text>

            {post.equations.length ? (
              <View style={styles.eqWrap}>
                {post.equations.map((eq) => (
                  <View key={eq.id} style={[styles.eqChip, { borderColor: `${subjectColor(post.subject)}66` }]}>
                    <Text style={[styles.eqText, { color: subjectColor(post.subject) }]}>{eq.latex}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {post.attachment_url ? (
              <Pressable
                onPress={() => void Linking.openURL(post.attachment_url!)}
                style={[styles.attachment, { borderColor: colors.line, backgroundColor: colors.paperHover }]}
              >
                <Ionicons name="document-attach-outline" size={20} color={colors.coral} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.attachmentName, { color: colors.ink }]} numberOfLines={1}>
                    {post.attachment_name || 'Attached file'}
                  </Text>
                  <Text style={[styles.attachmentHint, { color: colors.fadedInk }]}>Open PDF</Text>
                </View>
                <Ionicons name="open-outline" size={16} color={colors.fadedInk} />
              </Pressable>
            ) : null}

            <View style={[styles.actionRow, { borderTopColor: colors.line }]}>
              <Pressable
                onPress={() => like.mutate(post.id)}
                hitSlop={8}
                style={styles.actionBtn}
                accessibilityLabel="Like"
              >
                <Ionicons
                  name={post.liked_by_me ? 'heart' : 'heart-outline'}
                  size={17}
                  color={post.liked_by_me ? colors.coral : colors.fadedInk}
                />
                <Text style={[styles.actionCount, { color: post.liked_by_me ? colors.coral : colors.fadedInk }]}>
                  {post.like_count}
                </Text>
              </Pressable>
              <View style={styles.actionBtn}>
                <Ionicons name="chatbubble-outline" size={16} color={colors.fadedInk} />
                <Text style={[styles.actionCount, { color: colors.fadedInk }]}>{post.comment_count}</Text>
              </View>
              {isMine && post.kind === 'question' && !post.is_solved ? (
                <Pressable onPress={() => solvePost.mutate()} hitSlop={8} style={styles.actionBtn}>
                  <Ionicons name="ribbon-outline" size={16} color={colors.teal} />
                  <Text style={[styles.actionLabel, { color: colors.teal }]}>Mark solved</Text>
                </Pressable>
              ) : null}
              {canEdit ? (
                <Pressable
                  onPress={() => router.push(`/composer?edit=${post.id}`)}
                  hitSlop={8}
                  style={styles.actionBtn}
                >
                  <Ionicons name="create-outline" size={16} color={colors.fadedInk} />
                  <Text style={[styles.actionLabel, { color: colors.fadedInk }]}>Edit</Text>
                </Pressable>
              ) : null}
              {user && !isMine ? (
                <Pressable onPress={() => setReporting((v) => !v)} hitSlop={8} style={styles.actionBtn}>
                  <Ionicons name="flag-outline" size={16} color={reporting ? colors.danger : colors.fadedInk} />
                  <Text style={[styles.actionLabel, { color: reporting ? colors.danger : colors.fadedInk }]}>
                    Report
                  </Text>
                </Pressable>
              ) : null}
              {canDelete ? (
                <Pressable
                  onPress={() => {
                    del.mutate(post, { onSuccess: () => router.back() });
                  }}
                  hitSlop={8}
                  style={styles.actionBtn}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <Text style={[styles.actionLabel, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              ) : null}
            </View>

            {reporting ? (
              <View style={[styles.reportBox, { borderColor: colors.line }]}>
                <TextInput
                  value={reportReason}
                  onChangeText={setReportReason}
                  placeholder="What is wrong with this post?"
                  placeholderTextColor={colors.fadedInk}
                  style={[styles.reportInput, { color: colors.ink, backgroundColor: colors.paperCard }]}
                />
                <Button
                  small
                  variant="danger"
                  title={flagPost.isPending ? 'Sending…' : 'Send report'}
                  disabled={!reportReason.trim()}
                  loading={flagPost.isPending}
                  onPress={() => flagPost.mutate(reportReason.trim())}
                />
              </View>
            ) : null}
          </NotebookCard>
          </Animated.View>

          <View style={styles.commentsHead}>
            <Text style={styles.commentsTitle}>
              <HighlighterText color={colors.teal}>
                {post.comment_count === 1 ? '1 margin note' : `${post.comment_count} margin notes`}
              </HighlighterText>
            </Text>
          </View>

          {comments.length === 0 ? (
            <Text style={[styles.noComments, { color: colors.fadedInk }]}>
              No replies yet — the first margin note is yours to write.
            </Text>
          ) : (
            comments.map((c, i) => (
              <Animated.View key={c.id} entering={FadeInDown.duration(280).delay(Math.min(i, 6) * 40)}>
                <CommentNode
                  comment={c}
                  depth={0}
                  canAccept={isMine && !post.is_solved}
                  onHelpful={(id) => toggleHelpful.mutate(id)}
                  onAccept={(id) => acceptAnswer.mutate(id)}
                  onReply={(target) => {
                    setReplyTo(target);
                    showInfo(`Replying to @${target.author?.username ?? 'someone'}.`);
                  }}
                />
              </Animated.View>
            ))
          )}

          {user ? (
            <View style={[styles.composer, { borderColor: colors.line, backgroundColor: colors.paperCard }]}>
              {replyTo ? (
                <View style={styles.replyBar}>
                  <Ionicons name="return-up-forward" size={12} color={colors.fadedInk} />
                  <Text style={[styles.replyText, { color: colors.fadedInk }]} numberOfLines={1}>
                    Replying to @{replyTo.author?.username}
                  </Text>
                  <Pressable hitSlop={8} onPress={() => setReplyTo(null)}>
                    <Ionicons name="close" size={13} color={colors.fadedInk} />
                  </Pressable>
                </View>
              ) : null}
              <TextInput
                value={draft}
                onChangeText={setDraft}
                multiline
                placeholder={replyTo ? 'Write your reply…' : 'Add a margin note…'}
                placeholderTextColor={colors.fadedInk}
                style={[styles.composerInput, { color: colors.ink }]}
              />
              <View style={styles.composerActions}>
                <Text style={[styles.composerHint, { color: colors.fadedInk }]}>
                  Teach it like you would in class.
                </Text>
                <Button
                  small
                  title={addComment.isPending ? 'Posting…' : 'Post'}
                  loading={addComment.isPending}
                  disabled={!draft.trim()}
                  onPress={submitComment}
                />
              </View>
            </View>
          ) : (
            <Text style={[styles.signInNote, { color: colors.fadedInk }]}>
              <Text style={{ color: colors.coral }} onPress={() => router.push('/login')}>
                Sign in
              </Text>{' '}
              to comment, reply and mark answers helpful.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function CommentNode({
  comment,
  depth,
  canAccept,
  onHelpful,
  onAccept,
  onReply,
}: {
  comment: FeedComment;
  depth: number;
  canAccept: boolean;
  onHelpful: (id: number) => void;
  onAccept: (id: number) => void;
  onReply: (comment: FeedComment) => void;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const qc = useQueryClient();

  const canEdit = !comment.is_deleted && (comment.can_edit ?? comment.mine);
  const canDeleteFlag = !comment.is_deleted && (comment.can_delete ?? comment.mine);

  const restoreTree = () => {
    void qc.invalidateQueries({ queryKey: q.post(comment.post) });
  };

  const saveEdit = useMutation({
    mutationFn: () =>
      apiFetchStrict(`/comments/${comment.id}/`, { method: 'PATCH', body: JSON.stringify({ body: editBody }) }),
    onSuccess: () => {
      setEditing(false);
      restoreTree();
    },
    onError: () => showDanger('Could not save that edit.'),
  });

  const remove = useMutation({
    mutationFn: () => apiFetchStrict(`/comments/${comment.id}/`, { method: 'DELETE' }),
    onSuccess: () => {
      restoreTree();
      showUndo({
        label: 'Comment deleted',
        title: comment.body.slice(0, 60),
        expiresAt: Date.now() + UNDO_MS,
        onUndo: async () => {
          try {
            await apiFetchStrict(`/comments/${comment.id}/restore/`, { method: 'POST' });
            showSuccess('Comment restored.');
          } catch {
            showDanger('That comment could no longer be restored.');
          } finally {
            restoreTree();
          }
        },
      });
    },
    onError: () => showDanger('Could not delete that comment.'),
  });

  if (comment.is_deleted) {
    return (
      <View style={[styles.deletedRow, { borderColor: colors.line }]}>
        <Ionicons name="trash-outline" size={13} color={colors.fadedInk} />
        <Text style={[styles.deletedText, { color: colors.fadedInk }]}>This comment was removed.</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.commentWrap,
        { borderColor: colors.line },
        depth > 0 && { marginLeft: spacing.lg, paddingLeft: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.line },
      ]}
    >
      <View style={styles.commentHead}>
        <Avatar username={comment.author?.username ?? '?'} uri={comment.author?.profile?.avatar} size={26} />
        <Text style={[styles.commentAuthor, { color: colors.ink }]}>{comment.author?.username ?? 'unknown'}</Text>
        {comment.is_accepted ? (
          <BadgeTag variant="teal" icon="checkmark-circle">accepted</BadgeTag>
        ) : null}
        {comment.is_edited ? (
          <Text style={[styles.editedMark, { color: colors.fadedInk }]}>edited</Text>
        ) : null}
      </View>

      {editing ? (
        <View style={styles.editBlock}>
          <TextInput
            value={editBody}
            onChangeText={setEditBody}
            multiline
            style={[styles.editInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paperCard }]}
          />
          <View style={styles.editActions}>
            <Button
              small
              title={saveEdit.isPending ? 'Saving…' : 'Save'}
              loading={saveEdit.isPending}
              disabled={!editBody.trim()}
              onPress={() => saveEdit.mutate()}
            />
            <Button small variant="ghost" title="Cancel" onPress={() => setEditing(false)} />
          </View>
        </View>
      ) : (
        <Text style={[styles.commentBody, { color: colors.ink }]}>{comment.body}</Text>
      )}

      <View style={styles.commentActions}>
        <Pressable onPress={() => onHelpful(comment.id)} hitSlop={8} style={styles.commentAction}>
          <Ionicons
            name={comment.i_found_helpful ? 'thumbs-up' : 'thumbs-up-outline'}
            size={13}
            color={comment.i_found_helpful ? colors.teal : colors.fadedInk}
          />
          <Text style={[styles.commentActionText, { color: comment.i_found_helpful ? colors.teal : colors.fadedInk }]}>
            Helped ({comment.helpful_count})
          </Text>
        </Pressable>
        {canAccept && !comment.is_accepted ? (
          <Pressable onPress={() => onAccept(comment.id)} hitSlop={8} style={styles.commentAction}>
            <Ionicons name="checkmark-circle-outline" size={13} color={colors.mustard} />
            <Text style={[styles.commentActionText, { color: colors.mustard }]}>Accept answer</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => onReply(comment)} hitSlop={8} style={styles.commentAction}>
          <Ionicons name="return-up-forward" size={12} color={colors.fadedInk} />
          <Text style={[styles.commentActionText, { color: colors.fadedInk }]}>Reply</Text>
        </Pressable>
        {canEdit ? (
          <Pressable onPress={() => setEditing(true)} hitSlop={8} style={styles.commentAction}>
            <Ionicons name="create-outline" size={12} color={colors.fadedInk} />
          </Pressable>
        ) : null}
        {canDeleteFlag ? (
          <Pressable onPress={() => remove.mutate()} hitSlop={8} style={styles.commentAction}>
            {remove.isPending ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Ionicons name="trash-outline" size={12} color={colors.danger} />
            )}
          </Pressable>
        ) : null}
      </View>

      {depth < MAX_DEPTH && comment.replies?.length ? (
        <View style={styles.replies}>
          {comment.replies.map((r) => (
            <CommentNode
              key={r.id}
              comment={r}
              depth={depth + 1}
              canAccept={false}
              onHelpful={onHelpful}
              onAccept={onAccept}
              onReply={onReply}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 140,
    gap: spacing.md,
  },
  postCard: { gap: spacing.md },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  authorName: { fontFamily: 'GeneralSans_600', fontSize: fontSize.small },
  authorMeta: { fontFamily: fonts.mono, fontSize: 10, marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.4 },
  followBtn: {
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  followText: { fontFamily: 'GeneralSans_600', fontSize: fontSize.caption },
  title: { fontFamily: 'ClashDisplay_600', fontSize: fontSize.h2, lineHeight: 32 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  body: {
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.body,
    lineHeight: 24,
  },
  eqWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  eqChip: {
    borderWidth: 1,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  eqText: { fontFamily: fonts.mono, fontSize: fontSize.caption },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    padding: spacing.md,
  },
  attachmentName: { fontFamily: 'GeneralSans_600', fontSize: fontSize.small },
  attachmentHint: { fontFamily: fonts.mono, fontSize: 10, marginTop: 1 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.lg,
    borderTopWidth: 1.5,
    paddingTop: spacing.md,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionCount: { fontFamily: fonts.mono, fontSize: fontSize.caption },
  actionLabel: { fontFamily: 'GeneralSans_500', fontSize: fontSize.caption },
  reportBox: {
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    padding: spacing.md,
    gap: spacing.sm,
  },
  reportInput: {
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.small,
  },
  commentsHead: { marginTop: spacing.sm },
  commentsTitle: { fontFamily: 'ClashDisplay_600', fontSize: fontSize.h3 },
  noComments: { fontFamily: 'GeneralSans_400', fontSize: fontSize.small },
  commentWrap: {
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    padding: spacing.md,
    gap: spacing.sm,
  },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  commentAuthor: { fontFamily: 'GeneralSans_600', fontSize: fontSize.small, flexShrink: 0 },
  editedMark: { fontFamily: fonts.mono, fontSize: 9, textTransform: 'uppercase' },
  commentBody: { fontFamily: 'GeneralSans_400', fontSize: fontSize.small, lineHeight: 21 },
  commentActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  commentAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  commentActionText: { fontFamily: 'GeneralSans_500', fontSize: fontSize.caption },
  editBlock: { gap: spacing.sm },
  editInput: {
    minHeight: 70,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    padding: spacing.md,
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.small,
    textAlignVertical: 'top',
  },
  editActions: { flexDirection: 'row', gap: spacing.sm },
  replies: { gap: spacing.sm },
  deletedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    padding: spacing.md,
  },
  deletedText: { fontFamily: fonts.mono, fontSize: fontSize.caption },
  composer: {
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    padding: spacing.md,
    gap: spacing.sm,
  },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  replyText: { flex: 1, fontFamily: fonts.mono, fontSize: 10 },
  composerInput: {
    minHeight: 60,
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.small,
    textAlignVertical: 'top',
  },
  composerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  composerHint: { fontFamily: fonts.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
  signInNote: { fontFamily: 'GeneralSans_400', fontSize: fontSize.small, textAlign: 'center' },
});
