import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../src/components/layout/ScreenHeader';
import { GridBackground } from '../src/components/ui/GridBackground';
import { NotebookCard } from '../src/components/ui/NotebookCard';
import { useAuth } from '../src/state/AuthContext';
import { API_URL, ApiError, apiFetchStrict } from '../src/lib/api';
import { showDanger, showSuccess } from '../src/components/ui/Toast';
import { fontSize, fonts, radii, spacing, useTheme, type ThemePreference } from '../src/theme';

const PREFS: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Paper', icon: 'sunny-outline' },
  { value: 'dark', label: 'Night desk', icon: 'moon-outline' },
];

function Row({
  icon,
  label,
  hint,
  color,
  faded,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  color: string;
  faded?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Ionicons name={icon} size={18} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color }]}>{label}</Text>
        {hint ? (
          <Text style={[styles.rowHint, { color: faded ?? color }]} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={15} color={color} opacity={0.5} /> : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { colors, preference, setPreference } = useTheme();
  const { logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [armedLogout, setArmedLogout] = useState(false);
  const [pushTesting, setPushTesting] = useState(false);
  const [pushHint, setPushHint] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const armLogout = () => {
    if (!armedLogout) {
      setArmedLogout(true);
      timerRef.current = setTimeout(() => setArmedLogout(false), 5000);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    void logout().then(() => router.replace('/login'));
  };

  const lineColor = colors.line;

  const sendTestPush = async () => {
    if (pushTesting) return;
    setPushTesting(true);
    try {
      await apiFetchStrict('/push/test/', { method: 'POST', body: JSON.stringify({}) });
      setPushHint(null);
      showSuccess('Test push queued — check the notification shade.');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Could not reach the server.';
      setPushHint(message);
      showDanger(message);
    } finally {
      setPushTesting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <GridBackground />
      <View style={{ paddingTop: insets.top + spacing.xs }}>
        <ScreenHeader eyebrow="Notebook" title="Settings" />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.sectionLabel, { color: colors.fadedInk }]}>Appearance</Text>
        <NotebookCard style={styles.card}>
          <View style={styles.prefRow}>
            {PREFS.map((p) => (
              <Pressable
                key={p.value}
                onPress={() => setPreference(p.value)}
                style={[
                  styles.prefBtn,
                  {
                    borderColor: preference === p.value ? colors.ink : colors.line,
                    backgroundColor: preference === p.value ? colors.ink : colors.paperCard,
                  },
                ]}
              >
                <Ionicons
                  name={p.icon}
                  size={16}
                  color={preference === p.value ? colors.paper : colors.fadedInk}
                />
                <Text
                  style={[
                    styles.prefText,
                    { color: preference === p.value ? colors.paper : colors.fadedInk },
                  ]}
                >
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </NotebookCard>

        <Text style={[styles.sectionLabel, { color: colors.fadedInk }]}>Account</Text>
        <NotebookCard style={styles.card} padded={false}>
          <View style={[styles.rowGroup, { borderColor: lineColor }]}>
            <Row
              icon="key-outline"
              label="Change password"
              hint="Choose a new sign-in secret"
              color={colors.ink}
              faded={colors.fadedInk}
              onPress={() => router.push('/change-password')}
            />
          </View>
        </NotebookCard>

        <Text style={[styles.sectionLabel, { color: colors.fadedInk }]}>Notifications</Text>
        <NotebookCard style={styles.card} padded={false}>
          <Row
            icon={pushTesting ? 'hourglass-outline' : 'notifications-outline'}
            label={pushTesting ? 'Sending test…' : 'Send a test notification'}
            hint={pushHint ?? 'Checks that this device is reachable while the app is closed'}
            color={colors.ink}
            faded={colors.fadedInk}
            onPress={() => void sendTestPush()}
          />
        </NotebookCard>

        <Text style={[styles.sectionLabel, { color: colors.fadedInk }]}>The fine print</Text>
        <NotebookCard style={styles.card} padded={false}>
          <View style={[styles.rowGroup, { borderColor: lineColor }]}>
            <Row
              icon="document-text-outline"
              label="Terms of use"
              color={colors.ink}
              onPress={() => router.push('/legal/terms')}
            />
            <View style={[styles.divider, { backgroundColor: lineColor }]} />
            <Row
              icon="shield-checkmark-outline"
              label="Privacy policy"
              color={colors.ink}
              onPress={() => router.push('/legal/privacy')}
            />
          </View>
        </NotebookCard>

        <Text style={[styles.sectionLabel, { color: colors.fadedInk }]}>Developer</Text>
        <NotebookCard style={styles.card} padded={false}>
          <Row icon="server-outline" label="API server" hint={API_URL} color={colors.ink} faded={colors.fadedInk} />
        </NotebookCard>

        <Pressable
          onPress={armLogout}
          style={[
            styles.logout,
            {
              borderColor: armedLogout ? colors.danger : colors.line,
              backgroundColor: armedLogout ? colors.danger : colors.paperCard,
            },
          ]}
        >
          <Ionicons
            name={armedLogout ? 'alert-circle' : 'log-out-outline'}
            size={18}
            color={armedLogout ? colors.paper : colors.danger}
          />
          <Text style={[styles.logoutText, { color: armedLogout ? colors.paper : colors.danger }]}>
            {armedLogout ? 'Tap again to sign out' : 'Sign out'}
          </Text>
        </Pressable>
        <Text style={[styles.logoutHint, { color: colors.fadedInk }]}>
          Signing out erases the cached notebook from this device.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 100,
    gap: spacing.md,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
  },
  card: { gap: 0 },
  prefRow: { flexDirection: 'row', gap: spacing.sm },
  prefBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingVertical: 12,
  },
  prefText: {
    fontFamily: 'GeneralSans_600',
    fontSize: fontSize.caption,
  },
  rowGroup: { borderWidth: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
    borderWidth: 0,
    borderBottomWidth: 0,
  },
  rowPressed: { opacity: 0.7 },
  rowLabel: { fontFamily: 'GeneralSans_600', fontSize: fontSize.small },
  rowHint: {
    fontFamily: fonts.mono,
    fontSize: 10,
    marginTop: 2,
    opacity: 0.6,
  },
  divider: { height: 1.5, marginHorizontal: spacing.md, opacity: 0.4 },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
    paddingVertical: 13,
    marginTop: spacing.lg,
  },
  logoutText: { fontFamily: 'GeneralSans_700', fontSize: fontSize.small },
  logoutHint: {
    fontFamily: fonts.mono,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
