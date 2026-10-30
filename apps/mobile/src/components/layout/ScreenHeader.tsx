// Notebook screen header: back ear-chevron, mono caption eyebrow, display
// title and optional right actions. Replaces native headers app-wide.

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from 'react-native';
import { fontSize, spacing, useTheme } from '../../theme';
import { fonts } from '../../theme/tokens';

interface HeaderProps {
  title?: string;
  eyebrow?: string;
  right?: React.ReactNode;
  hideBack?: boolean;
  style?: ViewStyle;
}

export function ScreenHeader({ title, eyebrow, right, hideBack, style }: HeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  return (
    <View
      style={[
        styles.row,
        { paddingTop: insets.top + spacing.sm, borderBottomColor: colors.line },
        style,
      ]}
    >
      {!hideBack && navigation.canGoBack() ? (
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          aria-label="Go back"
          onPress={() => navigation.goBack()}
          style={[styles.back, { borderColor: colors.line, backgroundColor: colors.paperCard }]}
        >
          <Ionicons name="chevron-back" size={18} color={colors.ink} />
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}
      <View style={styles.titles}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: colors.fadedInk }]}>{eyebrow}</Text>
        ) : null}
        {title ? <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>{title}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.md,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: 4,
    borderTopRightRadius: 0,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    width: 34,
  },
  titles: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  title: {
    fontFamily: 'ClashDisplay_600',
    fontSize: fontSize.h3,
  },
});
