// Brand animation: a wavy highlighter stroke drawn left-to-right under the
// title. Web animates SVG pathLength; RN clips with an animated-width mask
// so the stroke keeps its exact shape.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { fontSize, useTheme } from '../../theme';
import { springs, useReducedMotion } from '../../lib/motion';

interface HighlighterTextProps {
  children: string;
  color?: string;
  style?: StyleProp<TextStyle>;
  delay?: number;
}

export function HighlighterText({ children, color, style, delay = 120 }: HighlighterTextProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(delay, withSpring(1, springs.highlighter));
  }, [reduced, delay]);

  const strokeColor = color ?? colors.highlighter;

  const revealStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View
      style={styles.wrap}
      onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))}
    >
      <Text style={[styles.text, { color: colors.ink }, style]} numberOfLines={2}>
        {children}
      </Text>
      {width > 1 ? (
        <View pointerEvents="none" style={[styles.clip, { backgroundColor: 'transparent' }]}>
          <Animated.View style={[styles.reveal, revealStyle]}>
            <Svg width={width} height={14} viewBox={`0 0 ${width} 20`} preserveAspectRatio="none">
              <Path
                d={`M0,13 C${width * 0.3},17 ${width * 0.7},8 ${width},14`}
                fill="none"
                stroke={strokeColor}
                strokeWidth={10}
                strokeLinecap="round"
                opacity={0.55}
              />
            </Svg>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: 'ClashDisplay_600',
    fontSize: fontSize.h2,
    lineHeight: fontSize.h2 * 1.35,
    zIndex: 2,
  },
  clip: {
    position: 'absolute',
    left: 0,
    bottom: -2,
    right: 0,
    height: 14,
    overflow: 'hidden',
  },
  reveal: {
    height: 14,
    overflow: 'hidden',
  },
});
