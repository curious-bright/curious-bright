import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { AuthShell } from '../src/components/auth/AuthShell';
import { Button } from '../src/components/ui/Button';
import { Field } from '../src/components/ui/Field';
import { showSuccess } from '../src/components/ui/Toast';
import { useAuth } from '../src/state/AuthContext';
import { useTheme } from '../src/theme';

export default function ResetPasswordScreen() {
  const { requestPasswordReset, resetPassword } = useAuth();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !email.trim() || !code || !next) {
      setError('Email, code and the new password are all required.');
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await resetPassword(email.trim(), code.trim(), next);
    setBusy(false);
    if (ok) {
      showSuccess('Password updated. Sign back in.');
      router.replace('/login');
    } else {
      setError('That code was rejected or has expired. Request a new one.');
    }
  };

  return (
    <AuthShell>
      <Text style={[styles.heading, { color: colors.ink }]}>New chapter</Text>
      <Text style={[styles.sub, { color: colors.fadedInk }]}>
        Paste the 6-digit code from your email and choose a fresh password.
      </Text>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Reset code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
      <Field
        label="New password"
        value={next}
        onChangeText={setNext}
        secureTextEntry
        onSubmitEditing={submit}
        error={error}
      />
      <Button title={busy ? 'Updating…' : 'Update password'} onPress={submit} loading={busy} />
      <Button
        title="Send a new code"
        variant="ghost"
        small
        style={styles.resend}
        onPress={() => {
          void requestPasswordReset(email.trim());
          showSuccess('Reset code re-sent.');
        }}
      />
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
  resend: {
    marginTop: 10,
    alignSelf: 'center',
  },
});
