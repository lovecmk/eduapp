import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { Avatar } from '../../src/components/ui/Avatar';
import { AchievementBadge } from '../../src/components/ui/AchievementBadge';
import { RewardsGuideSheet } from '../../src/components/rewards/RewardsGuideSheet';
import { AmbientThemeSheet, useAmbientThemeLabel } from '../../src/components/settings/AmbientThemeSheet';
import { fontMono, fontCute, fontDisplay, fontBody } from '../../src/theme/tokens';
import { ROUTES } from '../../src/constants/routes';
import { useAllCards } from '../../src/hooks/useCards';
import { useBookmarkStore } from '../../src/store/bookmarkStore';
import { useCollectionStore } from '../../src/store/collectionStore';
import { useFactionStore } from '../../src/store/factionStore';
import { getFaction } from '../../src/constants/factions';
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
  const myFaction = getFaction(useFactionStore((s) => s.faction));
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);
  const ambientLabel = useAmbientThemeLabel();

  const masteredCount = useMemo(() => allCards.filter((c) => c.status === 'mastered').length, [allCards]);
  const collectedCount = Object.keys(ownedCollectibles).length;
  const collectibleTotal = COLLECTIBLES.length;

  // 보상 안내 시트 — 오직 [안내] 버튼을 눌렀을 때만 연다.
  // (예전엔 첫 MY 진입 시 자동으로 떴는데, 하이드레이트 타이밍 때문에 재방문에도
  //  간헐적으로 떠버리는 버그가 있어 자동 노출을 없앴다.)
  const [guideOpen, setGuideOpen] = useState(false);
  const closeGuide = () => setGuideOpen(false);

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {myFaction ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: myFaction.color + '18', borderColor: myFaction.color + '55', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2.5 }}>
                <Text style={{ fontSize: 11 }}>{myFaction.emoji}</Text>
                <Text style={{ color: myFaction.color, fontSize: 11, fontWeight: '800', fontFamily: fontCute }}>{myFaction.name}</Text>
              </View>
            ) : null}
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

      {/* '학습 통계'·'저장한 카드'는 각각 통계 탭(홈 학습현황 더보기)·컬렉션에서 접근되므로
          MY 에서는 중복을 덜어 단순화한다. */}

      {/* ── 내 컬렉션 · 성취 ─────────────────────────────────────────────
          엠블럼(실력)·도감(수집)·트로피(달성)를 한 곳에 모아 성격 태그로 구분한다.
          [안내] 버튼으로 셋의 차이를 언제든 다시 볼 수 있다(초보자 배려). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 4, paddingHorizontal: 2 }}>
        <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontWeight: '800', fontFamily: fontDisplay }}>내 컬렉션 · 성취</Text>
        <Pressable onPress={() => setGuideOpen(true)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.primary + '14', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Ionicons name="help-circle" size={14} color={c.primary} />
          <Text style={{ color: c.primary, fontSize: 12 * fs, fontWeight: '800', fontFamily: fontCute }}>안내</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.push(ROUTES.stats)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border, marginVertical: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <Ionicons name="ribbon-outline" size={20} color={c.textPrimary} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>엠블럼</Text>
              <TypeChip label="실력" color="#2563EB" />
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontCute }}>분야별 마스터로 오르는 실력 등급 뱃지</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.primary} />
      </Pressable>

      <Pressable onPress={() => router.push(ROUTES.collectionBook as never)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border, marginVertical: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <Ionicons name="albums-outline" size={20} color={c.textPrimary} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>안전 카드 도감</Text>
              <TypeChip label="수집" color="#7E57C2" />
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontCute }}>수집 {collectedCount}/{collectibleTotal}장 · 카드팩 열어 모으기</Text>
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
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border, marginVertical: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <Ionicons name="trophy-outline" size={20} color={c.textPrimary} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>트로피룸</Text>
              <TypeChip label="달성" color="#F2B705" />
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontCute }}>목표 달성·플렉스한 성취 기록 보관함</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.primary} />
      </Pressable>

      <SectionLabel>커뮤니티</SectionLabel>
      <MyRow icon="search-outline" title="닉네임으로 친구 찾기" desc="닉네임을 검색해 다른 점검자의 진행도를 확인해요" onPress={() => router.push(ROUTES.userSearch as never)} />

      <SectionLabel>꾸미기 · 계정</SectionLabel>
      <Pressable onPress={() => setThemeSheetOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border, marginVertical: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <Ionicons name="color-wand-outline" size={20} color={c.textPrimary} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>배경 테마</Text>
              <View style={{ backgroundColor: c.primary + '14', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1.5 }}>
                <Text style={{ color: c.primary, fontSize: 10.5, fontWeight: '800', fontFamily: fontCute }}>NEW</Text>
              </View>
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontCute }}>비·눈·별 반짝·바람 — 지금: {ambientLabel}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.primary} />
      </Pressable>
      <MyRow icon="person-circle-outline" title="내 정보 수정" desc="닉네임 · 이름 · 이메일 · 소속 변경" onPress={() => router.push(ROUTES.editProfile as never)} />
      <MyRow icon="eye-outline" title="프로필 공개 범위" desc="내 진행도를 누구에게 어디까지 보여줄지 설정" onPress={() => router.push(ROUTES.privacy as never)} />
      {/* 내 QR 명함 — 우선 비활성화(제거). 코드는 주석으로 보존.
      <MyRow icon="qr-code-outline" title="내 QR 명함" desc="QR로 내 프로필을 빠르게 공유" onPress={() => router.push('/qr-card' as never)} /> */}
      <MyRow icon="ticket-outline" title="이벤트 · 쿠폰" desc="이벤트 쿠폰으로 카드팩 받기" onPress={() => router.push('/redeem' as never)} />
      <MyRow icon="headset-outline" title="고객센터 · 문의" desc="문의하기, 자주 묻는 질문" onPress={() => router.push(ROUTES.support)} />
      <MyRow icon="settings-outline" title="설정" desc="알림, 테마, 계정 관리" onPress={() => router.push(ROUTES.settings)} />
      </ScrollView>

      {/* 보상 3종 안내 — 첫 진입 자동 1회 + [안내] 버튼 */}
      <RewardsGuideSheet visible={guideOpen} onClose={closeGuide} />
      {/* 배경 테마 빠른 선택 — 고르면 바로 적용(라이브) */}
      <AmbientThemeSheet visible={themeSheetOpen} onClose={() => setThemeSheetOpen(false)} />
    </View>
  );
}

/** 성격이 비슷한 메뉴를 묶는 섹션 제목 — MY 화면 그룹 구분용. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  return (
    <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, fontWeight: '800', fontFamily: fontDisplay, marginTop: 18, marginBottom: 2, paddingHorizontal: 2, letterSpacing: 0.2 }}>
      {children}
    </Text>
  );
}

/** 보상 성격을 한 단어로 구분하는 색상 태그(실력/수집/달성). */
function TypeChip({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ backgroundColor: color + '1A', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1.5 }}>
      <Text style={{ color, fontSize: 10.5, fontWeight: '800', fontFamily: fontCute }}>{label}</Text>
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
