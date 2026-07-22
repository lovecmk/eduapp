import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontDisplay, fontBody, fontCute, fontMono, shadowBox } from '../../theme/tokens';
import { getCategoryIcon, getCategoryColor } from '../../constants/categories';
import { ROUTES } from '../../constants/routes';
import { useSrsStore } from '../../store/srsStore';
import { dateKey } from '../../utils/dateKey';
import type { LearningCard } from '../../domain/models/LearningCard';

/**
 * 복습 화면 최상단 — "오늘 학습한 카드".
 *
 * 복습 구조의 첫 단계는 '당일 복습(same-day retrieval)'이다.
 * 배운 직후~같은 날 안에 한 번 더 인출(retrieval)하면 기억 정착이 크게 오른다
 * (테스트 효과 · 초기 망각 구간 방어). 그래서 오늘 학습한 카드를 맨 위에 모아,
 * 배운 즉시 가볍게 다시 볼 수 있게 한다. 카드를 누르면 그 한 장만 바로 다시 학습하고
 * 복습 화면으로 돌아온다.
 *
 * 오늘 학습 목록은 SRS 스토어의 history[오늘] 에서 온다 — 실제로 오늘 채점한(넘긴) 카드만 담긴다.
 */
export function TodayStudiedSection({ allCards }: { allCards: LearningCard[] }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const history = useSrsStore((s) => s.history);

  // 가로 스크롤(페이징)에서 그림자가 진하면 카드가 지나갈 때 잔상이 남는다.
  // 기존 전역 카드 그림자(shadowBox)보다 훨씬 옅고 짧게 떨어지는 그림자로 낮춰 잔상을 줄인다.
  const softShadow = shadowBox({ ...theme.shadow, opacity: theme.shadow.opacity * 0.5, radius: 8, offsetY: 2 });

  const todayCards = useMemo(() => {
    const ids = history[dateKey(new Date())] ?? [];
    if (ids.length === 0) return [] as LearningCard[];
    const byId = new Map(allCards.map((card) => [card.id, card]));
    // 최근 학습 순(뒤에 추가된 것이 최신)으로 보여주기 위해 뒤집는다.
    return ids
      .map((id) => byId.get(id))
      .filter((x): x is LearningCard => !!x)
      .reverse();
  }, [history, allCards]);

  // 오늘 학습한 카드를 누르면 '컨텐츠 상세'(앞면 질문 + 뒷면 해설이 한 화면에 모두 보임)로 이동한다.
  // 다시 학습 세션으로 들어가 카드를 넘기는 대신, 앞뒤를 한눈에 복습하도록 한다.
  const openDetail = (id: string) => {
    router.push(ROUTES.content(id) as never);
  };

  return (
    <View style={{ marginBottom: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Ionicons name="today" size={16} color={c.primary} />
        <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>오늘 학습한 카드</Text>
        {todayCards.length > 0 && (
          <View style={{ backgroundColor: c.primary + '18', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 2 }}>
            <Text style={{ color: c.primary, fontSize: 11 * fs, fontWeight: '800', fontFamily: fontMono }}>{todayCards.length}</Text>
          </View>
        )}
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginBottom: 12, fontFamily: fontBody }}>
        배운 즉시 한 번 더 보면 오래 기억돼요
      </Text>

      {todayCards.length === 0 ? (
        <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.card, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, boxShadow: softShadow, elevation: 1 }}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sunny-outline" size={22} color={c.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textPrimary, fontSize: 13.5 * fs, fontFamily: fontDisplay }}>아직 오늘 학습한 카드가 없어요</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 * fs, marginTop: 2, fontFamily: fontBody }}>학습을 마치면 여기에서 바로 다시 볼 수 있어요</Text>
          </View>
          <Pressable onPress={() => router.push(ROUTES.cards)} hitSlop={6} style={{ backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 }}>
            <Text style={{ color: '#fff', fontSize: 12.5 * fs, fontFamily: fontDisplay }}>학습</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
          {todayCards.map((card) => {
            const color = getCategoryColor(card.category) ?? c.primary;
            return (
              <Pressable
                key={card.id}
                onPress={() => openDetail(card.id)}
                style={{ width: 168, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.card, padding: 14, boxShadow: softShadow, elevation: 1 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={getCategoryIcon(card.category)} size={18} color={color} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.surfaceAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Ionicons name="refresh" size={11} color={c.textSecondary} />
                    <Text style={{ color: c.textSecondary, fontSize: 10.5 * fs, fontFamily: fontCute }}>다시 보기</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={{ color: color, fontSize: 11 * fs, fontFamily: fontDisplay, marginBottom: 3 }}>{card.category}</Text>
                <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 13 * fs, lineHeight: 18 * fs, fontFamily: fontCute }}>{card.question}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
