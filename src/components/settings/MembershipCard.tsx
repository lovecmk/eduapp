import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontCute } from '../../theme/tokens';
import { MEMBERSHIP_META, type MembershipTier } from '../../domain/models/User';
import { Avatar } from '../ui/Avatar';

/** 계정/멤버십 요약 카드 — 프로필 이미지, 이름, 소속, 등급 배지를 한 곳에 표시. */
export function MembershipCard({
  name,
  email,
  org,
  membership,
  profileImage,
}: {
  name: string;
  email: string;
  org?: string;
  membership: MembershipTier;
  profileImage?: string | null;
}) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const meta = MEMBERSHIP_META[membership];

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.row}>
        <Avatar uri={profileImage} size={52} ring={2} ringColor={meta.accent} />

        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: c.textPrimary, fontSize: 17 * fontScale }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.email, { color: c.textSecondary }]} numberOfLines={1}>
            {email}
          </Text>
        </View>

        <View style={[styles.badge, { backgroundColor: meta.accent + '1A', borderColor: meta.accent + '55' }]}>
          <Ionicons name={meta.icon as never} size={13} color={meta.accent} />
          <Text style={[styles.badgeText, { color: meta.accent }]}>{meta.label}</Text>
        </View>
      </View>

      {org ? (
        <View style={[styles.orgRow, { borderTopColor: c.border }]}>
          <Ionicons name="business-outline" size={14} color={c.textSecondary} />
          <Text style={[styles.org, { color: c.textSecondary }]}>{org}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, padding: 16, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2 },
  avatarFallback: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 22, fontWeight: '800', fontFamily: fontCute },
  name: { fontWeight: '900', fontFamily: fontCute },
  email: { fontSize: 12, marginTop: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontWeight: '800', fontFamily: fontCute },
  orgRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
  org: { fontSize: 12 },
});
