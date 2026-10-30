import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenHeader } from '../src/components/layout/ScreenHeader';
import { Button } from '../src/components/ui/Button';
import { Field } from '../src/components/ui/Field';
import { useCreatePost, useUpdatePost } from '../src/hooks/useFeedActions';
import { KINDS, SUBJECTS, subjectColor } from '../src/lib/subjects';
import { fetchPost, q } from '../src/lib/queries';
import { ApiError } from '../src/lib/api';
import { showDanger } from '../src/components/ui/Toast';
import { fontSize, radii, spacing, useTheme, fonts } from '../src/theme';
import type { PostVisibility } from '../src/lib/types';

interface EquationDraft {
  latex: string;
  description: string;
}

const VISIBILITIES: { value: PostVisibility; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'public', label: 'Public', icon: 'globe-outline' },
  { value: 'followers', label: 'Followers', icon: 'people-outline' },
  { value: 'room_only', label: 'Room', icon: 'lock-closed-outline' },
];

export default function ComposerScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ edit?: string }>();
  const editId = params.edit ? Number(params.edit) : null;

  const { data: existing } = useQuery({
    queryKey: q.post(editId ?? 'new'),
    queryFn: () => fetchPost(editId!),
    enabled: editId != null && !Number.isNaN(editId),
  });

  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const busy = createPost.isPending || updatePost.isPending;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('general');
  const [kind, setKind] = useState<string>('question');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [equations, setEquations] = useState<EquationDraft[]>([]);
  const [eqDraft, setEqDraft] = useState('');

  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setBody(existing.body);
    setSubject(existing.subject);
    setKind(existing.kind);
    setVisibility(existing.visibility);
    setEquations(existing.equations?.map((e) => ({ latex: e.latex, description: e.description })) ?? []);
  }, [existing]);

  const canSubmit = title.trim().length > 2 && body.trim().length > 0;

  const submit = () => {
    if (!canSubmit || busy) return;
    const payload = {
      title: title.trim(),
      body: body.trim(),
      subject,
      kind,
      visibility,
      equations: equations.filter((e) => e.latex.trim()).map((e) => ({ latex: e.latex.trim(), description: e.description })),
    };
    if (editId != null && existing) {
      updatePost.mutate(
        { postId: editId, patch: payload, expectedUpdatedAt: existing.updated_at },
        {
          onSuccess: () => router.back(),
          onError: (err) => {
            if (err instanceof ApiError && err.code === 'conflict') {
              showDanger('Someone changed this post while you were typing. Reload and try again.');
            } else {
              showDanger('Could not save your edits.');
            }
          },
        },
      );
      return;
    }
    createPost.mutate(payload, {
      onSuccess: () => router.back(),
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <ScreenHeader eyebrow={editId ? 'Amend' : 'New page'} title={editId ? 'Edit entry' : 'Compose'} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Field
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="What is this page about?"
          />
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            placeholder="Write it like you would in a notebook…"
            placeholderTextColor={colors.fadedInk}
            style={[
              styles.bodyInput,
              {
                color: colors.ink,
                backgroundColor: colors.paperCard,
                borderColor: colors.line,
              },
            ]}
          />

          <Text style={[styles.sectionLabel, { color: colors.fadedInk }]}>Subject</Text>
          <View style={styles.chipWrap}>
            {SUBJECTS.map((s) => (
              <Pressable
                key={s}
                onPress={() => setSubject(s)}
                style={[
                  styles.chip,
                  {
                    borderColor: subject === s ? subjectColor(s) : colors.line,
                    backgroundColor: subject === s ? `${subjectColor(s)}1A` : colors.paperCard,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: subject === s ? subjectColor(s) : colors.fadedInk }]}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.fadedInk }]}>Kind</Text>
          <View style={styles.chipWrap}>
            {KINDS.filter((k) => k !== 'resource').map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={[
                  styles.chip,
                  {
                    borderColor: kind === k ? colors.mustard : colors.line,
                    backgroundColor: kind === k ? `${colors.mustard}26` : colors.paperCard,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: kind === k ? colors.ink : colors.fadedInk }]}>{k}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.fadedInk }]}>Visibility</Text>
          <View style={styles.chipWrap}>
            {VISIBILITIES.map((v) => (
              <Pressable
                key={v.value}
                onPress={() => setVisibility(v.value)}
                style={[
                  styles.chip,
                  {
                    borderColor: visibility === v.value ? colors.teal : colors.line,
                    backgroundColor: visibility === v.value ? `${colors.teal}1A` : colors.paperCard,
                  },
                ]}
              >
                <Ionicons
                  name={v.icon}
                  size={13}
                  color={visibility === v.value ? colors.teal : colors.fadedInk}
                />
                <Text style={[styles.chipText, { color: visibility === v.value ? colors.teal : colors.fadedInk }]}>
                  {v.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.fadedInk }]}>Equations (optional)</Text>
          <View style={styles.eqRow}>
            <TextInput
              value={eqDraft}
              onChangeText={setEqDraft}
              placeholder="e = mc^2"
              placeholderTextColor={colors.fadedInk}
              style={[
                styles.eqInput,
                { color: colors.ink, backgroundColor: colors.paperCard, borderColor: colors.line },
              ]}
            />
            <Pressable
              onPress={() => {
                if (!eqDraft.trim()) return;
                setEquations((prev) => [...prev, { latex: eqDraft.trim(), description: '' }]);
                setEqDraft('');
              }}
              hitSlop={6}
              style={[styles.eqAdd, { borderColor: colors.line, backgroundColor: colors.paperCard }]}
            >
              <Ionicons name="add" size={18} color={colors.coral} />
            </Pressable>
          </View>
          {equations.length ? (
            <View style={styles.eqList}>
              {equations.map((eq, i) => (
                <Pressable
                  key={i}
                  onPress={() => setEquations((prev) => prev.filter((_, idx) => idx !== i))}
                  style={[styles.eqChip, { borderColor: colors.line, backgroundColor: colors.paperHover }]}
                >
                  <Text style={[styles.eqChipText, { color: colors.ink }]} numberOfLines={1}>
                    {eq.latex}
                  </Text>
                  <Ionicons name="close" size={12} color={colors.fadedInk} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <Button
            title={busy ? 'Saving…' : editId ? 'Save changes' : 'Pin to the notebook'}
            onPress={submit}
            loading={busy}
            disabled={!canSubmit}
            style={styles.submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  bodyInput: {
    minHeight: 140,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    padding: spacing.md,
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.body,
    lineHeight: 23,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontFamily: 'GeneralSans_500',
    fontSize: fontSize.caption,
    textTransform: 'lowercase',
  },
  eqRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  eqInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontFamily: fonts.mono,
    fontSize: fontSize.small,
  },
  eqAdd: {
    width: 38,
    height: 38,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eqList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  eqChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  eqChipText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    maxWidth: 180,
  },
  submit: {
    marginTop: spacing.xl,
  },
});
