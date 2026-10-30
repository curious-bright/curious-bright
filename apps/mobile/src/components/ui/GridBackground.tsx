// Notebook grid texture behind screens — the web body::before overlay
// (32px graph-paper lines at low opacity).

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Pattern, Rect, Defs } from 'react-native-svg';
import { grid, useTheme } from '../../theme';

export function GridBackground() {
  const { colors } = useTheme();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="cb-grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
            <Line x1={grid} y1={0} x2={grid} y2={grid} stroke={colors.gridLine} strokeWidth={1} />
            <Line x1={0} y1={grid} x2={grid} y2={grid} stroke={colors.gridLine} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#cb-grid)" />
      </Svg>
    </View>
  );
}
