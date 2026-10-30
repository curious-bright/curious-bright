import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthShell } from '../src/components/auth/AuthShell';
import { Button } from '../src/components/ui/Button';
import { Field } from '../src/components/ui/Field';
import { ApiError } from '../src/lib/api';
import { showSuccess } from '../src/components/ui/Toast';
import { useAuth } from '../src/state/AuthContext';
import { useTheme } from '../src/theme';

const DIGITS = 6;

export default function VerifyEmailScreen() {
  const { user, verifyEmail, resendVerification } = useAuth();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? user?.email ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const submit = async () => {
    if (busy || code.length !== DIGITS) return;
    setBusy(true);
    setError(null);
    try {
      const me = await verifyEmail(email.trim(), code);
      showSuccess('Email verified — welcome to the notebook.');
      if (me.must_change_password) router.replace('/change-password');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'That code did not match. Check the email and try again.',
      );
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!email.trim()) {
      setError('Enter the email you signed up with first.');
      return;
    }
    setCooldown(60);
    const ok = await resendVerification(email.trim());
    if (ok) showSuccess('A fresh code is on its way.');
  };

  const boxes = Array.from({ length: DIGITS }, (_, i) => code[i] ?? '');

  return (
    <AuthShell>
      <Text style={[styles.heading, { color: colors.ink }]}>Check your inbox</Text>
      <Text style={[styles.sub, { color: colors.fadedInk }]}>
        We sent a 6-digit code to confirm {email.trim() || 'your email'}.
      </Text>

      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <View style={styles.otpRow}>
        {boxes.map((digit, i) => (
          <View
            key={i}
            style={[
              styles.otpBox,
              {
                borderColor: error ? colors.danger : digit ? colors.coral : colors.line,
                backgroundColor: colors.paperCard,
              },
            ]}
          >
            <Text style={[styles.otpDigit, { color: colors.ink }]}>{digit}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={(t) => {
          setCode(t.replace(/[^0-9]/g, '').slice(0, DIGITS));
          setError(null);
        }}
        keyboardType="number-pad"
        maxLength={DIGITS}
        autoComplete="one-time-code"
        autoFocus
        style={styles.hiddenInput}
      />
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      <Button title={busy ? 'Verifying…' : 'Verify email'} onPress={submit} loading={busy} />

      <Pressable onPress={resend} disabled={cooldown > 0} hitSlop={8} style={styles.resend}>
        <Text style={[styles.resendText, { color: cooldown > 0 ? colors.fadedInk : colors.teal }]}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </Text>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: 'ClashDisplay_600',
    fontSize: 22,
    marginBottom: 4,
  },
  sub: {
    fontFamily: 'GeneralSans_400',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 10,
  },
  otpBox: {
    width: 40,
    height: 48,
    borderWidth: 1.5,
    borderRadius: 4,
    borderTopRightRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: {
    fontFamily: 'JetBrainsMono_400',
    fontSize: 20,
  },
  hiddenInput: {
    opacity: 0,
    height: 0,
    marginBottom: 0,
  },
  error: {
    fontFamily: 'GeneralSans_400',
    fontSize: 12,
    marginBottom: 10,
    textAlign: 'center',
  },
  resend: {
    alignSelf: 'center',
    marginTop: 14,
  },
  resendText: {
    fontFamily: 'GeneralSans_500',
    fontSize: 13,
  },
});
