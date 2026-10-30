import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../src/components/layout/ScreenHeader';
import { ProfileView } from '../../src/components/profile/ProfileView';
import { GridBackground } from '../../src/components/ui/GridBackground';
import { spacing, useTheme } from '../../src/theme';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ username: string }>();
  const username = params.username ?? '';

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <GridBackground />
      <View style={[styles.body, { paddingTop: insets.top + spacing.xs }]}>
        <ScreenHeader eyebrow="Member page" title={`@${username}`} />
        <ProfileView username={username} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, paddingTop: spacing.xs },
});
