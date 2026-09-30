import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions, Modal, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuthStore } from '../src/store/authStore';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { WrappedShareCard, SHARE_CARD_ASPECT } from '../src/components/share/WrappedShareCard';
import { useAllCards } from '../src/hooks/useCards';
import { useStudyStats } from '../src/hooks/useStats';
import { computeAchievement, type AchievementSnapshot } from '../src/utils/achievement';
import { getRarity, RARITY_META, RARITY_RANK, type RarityTier } from '../src/utils/rarity';
import { useTilt } from '../src/hooks/useTilt';
import { useFeed } from '../src/hooks/useFeed';
import { BragFeedCard } from '../src/components/community/BragFeedCard';
import { fontCute, fontBody, fontMono } from '../src/theme/tokens';
import { ROUTES } from '../src/constants/routes';
import { contentColumn, CONTENT_MAX_WIDTH } from '../src/theme/layout';
import { displayName } from '../src/domain/models/User';

const GAP = 12;

/**
 * 2열 트로피 그리드의 열 너비.
 *
 * 두 가지를 고친다.
 *  · 모듈 로드 시점의 Dimensions.get() 은 고정값이라 리사이즈·회전에 반응하지 않았다.
 *  · 창 너비로만 계산해 본문 칼럼 제한(560px)을 무시했다 → 넓은 데스크톱에서
 *    카드가 칼럼 밖으로 튀어나갈 만큼 커졌다. 본문 폭을 기준으로 잡는다.
 */
function useColumnWidth(screenW: number) {
  const gridW = Math.min(screenW, CONTENT_MAX_WIDTH);
  return (gridW - 20 * 2 - GAP) / 2;
}

interface Trophy {
  key: string;
  snapshot: AchievementSnapshot;
  author: string;
  live?: boolean;
  periodLabel: string;
}


export default function TrophyRoomScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  // 트로피 카드도 남에게 보이는 것이라 닉네임으로 나간다.
  const author = displayName(user);
  const { width: screenW } = useWindowDimensions();
  const colW = useColumnWidth(screenW);

  const { data: allCards = [] } = useAllCards();
  const { data: stats } = useStudyStats();
  // 셀렉터는 안정적인 원본 배열만 반환하고(useSyncExternalStore 무한루프 방지), 필터는 useMemo 에서.
  // 내가 올린 카드 — 피드(서버 또는 이 기기)의 내 글.
  const { posts } = useFeed();
  const myPosts = useMemo(() => posts.filter((p) => p.mine), [posts]);

  const liveSnapshot = useMemo(() => computeAchievement(allCards, stats), [allCards, stats]);

  // 현재 성취(라이브) + 내가 공유했던 카드들 → 트로피 목록.
  const trophies = useMemo<Trophy[]>(() => {
    const shared: Trophy[] = myPosts.map((p) => ({ key: p.id, snapshot: p.snapshot, author: p.author, periodLabel: p.snapshot.periodLabel }));
    return [{ key: 'live', snapshot: liveSnapshot, author, live: true, periodLabel: liveSnapshot.periodLabel }, ...shared];
  }, [myPosts, liveSnapshot, author]);

  // 등급별 보유 수 요약.
  const tierCounts = useMemo(() => {
    const counts: Record<RarityTier, number> = { legendary: 0, epic: 0, rare: 0, common: 0 };
    trophies.forEach((t) => { counts[getRarity(t.snapshot).tier] += 1; });
    return counts;
  }, [trophies]);
  const bestTier = (Object.keys(tierCounts) as RarityTier[])
    .filter((t) => tierCounts[t] > 0)
    .sort((a, b) => RARITY_RANK[b] - RARITY_RANK[a])[0] ?? 'common';

  const [selected, setSelected] = useState<Trophy | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="내 트로피룸" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, ...contentColumn }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: c.textPrimary, fontSize: 18 * fs, fontFamily: fontCute, fontWeight: '800' }}>나의 성취 박물관 🏛️</Text>
        <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody, marginTop: 6, lineHeight: 19 }}>
          달성하고 플렉스한 성취 카드가 모여요. 탭하면 크게 볼 수 있어요.
        </Text>

        {/* 요약 배너 */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 18 }}>
          <View style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 14 }}>
            <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody }}>보유 카드</Text>
            <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontFamily: fontMono, fontWeight: '900', marginTop: 2 }}>{trophies.length}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 14 }}>
            <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody }}>최고 등급</Text>
            <Text style={{ color: bestTier === 'common' ? c.textPrimary : RARITY_META[bestTier].glow, fontSize: 16 * fs, fontFamily: fontCute, fontWeight: '900', marginTop: 5 }}>
              {RARITY_META[bestTier].label}
            </Text>
          </View>
        </View>

        {/* 카드 그리드 */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {trophies.map((t, i) => {
            const rarity = getRarity(t.snapshot);
            return (
              <Animated.View key={t.key} entering={FadeInDown.delay(Math.min(i, 8) * 45).duration(300)}>
                <Pressable accessibilityRole="button" onPress={() => setSelected(t)} style={{ width: colW }}>
                  <View style={{ borderRadius: 20, overflow: 'hidden', boxShadow: `0 8px 20px ${rarity.glow === 'transparent' ? 'rgba(37,99,235,0.2)' : rarity.glow + '55'}` }}>
                    <WrappedShareCard snapshot={t.snapshot} author={t.author} width={colW} />
                  </View>
                  {t.live && (
                    <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: c.success, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ color: '#fff', fontSize: 9.5, fontFamily: fontCute, fontWeight: '800' }}>현재</Text>
                    </View>
                  )}
                  <Text numberOfLines={1} style={{ color: c.textPrimary, fontSize: 12.5 * fs, fontFamily: fontCute, fontWeight: '700', marginTop: 8 }}>{t.snapshot.title}</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontMono, marginTop: 1 }}>{t.periodLabel} · Lv.{t.snapshot.level}</Text>
                </Pressable>
              </Animated.View>
            );
          })}

          {/* 새로 만들기 타일 */}
          <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.share as never)}
            style={{ width: colW, height: colW / SHARE_CARD_ASPECT, borderRadius: 20, borderWidth: 1.5, borderColor: c.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.surface }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={26} color={c.primary} />
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontCute }}>새 카드 만들기</Text>
          </Pressable>
        </View>

        {/* 커뮤니티 '오늘의 플렉스' — 커뮤니티 탭에서 옮겨와 MY(트로피룸)에서만 접근. */}
        <Text style={{ color: c.textPrimary, fontSize: 16 * fs, fontFamily: fontCute, fontWeight: '800', marginTop: 26, marginBottom: 12 }}>커뮤니티 플렉스</Text>
        <BragFeedCard />
      </ScrollView>

      <TrophyDetailModal trophy={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

/** 트로피 상세 — 기기 기울기에 광택이 반응하는 큰 카드 + 등급 파티클. */
function TrophyDetailModal({ trophy, onClose }: { trophy: Trophy | null; onClose: () => void }) {
  const { fontScale: fs } = useTheme();
  const tilt = useTilt(!!trophy);
  const { width: screenW } = useWindowDimensions();
  const bigW = Math.min(screenW - 64, 320);
  const rarity = trophy ? getRarity(trophy.snapshot) : null;

  return (
    <Modal visible={!!trophy} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* 배경은 '탭하면 닫히는 판'이지만 내용을 품지 않는다 — 품으면 웹에서 <button> 안에
          <button>('닫기')이 되어 유효하지 않은 DOM 이고, 스크린 리더가 중첩된 컨트롤을
          제대로 읽지 못한다. 화면을 덮는 **형제**로 깔고 그 위에 내용을 얹는다.

          배경은 여백 없는 맨 바깥에 둔다. 여백이 걸린 상자 안에서 absoluteFill 이 그 여백
          띠까지 덮는지는 구현에 달린 문제라, 안 덮으면 가장자리를 눌러도 닫히지 않는다.
          가운데 정렬 층은 pointerEvents="box-none" 이라 빈 곳을 누르면 아래 배경이 받는다.

          내용은 그냥 View 면 된다. 형제인 배경은 내용 탭을 받지 못하므로,
          예전에 탭을 삼키려고 두었던 빈 Pressable(onPress={() => {}})은 필요 없다. */}
      <View style={{ flex: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="닫기"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.85)' }]}
        />
        <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {trophy && rarity && (
            <View>
              <View style={{ borderRadius: 28 * (bigW / 320), boxShadow: `0 18px 48px ${rarity.glow === 'transparent' ? 'rgba(37,99,235,0.4)' : rarity.glow + '77'}` }}>
                <WrappedShareCard snapshot={trophy.snapshot} author={trophy.author} width={bigW} tilt={tilt} animated />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 16 }}>
                <Ionicons name="phone-portrait-outline" size={13} color="rgba(255,255,255,0.7)" />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 * fs, fontFamily: fontMono }}>기기를 기울여 광택을 감상하세요 · {rarity.label}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={onClose} style={{ alignSelf: 'center', marginTop: 14, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 10 }}>
                <Text style={{ color: '#fff', fontSize: 13 * fs, fontFamily: fontCute, fontWeight: '700' }}>닫기</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
