import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
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
import { CommunitySkeleton } from '../../src/components/skeletons';
import { useCommunity } from '../../src/hooks/useCommunity';
import { fontDisplay, fontBody, fontMono } from '../../src/theme/tokens';
import { getCategoryColor } from '../../src/constants/categories';
import { ROUTES } from '../../src/constants/routes';
import { useQnaStore, type Question } from '../../src/store/qnaStore';
import { timeAgoLabel } from '../../src/store/notificationStore';

// 한 번에 보여줄 최대 질문 수 — 최대 4개.
const QNA_WINDOW = 4;
// 회전 주기(ms) — 30초마다 다른 질문 묶음이 실시간처럼 갈아끼워진다.
const QNA_ROTATE_MS = 30_000;

export default function CommunityScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const questions = useQnaStore((s) => s.questions);
  const collectionEnabled = useSettingsStore((s) => s.collectionEnabled);
  const { data: liveData, isLoading: liveLoading } = useCommunity();
  const [composeOpen, setComposeOpen] = useState(false);
  // 회전 창(window)의 시작 오프셋 — 30초마다 앞으로 밀며 질문을 순환 노출.
  const [offset, setOffset] = useState(0);

  // 내가 올린 질문은 항상 상단 고정, 나머지(시드 풀)는 회전 대상.
  const mine = useMemo(() => questions.filter((q) => q.mine), [questions]);
  const pool = useMemo(() => questions.filter((q) => !q.mine), [questions]);

  // 30초마다 회전 — 창 크기만큼 앞으로 밀어 새 묶음이 나타나게 한다.
  useEffect(() => {
    if (pool.length <= QNA_WINDOW) return; // 회전이 필요 없을 만큼 적으면 고정.
    const t = setInterval(() => setOffset((o) => (o + QNA_WINDOW) % pool.length), QNA_ROTATE_MS);
    return () => clearInterval(t);
  }, [pool.length]);

  // 고정 슬롯(내 질문)을 빼고 남는 자리만큼만 회전 풀에서 채운다(전체 최대 4개 유지).
  const rotateSlots = Math.max(0, QNA_WINDOW - mine.length);
  const rotated = useMemo(() => {
    if (pool.length === 0 || rotateSlots === 0) return [];
    const take = Math.min(rotateSlots, pool.length);
    const start = offset % pool.length;
    return Array.from({ length: take }, (_, k) => pool[(start + k) % pool.length]);
  }, [pool, offset, rotateSlots]);

  const visibleQuestions = useMemo(() => [...mine, ...rotated].slice(0, QNA_WINDOW), [mine, rotated]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        {/* 함께 학습 — 실시간 데이터가 도착하기 전엔 스켈레톤으로 자리를 지킨다 */}
        {liveLoading && !liveData ? (
          <CommunitySkeleton />
        ) : (
          <>
            <LivePresenceCard />
            {collectionEnabled && <CollectionTeaserCard />}
            <WeeklyChallengeCard />
            <CommunityLeaderboardCard />
            <CommunityBuildCard />
          </>
        )}

        {/* 질문 & 답변 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="chatbox-ellipses" size={18} color={c.primary} />
            <Text style={{ color: c.textPrimary, fontSize: 16, fontFamily: fontDisplay }}>질문 & 답변</Text>
            {/* 실시간처럼 갱신되는 느낌을 주는 라이브 표시 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4, backgroundColor: c.error + '14', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.error }} />
              <Text style={{ color: c.error, fontSize: 10, fontFamily: fontMono }}>LIVE</Text>
            </View>
          </View>
          <Pressable onPress={() => setComposeOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Ionicons name="add" size={15} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12.5, fontFamily: fontDisplay }}>질문하기</Text>
          </Pressable>
        </View>

        {/* 30초마다 최대 4개가 순환하며 갱신 — key 에 offset 을 섞어 매 회전마다 페이드 인 */}
        {visibleQuestions.map((q, i) => (
          <Animated.View key={`${q.id}-${offset}`} entering={FadeInDown.delay(Math.min(i, 4) * 60).duration(320)}>
            <QuestionRow question={q} onPress={() => router.push(ROUTES.qna(q.id) as never)} />
          </Animated.View>
        ))}

        {pool.length > QNA_WINDOW && (
          <Text style={{ color: c.textSecondary, fontSize: 11.5, textAlign: 'center', marginTop: 4, fontFamily: fontBody }}>
            30초마다 새로운 질문이 올라와요 · 전체 {questions.length}개
          </Text>
        )}
      </ScrollView>

      <QuestionComposeModal visible={composeOpen} onClose={() => setComposeOpen(false)} onCreated={(id) => router.push(ROUTES.qna(id) as never)} />
    </View>
  );
}

function QuestionRow({ question: q, onPress }: { question: Question; onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const accent = q.category ? getCategoryColor(q.category) ?? c.primary : c.primary;
  const solved = q.answers.some((a) => a.accepted);
  return (
    <Pressable onPress={onPress} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {q.category && (
          <View style={{ backgroundColor: accent + '1A', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: accent, fontSize: 10.5, fontFamily: fontDisplay }}>{q.category}</Text>
          </View>
        )}
        {solved && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.success + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Ionicons name="checkmark-circle" size={11} color={c.success} />
            <Text style={{ color: c.success, fontSize: 10, fontFamily: fontDisplay }}>해결됨</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 14.5, lineHeight: 20, fontFamily: fontDisplay }}>{q.title}</Text>
      <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: 12.5, marginTop: 4, fontFamily: fontBody }}>{q.body}</Text>
      <View style={styles.meta}>
        <View style={[styles.avatar, { backgroundColor: q.color }]}><Text style={styles.avatarText}>{q.author.charAt(0)}</Text></View>
        <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody }}>{q.author}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontMono }}>· {timeAgoLabel(q.minutesAgo)}</Text>
        <View style={{ flex: 1 }} />
        <View style={styles.stat}><Ionicons name="chatbubble-outline" size={13} color={q.answers.length ? c.primary : c.textSecondary} /><Text style={{ color: q.answers.length ? c.primary : c.textSecondary, fontSize: 11.5, fontFamily: fontMono }}>{q.answers.length}</Text></View>
        <View style={styles.stat}><Ionicons name="heart-outline" size={13} color={c.textSecondary} /><Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontMono }}>{q.likes}</Text></View>
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
