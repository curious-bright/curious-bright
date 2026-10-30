import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { AuthShell } from '../src/components/auth/AuthShell';
import { Button } from '../src/components/ui/Button';
import { Field } from '../src/components/ui/Field';
import { ApiError } from '../src/lib/api';
import { useAuth } from '../src/state/AuthContext';
import { useTheme } from '../src/theme';

export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    const ok = await requestPasswordReset(email.trim());
    setBusy(false);
    if (ok) setSent(true);
    else setError('Could not send the reset code. Try again shortly.');
  };

  return (
    <AuthShell>
      <Text style={[styles.heading, { color: colors.ink }]}>Reset password</Text>
      <Text style={[styles.sub, { color: colors.fadedInk }]}>
        {sent
          ? 'If that email has an account, a 6-digit reset code is on its way.'
          : 'Enter the email on your account and we will send a reset code.'}
      </Text>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        error={error}
      />
      {sent ? (
        <Button
          title="Enter the code"
          onPress={() =>
            router.push({ pathname: '/reset-password', params: { email: email.trim() } })
          }
        />
      ) : (
        <Button title={busy ? 'Sending…' : 'Send reset code'} onPress={submit} loading={busy} />
      )}
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
});
