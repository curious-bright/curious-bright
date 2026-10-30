import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GridBackground } from '../src/components/ui/GridBackground';
import { HighlighterText } from '../src/components/ui/HighlighterText';
import { NotebookCard } from '../src/components/ui/NotebookCard';
import { Button } from '../src/components/ui/Button';
import { ApiError } from '../src/lib/api';
import { useAuth } from '../src/state/AuthContext';
import { spacing, useTheme, fontSize, fonts } from '../src/theme';

export default function ConsentScreen() {
  const { user, acceptPolicies, logout } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [terms, setTerms] = useState(user?.consent?.terms?.accepted ?? false);
  const [privacy, setPrivacy] = useState(user?.consent?.privacy?.accepted ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (busy || !terms || !privacy) return;
    setBusy(true);
    setError(null);
    try {
      await acceptPolicies(terms, privacy);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record your consent.');
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) => (
    <Pressable onPress={onToggle} style={styles.row} hitSlop={6}>
      <View
        style={[
          styles.box,
          { borderColor: colors.lineDark, backgroundColor: checked ? colors.ink : 'transparent' },
        ]}
      >
        {checked ? <Ionicons name="checkmark" size={13} color={colors.paper} /> : null}
      </View>
      <Text style={[styles.rowText, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <GridBackground />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <HighlighterText color="#00A896">Before we start</HighlighterText>
        </View>
        <NotebookCard peelable={false}>
          <Text style={[styles.body, { color: colors.fadedInk }]}>
            Curious Bright stores your notes, questions and follows. Please read and accept the
            current policies to continue. You can review them any time from settings.
          </Text>
          {user?.consent?.last_updated ? (
            <Text style={[styles.updated, { color: colors.fadedInk }]}>
              {`Policies updated ${new Date(user.consent.last_updated).toLocaleDateString()}`}
            </Text>
          ) : null}

          <Row checked={terms} onToggle={() => setTerms((v) => !v)} label="I accept the Terms of Use" />
          <View style={styles.links}>
            <Pressable hitSlop={8} onPress={() => router.push('/legal/terms')}>
              <Text style={[styles.link, { color: colors.teal }]}>Read terms</Text>
            </Pressable>
          </View>
          <Row checked={privacy} onToggle={() => setPrivacy((v) => !v)} label="I accept the Privacy Policy" />
          <View style={styles.links}>
            <Pressable hitSlop={8} onPress={() => router.push('/legal/privacy')}>
              <Text style={[styles.link, { color: colors.teal }]}>Read privacy policy</Text>
            </Pressable>
          </View>

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          <Button
            title={busy ? 'Saving…' : 'Accept & continue'}
            onPress={accept}
            loading={busy}
            disabled={!terms || !privacy}
            style={styles.cta}
          />
          <Button
            title="Sign out"
            variant="ghost"
            small
            style={styles.logout}
            onPress={() => void logout().then(() => router.replace('/login'))}
          />
        </NotebookCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
    justifyContent: 'center',
  },
  brand: { alignSelf: 'center', marginBottom: spacing.xl },
  body: {
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.body,
    lineHeight: 23,
    marginBottom: spacing.sm,
  },
  updated: {
    fontFamily: fonts.mono,
    fontSize: 11,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.md,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: 3,
    borderTopRightRadius: 0,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    fontFamily: 'GeneralSans_500',
    fontSize: fontSize.small,
    flex: 1,
  },
  links: {
    marginLeft: 30,
    marginTop: 4,
  },
  link: {
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.caption,
    textDecorationLine: 'underline',
  },
  error: {
    fontFamily: 'GeneralSans_500',
    fontSize: fontSize.caption,
    marginTop: spacing.md,
  },
  cta: { marginTop: spacing.xl },
  logout: { marginTop: spacing.sm, alignSelf: 'center' },
});
