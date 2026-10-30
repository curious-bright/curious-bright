import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../src/components/layout/ScreenHeader';
import { Button } from '../src/components/ui/Button';
import { Field } from '../src/components/ui/Field';
import { showDanger, showInfo, showSuccess } from '../src/components/ui/Toast';
import { apiFetchStrict } from '../src/lib/api';
import { belongsInTab, upsertInFeed } from '../src/lib/feedCache';
import { ACADEMIC_LEVELS, SUBJECTS, subjectColor } from '../src/lib/subjects';
import { useAuth } from '../src/state/AuthContext';
import { fontSize, fonts, radii, spacing, useTheme } from '../src/theme';
import type { FeedPost } from '../src/lib/types';

const MAX_PDF_BYTES = 25 * 1024 * 1024;

interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
}

export default function SubmitScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('general');
  const [level, setLevel] = useState('high_school');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];
    let size: number | null = null;
    try {
      size = new File(asset.uri).size;
    } catch {
      size = asset.size ?? null;
    }
    if (size != null && size > MAX_PDF_BYTES) {
      showDanger('PDFs are limited to 25 MB.');
      return;
    }
    setFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType || 'application/pdf',
      size,
    });
  };

  const canSubmit = title.trim().length > 2 && description.trim().length > 0 && !!file && !!user;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('title', title.trim());
      form.append('body', description.trim());
      form.append('kind', 'resource');
      form.append('subject', subject);
      form.append('academic_level', level);
      form.append('attachment', {
        uri: file!.uri,
        name: file!.name,
        type: file!.mimeType,
      } as unknown as Blob);
      const created = await apiFetchStrict<FeedPost>('/posts/', { method: 'POST', body: form });
      if (belongsInTab(created, 'discover', user?.username)) upsertInFeed(qc, 'discover', created);
      if (belongsInTab(created, 'following', user?.username)) upsertInFeed(qc, 'following', created);
      qc.invalidateQueries({ queryKey: ['browse'] });
      qc.invalidateQueries({ queryKey: ['profile-posts'] });
      if (created.review_status && created.review_status !== 'published') {
        showInfo('Filed for review — it will appear once a moderator approves it.');
      } else {
        showSuccess('Resource shared.');
      }
      router.back();
    } catch {
      showDanger('Could not upload your PDF. Check the file size and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.paper, paddingTop: insets.top + spacing.xs }]}>
      <ScreenHeader eyebrow="Repository" title="Share a resource" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Field
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="What is this paper or note about?"
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="A short summary so classmates know what they are opening…"
            placeholderTextColor={colors.fadedInk}
            style={[
              styles.bodyInput,
              { color: colors.ink, backgroundColor: colors.paperCard, borderColor: colors.line },
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

          <Text style={[styles.sectionLabel, { color: colors.fadedInk }]}>Academic level</Text>
          <View style={styles.chipWrap}>
            {ACADEMIC_LEVELS.filter((l) => l.value !== 'ALL').map((l) => (
              <Pressable
                key={l.value}
                onPress={() => setLevel(l.value)}
                style={[
                  styles.chip,
                  {
                    borderColor: level === l.value ? colors.teal : colors.line,
                    backgroundColor: level === l.value ? `${colors.teal}1A` : colors.paperCard,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: level === l.value ? colors.teal : colors.fadedInk }]}>
                  {l.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.fadedInk }]}>PDF (max 25 MB)</Text>
          <Pressable
            onPress={pickPdf}
            style={[
              styles.dropZone,
              { borderColor: colors.lineDark, backgroundColor: colors.paperCard },
            ]}
          >
            {file ? (
              <View style={styles.fileRow}>
                <Ionicons name="document-text" size={22} color={colors.coral} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fileName, { color: colors.ink }]} numberOfLines={1}>
                    {file.name}
                  </Text>
                  {file.size != null ? (
                    <Text style={[styles.fileSize, { color: colors.fadedInk }]}>
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => setFile(null)}
                  accessibilityLabel="Remove file"
                >
                  <Ionicons name="close-circle" size={18} color={colors.fadedInk} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.dropInner}>
                <Ionicons name="cloud-upload-outline" size={26} color={colors.coral} />
                <Text style={[styles.dropText, { color: colors.ink }]}>Choose a PDF</Text>
                <Text style={[styles.dropHint, { color: colors.fadedInk }]}>
                  Original manuscripts & open notes up to 25 MB
                </Text>
              </View>
            )}
          </Pressable>

          <Button
            title={busy ? 'Uploading…' : 'Upload to the repository'}
            onPress={() => void submit()}
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
    minHeight: 110,
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
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontFamily: 'GeneralSans_500',
    fontSize: fontSize.caption,
  },
  dropZone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  dropInner: { alignItems: 'center', gap: 4 },
  dropText: { fontFamily: 'GeneralSans_600', fontSize: fontSize.small },
  dropHint: { fontFamily: fonts.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fileName: { fontFamily: 'GeneralSans_600', fontSize: fontSize.small },
  fileSize: { fontFamily: fonts.mono, fontSize: 10, marginTop: 1 },
  submit: { marginTop: spacing.sm },
});
