// The signature "comment corner" card from apps/web: 1.5px hairline border,
// top-right corner cut, folded paper ear. Pressing peels the ear back.

import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';
import { radii, spacing, useTheme, type Palette } from '../../theme';
import { springs, useReducedMotion } from '../../lib/motion';

const EAR = 22;

const AnimatedSvg = Animated.createAnimatedComponent(Svg);

function CornerEar({ peel, colors }: { peel: SharedValue<number>; colors: Palette }) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: -4 * peel.value },
      { translateY: 4 * peel.value },
      { rotate: `${-12 * peel.value}deg` },
      { scale: 1 + 0.15 * peel.value },
    ],
  }));
  return (
    <AnimatedSvg
      pointerEvents="none"
      style={[styles.earWrap, style]}
      width={EAR}
      height={EAR}
      viewBox={`0 0 ${EAR} ${EAR}`}
    >
      <Polygon
        points={`0,0 ${EAR},${EAR} 0,${EAR}`}
        fill={colors.paperHover}
        stroke={colors.lineDark}
        strokeWidth={1}
      />
    </AnimatedSvg>
  );
}

interface NotebookCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  peelable?: boolean;
  style?: ViewStyle;
  padded?: boolean;
}

export function NotebookCard({ children, onPress, peelable = true, style, padded = true }: NotebookCardProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const peel = useSharedValue(0);
  const scale = useSharedValue(1);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const setPressed = (value: number) => {
    scale.value = withSpring(value, springs.press);
  };
  const setPeel = (value: number) => {
    if (!reduced) peel.value = withSpring(value, springs.peel);
  };

  const containerStyle = [
    styles.card,
    {
      backgroundColor: colors.paperCard,
      borderColor: colors.line,
      borderTopRightRadius: 0,
    },
    padded ? { padding: spacing.lg } : null,
    style,
  ];

  const ear = peelable ? <CornerEar peel={peel} colors={colors} /> : null;

  if (!onPress) {
    return (
      <Animated.View style={[containerStyle, cardStyle]}>
        {children}
        {ear}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[containerStyle, cardStyle]}>
      <Pressable
        accessibilityRole="button"
        onPressIn={() => {
          setPressed(0.98);
          setPeel(1);
        }}
        onPressOut={() => {
          setPressed(1);
          setPeel(0);
        }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }}
      >
        {children}
        {ear}
      </Pressable>
    </Animated.View>
  );
}

export function CardSectionTitle({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[styles.sectionTitle, { color: colors.ink }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderRadius: radii.md,
  },
  earWrap: {
    position: 'absolute',
    top: -1.5,
    right: -1.5,
    zIndex: 3,
  },
  sectionTitle: {
    fontFamily: 'ClashDisplay_600',
    fontSize: 17,
  },
});
