// Shared frame for login/register/verify screens: notebook backdrop, the
// wordmark with its highlighter reveal, and a content card.

import React from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GridBackground } from '../ui/GridBackground';
import { HighlighterText } from '../ui/HighlighterText';
import { NotebookCard } from '../ui/NotebookCard';
import { spacing, useTheme } from '../../theme';

export function AuthShell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <GridBackground />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.avoid}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <HighlighterText delay={80}>Curious Bright</HighlighterText>
          </View>
          <NotebookCard peelable={false} style={styles.card}>
            {children}
          </NotebookCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  avoid: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
    justifyContent: 'center',
  },
  brand: {
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  card: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
});
