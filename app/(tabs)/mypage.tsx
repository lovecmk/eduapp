import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { Avatar } from '../../src/components/ui/Avatar';
import { AchievementBadge } from '../../src/components/ui/AchievementBadge';
import { fontMono, fontCute, fontDisplay, fontBody } from '../../src/theme/tokens';
import { ROUTES } from '../../src/constants/routes';
import { useAllCards } from '../../src/hooks/useCards';
import { useBookmarkStore } from '../../src/store/bookmarkStore';
import { useCollectionStore } from '../../src/store/collectionStore';
import { COLLECTIBLES } from '../../src/data/collectibles';
import { MEMBERSHIP_META, displayName } from '../../src/domain/models/User';

export default function MyPageScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { data: allCards = [] } = useAllCards();
  const profileImage = useSettingsStore((s) => s.profileImage);
  const bookmarkCount = useBookmarkStore((s) => s.ids.length);
  const ownedCollectibles = useCollectionStore((s) => s.owned);
  const packs = useCollectionStore((s) => s.packs);

  const masteredCount = useMemo(() => allCards.filter((c) => c.status === 'mastered').length, [allCards]);
  const collectedCount = Object.keys(ownedCollectibles).length;
  const collectibleTotal = COLLECTIBLES.length;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Pressable onPress={() => router.push(ROUTES.profile as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 }}>
        <Avatar uri={profileImage} size={56} ring={2} ringColor={c.primary} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={{ color: c.textPrimary, fontSize: 18 * fs, fontWeight: '800', fontFamily: fontCute }} numberOfLines={1}>{displayName(user)}</Text>
            <AchievementBadge size={17} />
            {user ? (() => {
              const meta = MEMBERSHIP_META[user.membership];
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: meta.accent + '1A', borderColor: meta.accent + '55', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Ionicons name={meta.icon as never} size={11} color={meta.accent} />
                  <Text style={{ color: meta.accent, fontSize: 11, fontWeight: '800', fontFamily: fontCute }}>{meta.label}</Text>
                </View>
              );
            })() : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {user?.loginId ? (
              <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontMono }}>@{user.loginId}</Text>
            ) : null}
            <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontCute }}>· 탭하여 프로필 보기</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.primary} />
      </Pressable>

      {/* 요약 통계 — 탭하면 전체 통계로 이동(발견성) */}
      <Pressable onPress={() => router.push(ROUTES.stats)} style={{ flexDirection: 'row', gap: 10, marginVertical: 16 }}>
        {[
          { value: `${allCards.length}`, label: '전체 카드' },
          { value: `${masteredCount}`, label: '마스터' },
          { value: `${Math.round((masteredCount / Math.max(allCards.length, 1)) * 100)}%`, label: '완료율' },
        ].map((s) => (
          <View key={s.label} style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.primary, fontSize: 22 * fs, fontWeight: '900', fontFamily: fontMono }}>{s.value}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 4, fontFamily: fontCute }}>{s.label}</Text>
          </View>
        ))}
      </Pressable>

      <MyRow icon="stats-chart-outline" title="학습 통계" desc="학습 성향·복습 현황·순위 자세히 보기" onPress={() => router.push(ROUTES.stats)} />

      <Pressable onPress={() => router.push(ROUTES.saved)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border, marginVertical: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="bookmark-outline" size={20} color={c.textPrimary} />
          <View>
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>저장한 카드</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontCute }}>북마크한 학습 카드 모아보기</Text>
          </View>
        </View>
        {bookmarkCount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: c.primary + '1A', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: c.primary, fontSize: 12, fontWeight: '800', fontFamily: fontMono }}>{bookmarkCount}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.primary} />
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={c.primary} />
        )}
      </Pressable>

      <Pressable onPress={() => router.push(ROUTES.collectionBook as never)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border, marginVertical: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="albums-outline" size={20} color={c.textPrimary} />
          <View>
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>안전 카드 도감</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontCute }}>수집 {collectedCount}/{collectibleTotal}장 · 카드팩 모아 열기</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {packs > 0 && (
            <View style={{ backgroundColor: c.error, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', fontFamily: fontMono }}>팩 {packs}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color={c.primary} />
        </View>
      </Pressable>

      <Pressable onPress={() => router.push(ROUTES.trophy as never)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.primary, borderRadius: 16, padding: 16, marginVertical: 8, boxShadow: '0 8px 20px rgba(37,99,235,0.28)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="trophy" size={22} color="#fff" />
          </View>
          <View>
            <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>내 트로피룸 🏛️</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: fontCute }}>내가 달성·플렉스한 성취 카드 모아보기</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#fff" />
      </Pressable>

      <MyRow icon="person-circle-outline" title="내 정보 수정" desc="닉네임 · 이름 · 이메일 · 소속 변경" onPress={() => router.push(ROUTES.editProfile as never)} />
      <MyRow icon="qr-code-outline" title="내 QR 명함" desc="QR로 내 프로필을 빠르게 공유" onPress={() => router.push('/qr-card' as never)} />
      <MyRow icon="gift-outline" title="가챠 코드 교환" desc="이벤트 코드를 입력해 카드팩 받기" onPress={() => router.push('/redeem' as never)} />
      <MyRow icon="headset-outline" title="고객센터 · 문의" desc="문의하기, 자주 묻는 질문" onPress={() => router.push(ROUTES.support)} />
      <MyRow icon="settings-outline" title="설정" desc="알림, 테마, 계정 관리" onPress={() => router.push(ROUTES.settings)} />
      </ScrollView>
    </View>
  );
}

function MyRow({ icon, title, desc, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string; onPress: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  return (
    <Pressable onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border, marginVertical: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={icon} size={20} color={c.textPrimary} />
        <View>
          <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>{title}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontBody }}>{desc}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.primary} />
    </Pressable>
  );
}
