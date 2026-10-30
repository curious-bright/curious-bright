import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthShell } from '../src/components/auth/AuthShell';
import { GoogleButton } from '../src/components/auth/GoogleButton';
import { Button } from '../src/components/ui/Button';
import { Field } from '../src/components/ui/Field';
import { ApiError } from '../src/lib/api';
import { isGoogleSignInEnabled } from '../src/lib/googleAuth';
import { useAuth } from '../src/state/AuthContext';
import { useTheme } from '../src/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const { colors } = useTheme();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!identifier.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const me = await login(identifier.trim(), password);
      if (me.must_change_password) router.replace('/change-password');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_unverified') {
        const email = identifier.includes('@') ? identifier.trim() : '';
        router.push(
          email ? { pathname: '/verify-email', params: { email } } : '/verify-email',
        );
      } else {
        setError(err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <Text style={[styles.heading, { color: colors.ink }]}>Welcome Back</Text>
      <Text style={[styles.sub, { color: colors.fadedInk }]}>Sign in to teach, learn and collaborate with the community.</Text>

      {isGoogleSignInEnabled() ? <GoogleButton label="Continue with Google" /> : null}

      <Field
        label="Username or Email"
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoComplete="username"
        returnKeyType="next"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={error}
      />

      <Button title={busy ? 'Signing in…' : 'Sign In'} onPress={submit} loading={busy} />

      <Pressable
        onPress={() => router.push('/forgot-password')}
        hitSlop={8}
        style={styles.linkRow}
      >
        <Text style={[styles.link, { color: colors.teal }]}>Forgot password?</Text>
      </Pressable>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.fadedInk }]}>New to the notebook? </Text>
        <Pressable onPress={() => router.push('/register')} hitSlop={8}>
          <Text style={[styles.link, { color: colors.teal }]}>Create an account</Text>
        </Pressable>
      </View>

      <View style={styles.legal}>
        <Pressable hitSlop={8} onPress={() => router.push('/legal/terms')}>
          <Text style={[styles.legalText, { color: colors.fadedInk }]}>Terms</Text>
        </Pressable>
        <Ionicons name="ellipse" size={5} color={colors.fadedInk} />
        <Pressable hitSlop={8} onPress={() => router.push('/legal/privacy')}>
          <Text style={[styles.legalText, { color: colors.fadedInk }]}>Privacy</Text>
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
    opacity: 0.65,
    marginBottom: 20,
  },
  linkRow: {
    alignSelf: 'center',
    marginTop: 14,
  },
  link: {
    fontFamily: 'GeneralSans_600',
    fontSize: 13,
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
    opacity: 0.6,
  },
  legal: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  legalText: {
    fontFamily: 'JetBrainsMono_400',
    fontSize: 11,
    textDecorationLine: 'underline',
    opacity: 0.55,
  },
});
