// Circular avatar with initials fallback (web .post-avatar).

import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { resolveUrl } from '../../lib/api';
import { useTheme } from '../../theme';

interface AvatarProps {
  username: string;
  uri?: string | null;
  size?: number;
  ring?: boolean;
}

const TINTS = ['#FF5A36', '#00A896', '#F4B43D', '#4C6FE7', '#B45CC8'];

function tintFor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i += 1) hash = (hash * 31 + username.charCodeAt(i)) % 997;
  return TINTS[hash % TINTS.length];
}

export function Avatar({ username, uri, size = 40, ring }: AvatarProps) {
  const { colors } = useTheme();
  const source = uri ? resolveUrl(uri) : null;
  const style = { width: size, height: size, borderRadius: size / 2 };

  if (source) {
    return (
      <View style={[style, ring ? styles.ringLight : null, { borderColor: ring ? colors.mustard : 'transparent' }]}>
        <Image source={source} style={style} contentFit="cover" transition={150} cachePolicy="memory-disk" />
      </View>
    );
  }

  return (
    <View
      style={[
        style,
        styles.center,
        { backgroundColor: tintFor(username) },
        ring ? styles.ringLight : null,
        { borderColor: ring ? colors.mustard : 'transparent' },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>
        {username.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontFamily: 'ClashDisplay_600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  ringLight: {
    borderWidth: 2,
    padding: 1,
  },
});
