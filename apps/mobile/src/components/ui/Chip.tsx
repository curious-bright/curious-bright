// Chips & badges mirroring web .badge-tag variants. Mono uppercase, cut
// corner, 10%-alpha accent backgrounds.

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { chipBackground, subjectColor, VISIBILITY_META } from '../../lib/subjects';
import { useTheme } from '../../theme';

export function SubjectChip({ subject }: { subject: string }) {
  const color = subjectColor(subject);
  return (
    <View style={[styles.tag, { backgroundColor: chipBackground(color) }]}>
      <Text style={[styles.tagText, { color }]}>{subject}</Text>
    </View>
  );
}

type BadgeVariant = 'coral' | 'teal' | 'mustard' | 'plain';

const BADGE_ICON_COLOR: Record<BadgeVariant, string> = {
  coral: '#D63E1C',
  teal: '#007A6D',
  mustard: '#9E6F0C',
  plain: '#6B685C',
};

export function BadgeTag({
  children,
  variant = 'plain',
  icon,
  dark,
}: {
  children: string;
  variant?: BadgeVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  dark?: boolean;
}) {
  const { colors } = useTheme();
  const bg: Record<BadgeVariant, string> = {
    coral: `${colors.coral}1A`,
    teal: `${colors.teal}1A`,
    mustard: `${colors.mustard}26`,
    plain: colors.paperHover,
  };
  const fg: Record<BadgeVariant, string> = {
    coral: dark ? colors.coral : BADGE_ICON_COLOR.coral,
    teal: dark ? colors.teal : BADGE_ICON_COLOR.teal,
    mustard: dark ? colors.mustard : BADGE_ICON_COLOR.mustard,
    plain: colors.fadedInk,
  };
  return (
    <View style={[styles.tag, { backgroundColor: bg[variant] }]}>
      {icon ? <Ionicons name={icon} size={11} color={fg[variant]} /> : null}
      <Text style={[styles.tagText, { color: fg[variant] }]}>{children}</Text>
    </View>
  );
}

export function VisibilityTag({ visibility }: { visibility: string }) {
  const { colors } = useTheme();
  const meta = VISIBILITY_META[visibility] ?? VISIBILITY_META.public;
  const color =
    visibility === 'room_only' ? colors.mustard : visibility === 'followers' ? colors.teal : colors.fadedInk;
  return (
    <View style={styles.visibility}>
      <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={12} color={color} />
      <Text style={[styles.visibilityText, { color }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 3,
    borderTopRightRadius: 0,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  tagText: {
    fontFamily: 'JetBrainsMono_400',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  visibility: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  visibilityText: {
    fontFamily: 'GeneralSans_500',
    fontSize: 11,
  },
});
