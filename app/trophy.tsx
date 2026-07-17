import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions, Modal } from 'react-native';
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
import { useShareFeedStore } from '../src/store/shareFeedStore';
import { fontCute, fontBody, fontMono } from '../src/theme/tokens';
import { ROUTES } from '../src/constants/routes';

const { width: SCREEN_W } = Dimensions.get('window');
const GAP = 12;
const COL_W = (SCREEN_W - 20 * 2 - GAP) / 2;

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
  const author = user?.name ?? '현장 작업자';

  const { data: allCards = [] } = useAllCards();
  const { data: stats } = useStudyStats();
  // 셀렉터는 안정적인 원본 배열만 반환하고(useSyncExternalStore 무한루프 방지), 필터는 useMemo 에서.
  const posts = useShareFeedStore((s) => s.posts);
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
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: c.textPrimary, fontSize: 18 * fs, fontFamily: fontCute, fontWeight: '800' }}>나의 성취 박물관 🏛️</Text>
        <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody, marginTop: 6, lineHeight: 19 }}>
          달성하고 자랑했던 랩드 카드가 모여요. 탭하면 크게 볼 수 있어요.
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
                <Pressable onPress={() => setSelected(t)} style={{ width: COL_W }}>
                  <View style={{ borderRadius: 20, overflow: 'hidden', boxShadow: `0 8px 20px ${rarity.glow === 'transparent' ? 'rgba(37,99,235,0.2)' : rarity.glow + '55'}` }}>
                    <WrappedShareCard snapshot={t.snapshot} author={t.author} width={COL_W} />
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
          <Pressable onPress={() => router.push(ROUTES.share as never)}
            style={{ width: COL_W, height: COL_W / SHARE_CARD_ASPECT, borderRadius: 20, borderWidth: 1.5, borderColor: c.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.surface }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={26} color={c.primary} />
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontCute }}>새 카드 만들기</Text>
          </Pressable>
        </View>
      </ScrollView>

      <TrophyDetailModal trophy={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

/** 트로피 상세 — 기기 기울기에 광택이 반응하는 큰 카드 + 등급 파티클. */
function TrophyDetailModal({ trophy, onClose }: { trophy: Trophy | null; onClose: () => void }) {
  const { fontScale: fs } = useTheme();
  const tilt = useTilt(!!trophy);
  const bigW = Math.min(SCREEN_W - 64, 320);
  const rarity = trophy ? getRarity(trophy.snapshot) : null;

  return (
    <Modal visible={!!trophy} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {trophy && rarity && (
          <Pressable onPress={() => {}}>
            <View style={{ borderRadius: 28 * (bigW / 320), boxShadow: `0 18px 48px ${rarity.glow === 'transparent' ? 'rgba(37,99,235,0.4)' : rarity.glow + '77'}` }}>
              <WrappedShareCard snapshot={trophy.snapshot} author={trophy.author} width={bigW} tilt={tilt} animated />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 16 }}>
              <Ionicons name="phone-portrait-outline" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 * fs, fontFamily: fontMono }}>기기를 기울여 광택을 감상하세요 · {rarity.label}</Text>
            </View>
            <Pressable onPress={onClose} style={{ alignSelf: 'center', marginTop: 14, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 10 }}>
              <Text style={{ color: '#fff', fontSize: 13 * fs, fontFamily: fontCute, fontWeight: '700' }}>닫기</Text>
            </Pressable>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}
