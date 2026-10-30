import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchNotifications, q } from '../../lib/queries';
import { useTheme } from '../../theme';
import { fonts } from '../../theme/tokens';

export function NotificationBell() {
  const { colors } = useTheme();

  const { data: unread = 0 } = useQuery({
    queryKey: q.notifications,
    queryFn: fetchNotifications,
    select: (list) => list.filter((n) => !n.is_read).length,
  });

  return (
    <Pressable
      hitSlop={8}
      onPress={() => {
        void Haptics.selectionAsync();
        router.push('/inbox');
      }}
      style={[styles.bell, { borderColor: colors.line, backgroundColor: colors.paperCard }]}
      accessibilityLabel={unread > 0 ? `Inbox, ${unread} unread` : 'Inbox'}
    >
      <Ionicons name="notifications-outline" size={18} color={colors.ink} />
      {unread > 0 ? (
        <View style={[styles.badge, { backgroundColor: colors.coral }]}>
          <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 36,
    height: 36,
    borderRadius: 4,
    borderTopRightRadius: 0,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: '#FFFFFF',
  },
});
