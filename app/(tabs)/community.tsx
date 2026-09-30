import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useSettingsStore } from '../../src/store/settingsStore';
import { LivePresenceCard } from '../../src/components/community/LivePresenceCard';
import { WeeklyChallengeCard } from '../../src/components/community/WeeklyChallengeCard';
import { CommunityBuildCard } from '../../src/components/community/CommunityBuildCard';
import { CommunityLeaderboardCard } from '../../src/components/community/CommunityLeaderboardCard';
import { CollectionTeaserCard } from '../../src/components/community/CollectionTeaserCard';
// '오늘의 플렉스' 피드는 커뮤니티에서 제거하고 MY(트로피룸)에서만 접근하도록 이동했다.
import { QuestionComposeModal } from '../../src/components/community/QuestionComposeModal';
import { HelpWantedCard, pickHelpWanted } from '../../src/components/community/HelpWantedCard';
import { MyContributionLine } from '../../src/components/community/MyContributionLine';
import { QnaOfflineNotice } from '../../src/components/community/QnaOfflineNotice';
import { CommunitySkeleton } from '../../src/components/skeletons';
import { useCommunity } from '../../src/hooks/useCommunity';
import { fontDisplay, fontBody, fontMono } from '../../src/theme/tokens';
import { getCategoryColor } from '../../src/constants/categories';
import { ROUTES } from '../../src/constants/routes';
import { useQuestions } from '../../src/hooks/useQna';
import { minutesSince, type Question } from '../../src/domain/models/Qna';
import { timeAgoLabel } from '../../src/store/notificationStore';
import { contentColumn } from '../../src/theme/layout';
import { useSafeTimeout } from '../../src/hooks/useSafeTimeout';

// 목록에 보여줄 질문 수. 예전엔 4개를 30초마다 자동 교체했는데,
// 읽는 도중 목록이 바뀌어 버려 "방금 본 질문이 어디 갔지?" 하는 혼란과 피로를 줬다.
// 이제 목록은 고정하고, 갱신은 사용자가 끝까지 내렸을 때만 일어난다.
const QNA_LIMIT = 5;

/** 로딩 중 참조가 매번 바뀌지 않도록 고정한 빈 목록(불필요한 재계산 방지). */
const EMPTY_QUESTIONS: Question[] = [];

export default function CommunityScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  // 질문 목록은 저장소(실서버 또는 목업)에서 온다 — 화면은 어느 쪽인지 모른다.
  const { data: questions = EMPTY_QUESTIONS, refetch: refetchQna } = useQuestions();
  const collectionEnabled = useSettingsStore((s) => s.collectionEnabled);
  const { data: liveData, isLoading: liveLoading, refetch } = useCommunity();
  const [composeOpen, setComposeOpen] = useState(false);
  // 끝까지 내려 새로고침할 때만 다음 묶음으로 넘어간다(자동 교체 없음).
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshLockRef = useRef(false);
  const { run } = useSafeTimeout();

  // 내가 올린 질문은 항상 상단 고정, 나머지(시드 풀)는 회전 대상.
  const mine = useMemo(() => questions.filter((q) => q.mine), [questions]);
  const pool = useMemo(() => questions.filter((q) => !q.mine), [questions]);

  // '답변을 기다리는 질문' 카드가 강조할 질문 — 아래 목록에서는 빼서 같은 질문이
  // 화면에 두 번 나오지 않게 한다(중복은 목록이 부실해 보이게 만든다).
  const highlighted = useMemo(() => pickHelpWanted(questions), [questions]);

  // 내 질문은 항상 위, 나머지는 새로고침할 때마다 다음 묶음으로 넘어간다.
  const listSlots = Math.max(0, QNA_LIMIT - mine.length);
  const rotated = useMemo(() => {
    const source = highlighted ? pool.filter((q) => q.id !== highlighted.id) : pool;
    if (source.length === 0 || listSlots === 0) return [];
    const take = Math.min(listSlots, source.length);
    const start = offset % source.length;
    return Array.from({ length: take }, (_, k) => source[(start + k) % source.length]);
  }, [pool, offset, listSlots, highlighted]);

  const visibleQuestions = useMemo(() => [...mine, ...rotated].slice(0, QNA_LIMIT), [mine, rotated]);

  // 하단까지 스크롤하면 새로고침 — 질문 묶음을 앞으로 밀고 라이브 데이터를 재요청.
  const onRefresh = useCallback(async () => {
    if (refreshLockRef.current) return;
    refreshLockRef.current = true;
    setRefreshing(true);
    setOffset((o) => (pool.length ? (o + QNA_LIMIT) % pool.length : o));
    // 질문 목록도 함께 다시 받는다 — 새로고침인데 남의 새 질문이 안 들어오면
    // "여긴 아무도 안 온다"는 인상만 굳는다.
    try { await Promise.all([refetch(), refetchQna()]); } catch { /* 무시 */ }
    run(() => { setRefreshing(false); refreshLockRef.current = false; }, 700);
  }, [pool.length, refetch, refetchQna, run]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 28) onRefresh();
  }, [onRefresh]);

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 36, ...contentColumn }} showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
        {/* ── 섹션 순서 원칙: '지금 할 수 있는 일'을 먼저, '쌓인 성과'는 뒤에 ──
            예전엔 보기만 하는 카드 4개(실시간·챌린지·랭킹·빌딩) 뒤에 질문&답변이 있었다.
            커뮤니티에서 사용자가 실제로 참여할 수 있는 유일한 행동이 Q&A 인데
            네 번 스크롤해야 닿으니 참여가 일어나기 어려웠다. 참여 영역을 위로 올린다. */}

        {/* 1. 지금 함께 학습 중 — 혼자가 아니라는 신호(소셜 증거) */}
        {liveLoading && !liveData ? <CommunitySkeleton /> : <LivePresenceCard />}

        {/* 2. 참여 영역 — 질문 & 답변 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="chatbox-ellipses" size={18} color={c.primary} />
            <Text style={{ color: c.textPrimary, fontSize: 16 * fs, fontFamily: fontDisplay }}>질문 & 답변</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => setComposeOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Ionicons name="add" size={15} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12.5 * fs, fontFamily: fontDisplay }}>질문하기</Text>
          </Pressable>
        </View>

        {/* 서버에 아직 붙지 않았으면 그 사실을 먼저 말한다 — 붙으면 스스로 사라진다 */}
        <QnaOfflineNotice />

        {/* 내 기여 한 줄 — 기여가 있을 때만 조용히 보인다 */}
        <MyContributionLine questions={questions} />

        {/* 답변을 기다리는 질문 1건 — 없으면 렌더되지 않는다 */}
        <HelpWantedCard question={highlighted} onPress={(id) => router.push(ROUTES.qna(id) as never)} />

        {questions.length === 0 ? (
          // 지어낸 질문으로 채우지 않는다(store/qnaStore 참고). 비어 있으면 비었다고
          // 말하고, 할 수 있는 일 하나를 가리킨다.
          <View style={{ alignItems: 'center', paddingVertical: 26, gap: 6 }}>
            <Ionicons name="chatbubbles-outline" size={26} color={c.textSecondary} />
            <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontBody, textAlign: 'center' }}>
              아직 올라온 질문이 없어요.{'\n'}현장에서 궁금했던 것을 첫 질문으로 올려보세요.
            </Text>
          </View>
        ) : (
          visibleQuestions.map((q, i) => (
            <Animated.View key={`${q.id}-${offset}`} entering={FadeInDown.delay(Math.min(i, 4) * 50).duration(280)}>
              <QuestionRow question={q} onPress={() => router.push(ROUTES.qna(q.id) as never)} />
            </Animated.View>
          ))
        )}

        {/* 3. 이번 주 목표·성과 — 참여 영역 아래로 */}
        {(!liveLoading || liveData) && (
          <View style={{ marginTop: 20 }}>
            <WeeklyChallengeCard />
            <CommunityLeaderboardCard />
            <CommunityBuildCard />
            {collectionEnabled && <CollectionTeaserCard />}
          </View>
        )}

        {/* 하단 새로고침 — 진행 중일 때만 표시한다.
            '맨 아래까지 내리면 새로고침돼요' 상시 안내는 매번 읽히는 노이즈라 없앴다. */}
        {refreshing && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 }}>
            <ActivityIndicator size="small" color={c.primary} />
            <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontBody }}>새로고침 중...</Text>
          </View>
        )}
      </ScrollView>

      <QuestionComposeModal visible={composeOpen} onClose={() => setComposeOpen(false)} onCreated={(id) => router.push(ROUTES.qna(id) as never)} />
    </View>
  );
}

function QuestionRow({ question: q, onPress }: { question: Question; onPress: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const accent = q.category ? getCategoryColor(q.category) ?? c.primary : c.primary;
  // 목록 응답에는 답변 본문이 없을 수 있으므로 개수·해결 여부는 카운터를 본다.
  const solved = q.solved;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {q.category && (
          <View style={{ backgroundColor: accent + '1A', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: accent, fontSize: 10.5 * fs, fontFamily: fontDisplay }}>{q.category}</Text>
          </View>
        )}
        {solved && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.success + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Ionicons name="checkmark-circle" size={11} color={c.success} />
            <Text style={{ color: c.success, fontSize: 10 * fs, fontFamily: fontDisplay }}>해결됨</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 14.5 * fs, lineHeight: 20 * fs, fontFamily: fontDisplay }}>{q.title}</Text>
      <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 4, fontFamily: fontBody }}>{q.body}</Text>
      <View style={styles.meta}>
        <View style={[styles.avatar, { backgroundColor: q.color }]}><Text style={styles.avatarText}>{q.author.charAt(0)}</Text></View>
        <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontFamily: fontBody }}>{q.author}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 10.5 * fs, fontFamily: fontMono }}>· {timeAgoLabel(minutesSince(q.createdAt))}</Text>
        <View style={{ flex: 1 }} />
        <View style={styles.stat}><Ionicons name="chatbubble-outline" size={13} color={q.answerCount ? c.primary : c.textSecondary} /><Text style={{ color: q.answerCount ? c.primary : c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontMono }}>{q.answerCount}</Text></View>
        <View style={styles.stat}><Ionicons name="heart-outline" size={13} color={c.textSecondary} /><Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontMono }}>{q.likes}</Text></View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  avatar: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 10, fontFamily: fontDisplay },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 8 },
});
