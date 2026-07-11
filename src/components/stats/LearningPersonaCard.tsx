import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { ALL_CATEGORIES, CATEGORY_COLOR } from '../../constants/categories';
import { EMBLEM_DEFS } from '../../utils/emblems';
import { RadarChart, type RadarDatum } from './RadarChart';
import type { LearningCard, CardCategory } from '../../domain/models/LearningCard';

const EMOJI: Record<string, string> = Object.fromEntries(EMBLEM_DEFS.map((d) => [d.category, d.emoji]));

interface Persona {
  emoji: string;
  title: string;
  desc: string;
}

function buildPersona(values: { cat: CardCategory; value: number; total: number }[]): Persona {
  const withData = values.filter((v) => v.total > 0);
  const learned = withData.filter((v) => v.value > 0);
  if (learned.length === 0) return { emoji: '🐣', title: '새내기 점검가', desc: '이제 막 학습을 시작했어요. 함께 채워가요!' };

  const sorted = [...withData].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const spread = top.value - sorted[sorted.length - 1].value;
  const masteredCats = withData.filter((v) => v.value >= 0.6).length;

  if (masteredCats >= 4) return { emoji: '🧭', title: '올라운드 마스터', desc: '전 분야를 고르게 마스터한 만능 점검가예요!' };
  if (spread < 0.18) return { emoji: '⚖️', title: '균형잡힌 점검가', desc: '어느 한쪽에 치우치지 않고 골고루 학습하고 있어요.' };
  return { emoji: EMOJI[top.cat] ?? '🎯', title: `${top.cat} 스페셜리스트`, desc: `${top.cat} 분야에 특히 강해요. 든든한 전문가!` };
}

/** 학습 성향 카드 — 레이더 차트 + 귀여운 페르소나 + 강화 추천. */
export function LearningPersonaCard({ cards, interests }: { cards: LearningCard[]; interests: CardCategory[] }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const values = useMemo(() => {
    return ALL_CATEGORIES.map((cat) => {
      const inCat = cards.filter((x) => x.category === cat);
      const mastered = inCat.filter((x) => x.status === 'mastered').length;
      const value = inCat.length > 0 ? mastered / inCat.length : 0;
      return { cat, value, total: inCat.length, mastered };
    });
  }, [cards]);

  const radarData: RadarDatum[] = values.map((v) => ({ label: v.cat, value: v.value, color: CATEGORY_COLOR[v.cat] }));
  const persona = useMemo(() => buildPersona(values), [values]);

  // 강화 추천: 관심분야 중 약한 곳 우선, 없으면 전체에서 가장 약한 곳
  const suggestion = useMemo(() => {
    const pool = interests.length > 0 ? values.filter((v) => interests.includes(v.cat)) : values;
    const candidates = (pool.length > 0 ? pool : values).filter((v) => v.total > 0);
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => a.value - b.value)[0];
  }, [values, interests]);

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={16} color={c.primary} />
        <Text style={{ color: c.textPrimary, fontSize: 15, fontFamily: fontDisplay }}>나의 학습 성향</Text>
      </View>

      {/* 페르소나 */}
      <View style={[styles.persona, { backgroundColor: c.surfaceAlt }]}>
        <Text style={{ fontSize: 34 }}>{persona.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.textPrimary, fontSize: 16, fontFamily: fontDisplay }}>{persona.title}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2, fontFamily: fontBody }}>{persona.desc}</Text>
        </View>
      </View>

      {/* 레이더 */}
      <RadarChart data={radarData} />

      {/* 분야별 수치 */}
      <View style={styles.legend}>
        {values.map((v) => (
          <View key={v.cat} style={styles.legendItem}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CATEGORY_COLOR[v.cat] }} />
            <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody }}>{v.cat}</Text>
            <Text style={{ color: c.textPrimary, fontSize: 11, fontFamily: fontMono }}>{Math.round(v.value * 100)}%</Text>
          </View>
        ))}
      </View>

      {/* 강화 추천 */}
      {suggestion && (
        <View style={[styles.suggestion, { backgroundColor: (CATEGORY_COLOR[suggestion.cat] ?? c.primary) + '14', borderColor: (CATEGORY_COLOR[suggestion.cat] ?? c.primary) + '33' }]}>
          <Text style={{ fontSize: 18 }}>{EMOJI[suggestion.cat] ?? '💡'}</Text>
          <Text style={{ color: c.textPrimary, fontSize: 12.5, flex: 1, lineHeight: 18, fontFamily: fontBody }}>
            <Text style={{ fontFamily: fontDisplay, color: CATEGORY_COLOR[suggestion.cat] ?? c.primary }}>{suggestion.cat}</Text>
            {' '}분야를 조금 더 채우면 성향이 더 단단해져요{interests.includes(suggestion.cat) ? ' (관심 분야)' : ''}!
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, padding: 16, marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  persona: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 8, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 12 },
});
