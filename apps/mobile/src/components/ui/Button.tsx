// Notebook buttons. Primary: solid ink with cut corner + paper ear (web
// .btn-primary). Secondary: transparent with a mustard highlighter underline
// that scales in on press (web .btn-secondary::before).

import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { radii, spacing, useTheme, fontSize as fs } from '../../theme';
import { springs } from '../../lib/motion';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: ViewStyle;
  icon?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
  style,
  icon,
}: ButtonProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const underline = useSharedValue(0);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: underline.value }],
    opacity: underline.value,
  }));

  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.ink, fg: colors.paper, border: colors.ink },
    secondary: { bg: 'transparent', fg: colors.ink, border: colors.ink },
    danger: { bg: colors.coral, fg: '#FFFFFF', border: colors.coral },
    ghost: { bg: 'transparent', fg: colors.fadedInk, border: 'transparent' },
  };
  const look = palette[variant];
  const isOff = disabled || loading;

  return (
    <Animated.View style={[pressStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!isOff }}
        disabled={isOff}
        onPressIn={() => {
          scale.value = withSpring(0.96, springs.press);
          if (variant === 'secondary') underline.value = withSpring(1, springs.press);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, springs.press);
          underline.value = withSpring(0, { damping: 26, stiffness: 340 });
        }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }}
        style={[
          styles.base,
          small && styles.small,
          {
            backgroundColor: look.bg,
            borderColor: look.border,
            borderTopRightRadius: 0,
          },
        ]}
      >
        {variant === 'secondary' ? (
          <Animated.View
            style={[
              underlineStyle,
              styles.underline,
              { backgroundColor: colors.mustard },
            ]}
          />
        ) : null}
        {variant === 'primary' ? (
          <Animated.View style={[styles.ear, { backgroundColor: colors.paper }]} />
        ) : null}
        {loading ? (
          <ActivityIndicator size="small" color={look.fg} />
        ) : (
          <>
            {icon}
            <Text style={[styles.label, small && styles.labelSmall, { color: look.fg }]}>
              {title}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 22,
    overflow: 'hidden',
  },
  small: {
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  label: {
    fontFamily: 'GeneralSans_600',
    fontSize: fs.small,
    fontWeight: '600',
  },
  labelSmall: {
    fontSize: fs.caption,
  },
  underline: {
    position: 'absolute',
    bottom: 5,
    left: 12,
    right: 12,
    height: 6,
    borderRadius: 3,
    opacity: 0.5,
  },
  ear: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 8,
    height: 8,
    borderRadius: 1,
  },
});
