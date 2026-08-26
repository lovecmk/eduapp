import React from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Avatar } from '../../src/components/ui/Avatar';
import { fontCute, fontBody, fontMono, fontDisplay } from '../../src/theme/tokens';
import { membershipMeta } from '../../src/domain/models/User';
import { usePublicProfile } from '../../src/hooks/useUserDirectory';
import type { PublicProfile } from '../../src/domain/models/PublicProfile';

export default function PublicProfileScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: profile, isLoading } = usePublicProfile(id);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="프로필" />
      {isLoading ? (
        <View style={{ paddingTop: 40 }}><ActivityIndicator color={c.primary} /></View>
      ) : !profile ? (
        <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 }}>
          <Ionicons name="person-remove-outline" size={40} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, marginTop: 12, fontFamily: fontCute }}>프로필을 찾을 수 없어요</Text>
        </View>
      ) : (
        <Body profile={profile} c={c} fs={fs} />
      )}
    </View>
  );
}

function Body({ profile, c, fs }: { profile: PublicProfile; c: any; fs: number }) {
  const meta = membershipMeta(profile.membership);
  const v = profile.visibility;
  // 아무것도 공개하지 않은 경우를 위한 안내 여부.
  const nothingShared = !profile.progress && profile.streakDays == null && !profile.emblems && profile.collectionCount == null;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      {/* 헤더 카드 */}
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Avatar uri={null} size={80} ring={2.5} ringColor={c.primary} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }}>
          <Text style={{ color: c.textPrimary, fontSize: 20 * fs, fontWeight: '800', fontFamily: fontCute }}>{profile.nickname}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: meta.accent + '1A', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Ionicons name={meta.icon as never} size={11} color={meta.accent} />
            <Text style={{ color: meta.accent, fontSize: 11, fontWeight: '800', fontFamily: fontMono }}>{meta.label}</Text>
          </View>
        </View>
        {(profile.org || profile.jobTitle) && (
          <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 4, fontFamily: fontBody }}>
            {[profile.org, profile.jobTitle].filter(Boolean).join(' · ')}
          </Text>
        )}
        {profile.bio ? <Text style={{ color: c.textPrimary, fontSize: 13.5 * fs, marginTop: 10, textAlign: 'center', fontFamily: fontBody }}>{profile.bio}</Text> : null}
      </View>

      {/* 진행도(공개 시) */}
      {profile.progress ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          <StatBox value={`${profile.progress.totalLearned}`} label="누적 학습" c={c} fs={fs} />
          <StatBox value={`${profile.progress.masteryPct}%`} label="완료율" c={c} fs={fs} />
          {profile.streakDays != null ? (
            <StatBox value={`${profile.streakDays}일`} label="연속 학습" c={c} fs={fs} icon="flame" />
          ) : null}
        </View>
      ) : profile.streakDays != null ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          <StatBox value={`${profile.streakDays}일`} label="연속 학습" c={c} fs={fs} icon="flame" />
        </View>
      ) : null}

      {/* 엠블럼(공개 시) */}
      {profile.emblems && profile.emblems.length > 0 && (
        <View style={{ marginTop: 18 }}>
          <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontWeight: '800', marginBottom: 10, fontFamily: fontDisplay }}>엠블럼</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {profile.emblems.map((em) => (
              <View key={em.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: c.border }}>
                <Text style={{ fontSize: 18 }}>{em.emoji}</Text>
                <Text style={{ color: c.textPrimary, fontSize: 13 * fs, fontWeight: '700', fontFamily: fontCute }}>{em.label}</Text>
                <Text style={{ fontSize: 13 }}>{['', '🥉', '🥈', '🥇'][em.level] ?? ''}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 컬렉션(공개 시) */}
      {profile.collectionCount != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, backgroundColor: c.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border }}>
          <Ionicons name="albums" size={20} color="#7E57C2" />
          <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontWeight: '700', flex: 1, fontFamily: fontCute }}>안전 카드 컬렉션</Text>
          <Text style={{ color: c.primary, fontSize: 15 * fs, fontWeight: '800', fontFamily: fontMono }}>{profile.collectionCount}장</Text>
        </View>
      )}

      {/* 비공개 안내 — 무엇이 가려졌는지 담백하게 알려준다(프라이버시 존중). */}
      {(nothingShared || !v.showProgress || !v.showStreak || !v.showEmblems || !v.showCollection) && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 20, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 14 }}>
          <Ionicons name="lock-closed-outline" size={15} color={c.textSecondary} style={{ marginTop: 1 }} />
          <Text style={{ color: c.textSecondary, fontSize: 12 * fs, lineHeight: 17 * fs, flex: 1, fontFamily: fontBody }}>
            {nothingShared
              ? '이 점검자는 진행도를 공개하지 않았어요.'
              : '일부 항목은 이 점검자가 비공개로 설정했어요. 공개를 허용한 범위까지만 표시돼요.'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function StatBox({ value, label, c, fs, icon }: { value: string; label: string; c: any; fs: number; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: c.border }}>
      {icon && <Ionicons name={icon} size={15} color={c.warning} style={{ marginBottom: 3 }} />}
      <Text style={{ color: c.primary, fontSize: 20 * fs, fontWeight: '900', fontFamily: fontMono }}>{value}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, marginTop: 4, fontFamily: fontCute }}>{label}</Text>
    </View>
  );
}
