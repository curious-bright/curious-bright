import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import React from 'react';
import { ColorValue, StyleSheet, View } from 'react-native';
import { fetchMessagesUnread, q } from '../../src/lib/queries';
import { spacing, useTheme, fonts } from '../../src/theme';
import { useAuth } from '../../src/state/AuthContext';

function TabIcon({
  name,
  focused,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: ColorValue;
}) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconActive]}>
      <Ionicons name={focused ? name : (`${name.replace('-outline', '')}-outline` as keyof typeof Ionicons.glyphMap)} size={21} color={color} />
      {focused ? <View style={styles.underline} /> : null}
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();

  const { data: dmUnread } = useQuery({
    queryKey: q.messagesUnread,
    queryFn: fetchMessagesUnread,
    enabled: isAuthenticated,
  });
  const unreadChats = dmUnread?.total ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.coral,
        tabBarInactiveTintColor: colors.fadedInk,
        tabBarStyle: {
          backgroundColor: colors.paperCard,
          borderTopColor: colors.line,
          borderTopWidth: 1.5,
          height: 58 + spacing.xs,
          paddingBottom: spacing.xs,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.mono,
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: ({ focused, color }) => <TabIcon name="book-outline" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ focused, color }) => <TabIcon name="library-outline" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarBadge: unreadChats > 0 ? (unreadChats > 9 ? '9+' : unreadChats) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.coral, fontSize: 10, fontFamily: fonts.mono },
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="chatbubbles-outline" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="rooms"
        options={{
          title: 'Rooms',
          tabBarIcon: ({ focused, color }) => <TabIcon name="people-outline" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'You',
          tabBarIcon: ({ focused, color }) => <TabIcon name="person-outline" focused={focused} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    width: 40,
  },
  iconActive: {},
  underline: {
    position: 'absolute',
    bottom: -6,
    height: 3,
    width: 22,
    borderRadius: 2,
    backgroundColor: '#F4B43D',
  },
});
