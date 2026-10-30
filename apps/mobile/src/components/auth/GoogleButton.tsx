import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { signInWithGoogle } from '../../lib/googleAuth';
import { useAuth } from '../../state/AuthContext';
import { fontSize, radii, spacing, useTheme } from '../../theme';
import { showDanger } from '../ui/Toast';

function GoogleG() {
  return (
    <Svg width={16} height={16} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <Path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.1C29.2 35.2 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.7l6.3 5.1C37 40.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </Svg>
  );
}

export function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  const { colors } = useTheme();
  const { setGoogleSession } = useAuth();
  const [busy, setBusy] = React.useState(false);

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const payload = await signInWithGoogle();
      await setGoogleSession(payload);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Google sign-in failed.';
      if (!/cancel/i.test(message)) showDanger(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={busy}
        style={({ pressed }) => [
          styles.btn,
          {
            borderColor: colors.line,
            backgroundColor: pressed ? colors.paperHover : colors.paperCard,
            opacity: busy ? 0.6 : 1,
          },
        ]}
        accessibilityLabel={label}
      >
        <GoogleG />
        <Text style={[styles.label, { color: colors.ink }]}>
          {busy ? 'Opening Google…' : label}
        </Text>
      </Pressable>
      <View style={styles.divider}>
        <View style={[styles.rule, { backgroundColor: colors.line }]} />
        <Text style={[styles.orText, { color: colors.fadedInk }]}>or</Text>
        <View style={[styles.rule, { backgroundColor: colors.line }]} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 46,
    borderWidth: 1.5,
    borderRadius: radii.md,
    borderTopRightRadius: 0,
  },
  label: {
    fontFamily: 'GeneralSans_600',
    fontSize: fontSize.body,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rule: { flex: 1, height: 1.5 },
  orText: {
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
