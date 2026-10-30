import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthShell } from '../src/components/auth/AuthShell';
import { Button } from '../src/components/ui/Button';
import { Field } from '../src/components/ui/Field';
import { ApiError } from '../src/lib/api';
import { useAuth } from '../src/state/AuthContext';
import { useTheme } from '../src/theme';

function ConsentRow({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onToggle} style={styles.consent} hitSlop={6}>
      <View
        style={[
          styles.checkbox,
          {
            borderColor: colors.lineDark,
            backgroundColor: checked ? colors.ink : 'transparent',
          },
        ]}
      >
        {checked ? <Ionicons name="checkmark" size={13} color={colors.paper} /> : null}
      </View>
      <Text style={[styles.consentText, { color: colors.fadedInk }]}>{label}</Text>
    </Pressable>
  );
}

export default function RegisterScreen() {
  const { register } = useAuth();
  const { colors } = useTheme();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!username.trim() || !email.trim() || !password) {
      setError('Fill in every field before signing the page.');
      return;
    }
    if (!acceptTerms || !acceptPrivacy) {
      setError('Accept the terms and privacy policy to continue.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register(username.trim(), email.trim(), password, acceptTerms, acceptPrivacy);
      router.push({ pathname: '/verify-email', params: { email: email.trim() } });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_unverified') {
        router.push({ pathname: '/verify-email', params: { email: email.trim() } });
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not create your account.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <Text style={[styles.heading, { color: colors.ink }]}>Join the notebook</Text>
      <Text style={[styles.sub, { color: colors.fadedInk }]}>
        Ask questions, share explanations and keep a public record of what you learn.
      </Text>

      <Field
        label="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoComplete="username"
      />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        onSubmitEditing={submit}
        error={error}
      />

      <ConsentRow
        checked={acceptTerms}
        onToggle={() => setAcceptTerms((v) => !v)}
        label="I accept the Terms of Use"
      />
      <ConsentRow
        checked={acceptPrivacy}
        onToggle={() => setAcceptPrivacy((v) => !v)}
        label="I accept the Privacy Policy"
      />

      <Button title={busy ? 'Creating…' : 'Create account'} onPress={submit} loading={busy} style={styles.cta} />

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.fadedInk }]}>Already writing with us? </Text>
        <Pressable onPress={() => router.replace('/login')} hitSlop={8}>
          <Text style={[styles.link, { color: colors.teal }]}>Sign in</Text>
        </Pressable>
      </View>
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
    marginBottom: 20,
  },
  consent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 3,
    borderTopRightRadius: 0,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentText: {
    fontFamily: 'GeneralSans_400',
    fontSize: 13,
    flex: 1,
  },
  cta: {
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  footerText: {
    fontFamily: 'GeneralSans_400',
    fontSize: 13,
  },
  link: {
    fontFamily: 'GeneralSans_600',
    fontSize: 13,
  },
});
