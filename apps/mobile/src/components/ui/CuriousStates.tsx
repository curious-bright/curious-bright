// Branded list states from web CuriousStates: the arriving-collaborator pill
// for loading, dashed notebook card for empty, alert-error card with retry.

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Button } from './Button';
import { fontSize, radii, spacing, useTheme } from '../../theme';
import { useReducedMotion } from '../../lib/motion';

export function CuriousLoading({ message = 'Opening the notebook…' }: { message?: string }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const bob = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700 }),
        withTiming(0, { duration: 700 }),
      ),
      -1,
      true,
    );
  }, [reduced, bob]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -6 * bob.value },
      { scale: 0.95 + 0.1 * bob.value },
    ],
  }));

  return (
    <View style={styles.center}>
      <Animated.View style={[style, styles.pill, { backgroundColor: colors.coral }]}>
        <Ionicons name="ellipsis-horizontal" size={14} color="#FFF" />
        <Text style={styles.pillText}>Collaborator arriving…</Text>
      </Animated.View>
      <Text style={[styles.message, { color: colors.fadedInk }]}>{message}</Text>
    </View>
  );
}

export function CuriousEmpty({
  title = 'Nothing here yet',
  description = 'Be the first to write in this page of the notebook.',
  flourishText = 'Shared Notebook',
  action,
}: {
  title?: string;
  description?: string;
  flourishText?: string;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, styles.emptyCard]}>
      <View style={[styles.flourish, { backgroundColor: `${colors.mustard}26` }]}>
        <Ionicons name="book-outline" size={15} color={colors.mustard} />
        <Text style={[styles.flourishText, { color: colors.ink }]}>{flourishText}</Text>
      </View>
      <Text style={[styles.emptyTitle, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.emptyDesc, { color: colors.fadedInk }]}>{description}</Text>
      {action}
    </View>
  );
}

export function CuriousError({
  title = 'Something unexpected happened',
  message = 'We could not load this section right now. Please try again in a moment.',
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.center,
        styles.errorCard,
        { backgroundColor: `${colors.coral}14`, borderColor: `${colors.coral}55` },
      ]}
    >
      <View style={styles.errorHead}>
        <Ionicons name="alert-circle" size={20} color={colors.danger} />
        <Text style={[styles.errorTitle, { color: colors.danger }]}>{title}</Text>
      </View>
      <Text style={[styles.emptyDesc, { color: colors.danger }]}>{message}</Text>
      {onRetry ? <Button small variant="secondary" title="Try Again" onPress={onRetry} style={styles.retry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: spacing.md,
  },
  pillText: {
    fontFamily: 'GeneralSans_600',
    fontSize: 12,
    color: '#FFF',
  },
  message: {
    fontFamily: 'GeneralSans_500',
    fontSize: fontSize.small,
  },
  emptyCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radii.md,
    marginHorizontal: spacing.md,
  },
  flourish: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: spacing.md,
  },
  flourishText: {
    fontFamily: 'JetBrainsMono_400',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  emptyTitle: {
    fontFamily: 'ClashDisplay_600',
    fontSize: fontSize.h3,
    marginBottom: spacing.xs,
  },
  emptyDesc: {
    fontFamily: 'GeneralSans_400',
    fontSize: fontSize.small,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  errorCard: {
    borderWidth: 1.5,
    borderRadius: radii.md,
    alignItems: 'flex-start',
    marginHorizontal: spacing.md,
  },
  errorHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  errorTitle: {
    fontFamily: 'GeneralSans_600',
    fontSize: fontSize.body,
  },
  retry: {
    marginTop: spacing.md,
    alignSelf: 'center',
  },
});
