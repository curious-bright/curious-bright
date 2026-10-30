// Route entry motion (web PageTurnContainer): the screen arrives like a page
// turning in — rotateY from -7°, offset 24px, perspective 1200.

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../theme';
import { GridBackground } from '../ui/GridBackground';
import { springs, useReducedMotion } from '../../lib/motion';

export function ScreenEnter({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (!reduced) progress.value = withSpring(1, springs.pageTurn);
  }, [reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.2 + 0.8 * progress.value,
    transform: [
      { perspective: 1200 },
      { rotateY: `${-7 * (1 - progress.value)}deg` },
      { translateX: 24 * (1 - progress.value) },
    ],
    transformOrigin: 'left center',
  }));

  return <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
}

// Standard notebook screen: paper background, grid texture, full-bleed
// scrollable content that enters with the page turn.
export function NotebookScreen({ children }: ScreenProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <GridBackground />
      <ScreenEnter>
        <View style={styles.content}>{children}</View>
      </ScreenEnter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
