import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NotebookScreen } from '../src/components/layout/ScreenEnter';
import { ScreenHeader } from '../src/components/layout/ScreenHeader';
import { NotebookCard } from '../src/components/ui/NotebookCard';
import { Button } from '../src/components/ui/Button';
import { Field } from '../src/components/ui/Field';
import { showSuccess } from '../src/components/ui/Toast';
import { useAuth } from '../src/state/AuthContext';
import { fontSize, spacing, useTheme } from '../src/theme';

export default function ChangePasswordScreen() {
  const { changePassword, user } = useAuth();
  const { colors } = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    if (!current || !next) {
      setError('Enter your current and new password.');
      return;
    }
    if (next !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await changePassword(current, next);
    setBusy(false);
    if (ok) {
      showSuccess('Password changed.');
      router.back();
    } else {
      setError('Your current password was not accepted.');
    }
  };

  return (
    <NotebookScreen>
      <ScreenHeader eyebrow="Account" title="Change password" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {user?.must_change_password ? (
          <Text style={[styles.notice, { color: colors.danger }]}>
            An admin requires you to choose a new password before continuing.
          </Text>
        ) : null}
        <NotebookCard peelable={false}>
          <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry />
          <Field label="New password" value={next} onChangeText={setNext} secureTextEntry />
          <Field
            label="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            onSubmitEditing={submit}
            error={error}
          />
          <Button title={busy ? 'Updating…' : 'Update password'} onPress={submit} loading={busy} />
        </NotebookCard>
      </ScrollView>
    </NotebookScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  notice: {
    fontFamily: 'GeneralSans_500',
    fontSize: fontSize.small,
    marginBottom: spacing.md,
  },
});
