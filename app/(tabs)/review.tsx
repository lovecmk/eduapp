import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Button } from '../../src/components/ui/Button';
import { Badge } from '../../src/components/ui/Badge';
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { QuestionImage } from '../../src/components/ui/QuestionImage';
import { CategoryTrail } from '../../src/components/ui/CategoryTrail';
import { UpcomingSchedule } from '../../src/components/review/UpcomingSchedule';
import { fontCute, fontDisplay, fontBody, fontMono } from '../../src/theme/tokens';
import { getCategoryIcon } from '../../src/constants/categories';
import { ROUTES } from '../../src/constants/routes';
import { useReview } from '../../src/hooks/useReview';
import { useSrsStore } from '../../src/store/srsStore';
import { initialState, predictLabel, humanizeInterval, type Grade } from '../../src/domain/srs';
import type { LearningCard } from '../../src/domain/models/LearningCard';

const GRADES: { key: Grade; label: string; color: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'again', label: '다시', color: '#FF3B30', icon: 'refresh' },
  { key: 'hard', label: '어려움', color: '#FF9500', icon: 'trending-down' },
  { key: 'good', label: '보통', color: '#2563EB', icon: 'checkmark' },
  { key: 'easy', label: '쉬움', color: '#34C759', icon: 'flash' },
];

export default function ReviewScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const { dueCards, upcoming, nextDueAt, gradeCard, isLoading, error, refetch } = useReview();
  const srsCards = useSrsStore((s) => s.cards);

  const [session, setSession] = useState<LearningCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [againCount, setAgainCount] = useState(0);
  const [done, setDone] = useState(false);

  // 세션 시작 시 due 카드를 1회 스냅샷(채점 중 재정렬 방지).
  useEffect(() => {
    if (session === null && !isLoading) setSession(dueCards);
  }, [isLoading, dueCards, session]);

  const card = session?.[index];
  const srsState = card ? srsCards[card.id] ?? initialState() : initialState();

  const onGrade = (grade: Grade) => {
    if (!card || !session) return;
    gradeCard(card, grade);
    setReviewed((r) => r + 1);
    let nextSession = session;
    if (grade === 'again') {
      setAgainCount((a) => a + 1);
      nextSession = [...session, card]; // 이번 세션 안에서 다시 노출
      setSession(nextSession);
    }
    setFlipped(false);
    const nextIdx = index + 1;
    if (nextIdx >= nextSession.length) setDone(true);
    else setIndex(nextIdx);
  };

  const restart = () => {
    setSession(dueCards);
    setIndex(0); setFlipped(false); setReviewed(0); setAgainCount(0); setDone(false);
  };

  // --- 로딩/에러 ---
  if (isLoading && session === null && !error) {
    return <View style={{ flex: 1, backgroundColor: c.bg }}><SkeletonLoader count={3} /></View>;
  }
  if (error && session === null) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ErrorState message="복습 카드를 불러올 수 없어요" onRetry={refetch} />
      </View>
    );
  }

  // --- 복습할 카드 없음 ---
  if (session !== null && session.length === 0 && !done) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, flexGrow: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.success + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Ionicons name="checkmark-done" size={42} color={c.success} />
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 20 * fs, fontFamily: fontDisplay }}>복습 완료 상태예요</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 8, textAlign: 'center', lineHeight: 20, fontFamily: fontBody }}>
            지금 복습할 카드가 없어요.{'\n'}
            {nextDueAt ? `다음 복습은 ${humanizeInterval(nextDueAt - Date.now())} 뒤예요.` : '학습 카드에서 새 카드를 학습해보세요.'}
          </Text>
        </View>
        <UpcomingSchedule days={upcoming} />
        <View style={{ marginTop: 20 }}>
          <Button label="새 카드 학습하기" onPress={() => router.push(ROUTES.cards)} />
        </View>
      </ScrollView>
    );
  }

  // --- 세션 완료 요약 ---
  if (done) {
    const retention = reviewed > 0 ? Math.round(((reviewed - againCount) / reviewed) * 100) : 100;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, flexGrow: 1, justifyContent: 'center' }}>
        <Animated.View entering={FadeInDown.duration(400)} style={{ alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ fontSize: 52, marginBottom: 8 }}>🎉</Text>
          <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontFamily: fontDisplay }}>복습 완료!</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 6, fontFamily: fontBody }}>오늘의 기억을 한 번 더 다졌어요</Text>
        </Animated.View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          {[
            { v: `${reviewed}`, l: '복습 카드', color: c.primary },
            { v: `${retention}%`, l: '기억 유지', color: c.success },
            { v: `${againCount}`, l: '다시 볼 카드', color: c.warning },
          ].map((s) => (
            <View key={s.l} style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 14, alignItems: 'center' }}>
              <Text style={{ color: s.color, fontSize: 22 * fs, fontFamily: fontMono, fontWeight: '900' }}>{s.v}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 4, fontFamily: fontBody }}>{s.l}</Text>
            </View>
          ))}
        </View>

        <UpcomingSchedule days={upcoming} />

        <View style={{ marginTop: 20, gap: 10 }}>
          {dueCards.length > 0 && <Button label={`이어서 복습하기 (${dueCards.length})`} onPress={restart} />}
          <Button label="홈으로" variant="outline" onPress={() => router.replace(ROUTES.home)} />
        </View>
      </ScrollView>
    );
  }

  if (!card || !session) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const total = session.length;
  const progress = Math.round(((index) / total) * 100);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* 진행 헤더 */}
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="albums-outline" size={16} color={c.primary} />
            <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontDisplay }}>복습 세션</Text>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontMono }}>{index + 1} / {total}</Text>
        </View>
        <View style={{ height: 6, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ width: `${progress}%`, height: '100%', backgroundColor: c.primary, borderRadius: 3 }} />
        </View>
      </View>

      {/* 카드 */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, flexGrow: 1 }}>
        <Animated.View
          key={`${card.id}-${index}-${flipped}`}
          entering={FadeIn.duration(250)}
          style={{
            flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
            borderRadius: 20, padding: 22, minHeight: 380,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)', elevation: 4,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Badge label={card.category} />
              <View style={{ marginTop: 8 }}>
                <CategoryTrail category={card.category} subCategory={card.subCategory} topic={card.topic} size="sm" />
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <MemoryPill box={srsState.box} />
            </View>
          </View>

          {card.imageUrl ? (
            <View style={{ marginTop: 6, marginBottom: 12 }}>
              <QuestionImage uri={card.imageUrl} height={flipped ? 130 : 180} />
            </View>
          ) : null}

          {!flipped ? (
            <Pressable onPress={() => setFlipped(true)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              {!card.imageUrl && (
                <Ionicons name={getCategoryIcon(card.category)} size={44 * fs} color={c.primary} style={{ marginBottom: 12, opacity: 0.5 }} />
              )}
              <Text style={{ color: c.textPrimary, fontSize: 19 * fs, lineHeight: 29, textAlign: 'center', fontFamily: fontDisplay }}>
                {card.question}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 18 }}>
                <Ionicons name="hand-left-outline" size={14} color={c.textSecondary} />
                <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>탭하여 정답 확인</Text>
              </View>
            </Pressable>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
                <Ionicons name="checkmark-circle" size={22} color={c.success} style={{ marginRight: 8, marginTop: 2 }} />
                <Text style={{ color: c.primary, fontSize: 18 * fs, flex: 1, fontFamily: fontDisplay }}>{card.answer}</Text>
              </View>
              {card.highlights?.map((h, i) => (
                <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
                  <Text style={{ color: c.primary, fontSize: 13 * fs, marginRight: 6 }}>•</Text>
                  <Text style={{ color: c.textPrimary, fontSize: 13 * fs, lineHeight: 19, flex: 1, fontFamily: fontBody }}>{h}</Text>
                </View>
              ))}
              <Text style={{ color: c.textSecondary, fontSize: 13 * fs, lineHeight: 20, marginTop: 8, fontFamily: fontBody }}>{card.explanation}</Text>
              {(card.standards?.length ?? 0) > 0 && (
                <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 12, marginTop: 12 }}>
                  <Text style={{ color: c.textSecondary, fontSize: 11 * fs, marginBottom: 6, fontFamily: fontDisplay }}>관련 기준</Text>
                  {card.standards?.map((s, i) => (
                    <Text key={i} style={{ color: c.textSecondary, fontSize: 12 * fs, lineHeight: 18, fontFamily: fontBody }}>{s}</Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* 회상 난이도 버튼 */}
      {flipped && (
        <Animated.View entering={FadeInDown.duration(220)} style={{ paddingHorizontal: 16, paddingBottom: 26, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg }}>
          <Text style={{ color: c.textSecondary, fontSize: 11.5, textAlign: 'center', marginBottom: 10, fontFamily: fontBody }}>
            얼마나 잘 기억했나요? — 다음 복습 간격이 자동 조정돼요
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {GRADES.map((g) => (
              <Pressable
                key={g.key}
                onPress={() => onGrade(g.key)}
                style={{ flex: 1, backgroundColor: g.color + '14', borderWidth: 1.5, borderColor: g.color + '40', borderRadius: 14, paddingVertical: 10, alignItems: 'center', gap: 3 }}
              >
                <Ionicons name={g.icon} size={17} color={g.color} />
                <Text style={{ color: g.color, fontSize: 12.5, fontFamily: fontDisplay }}>{g.label}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 10, fontFamily: fontMono }}>{predictLabel(srsState, g.key)}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

/** 카드의 기억 강도(Leitner 박스) 배지. */
function MemoryPill({ box }: { box: number }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.surfaceAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: i < box ? c.success : c.border }} />
      ))}
      <Text style={{ color: c.textSecondary, fontSize: 9, marginLeft: 2, fontFamily: fontMono }}>Lv.{box}</Text>
    </View>
  );
}
