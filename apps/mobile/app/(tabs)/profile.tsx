import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileView } from '../../src/components/profile/ProfileView';
import { ScreenEnter } from '../../src/components/layout/ScreenEnter';
import { GridBackground } from '../../src/components/ui/GridBackground';
import { useAuth } from '../../src/state/AuthContext';
import { spacing, useTheme } from '../../src/theme';

export default function ProfileTab() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <GridBackground />
      <View style={[styles.body, { paddingTop: insets.top + spacing.xs }]}>
        <ScreenEnter>
          <ProfileView username={user.username} />
        </ScreenEnter>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
});
