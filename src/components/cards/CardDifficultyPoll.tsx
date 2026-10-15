import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import type { DiffVote } from '../../domain/models/DifficultyPoll';
import { useDifficultyPoll } from '../../hooks/useDifficultyPoll';

const OPTIONS: { key: DiffVote; label: string; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; color: string }[] = [
  { key: 'easy', label: '쉬웠어요', icon: 'happy-outline', color: '#34C759' },
  { key: 'normal', label: '적당해요', icon: 'remove-circle-outline', color: '#FF9500' },
  { key: 'hard', label: '어려웠어요', icon: 'sad-outline', color: '#FF3B30' },
];

/** 복습 상세의 체감 난이도 기록. 학습 중 선택한 값은 여기서 변경하지 않는다. */
export function CardDifficultyPoll({ cardId }: { cardId: string }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  /**
   * 다른 사람의 분포는 **서버에서만** 온다(`/cards/:id/difficulty`). 서버가 열리기 전에는
   * counts 가 null 이라 분포를 그리지 않는다 — 예전에는 카드 id 를 해시해 "137명 참여 ·
   * 쉬웠어요 34%" 를 지어냈다(목업 모드 시연용 분포는 목업 저장소가 따로 만든다).
   */
  const { counts: crowd, mine: myVote } = useDifficultyPoll(cardId);
  const showCrowd = crowd !== null;
  const counts = crowd ?? { easy: 0, normal: 0, hard: 0 };
  const total = counts.easy + counts.normal + counts.hard;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <View testID="review-difficulty" style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <Ionicons name="podium-outline" size={16} color={c.primary} />
        <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontDisplay }}>체감 난이도</Text>
        <Text style={{ color: c.textSecondary, fontSize: 11 * fs, lineHeight: 17 * fs, marginLeft: 'auto', fontFamily: fontBody, flexShrink: 1 }}>
          {myVote ? '내 선택 · 변경할 수 없어요' : '아직 난이도 선택 기록이 없어요'}
        </Text>
      </View>

      {/* 저장된 선택을 표시하는 읽기 전용 항목 */}
      <View style={styles.options}>
        {OPTIONS.map((o) => {
          const active = myVote === o.key;
          return (
            <View accessible accessibilityLabel={`${o.label}${active ? ' · 내 선택' : ''}`} key={o.key}
              style={[styles.opt, { backgroundColor: active ? o.color + '1A' : c.surfaceAlt, borderColor: active ? o.color : c.border }]}>
              <Ionicons name={o.icon} size={20} color={active ? o.color : c.textSecondary} />
              <Text style={{ color: active ? o.color : c.textSecondary, fontSize: 11.5 * fs, lineHeight: 18 * fs, fontFamily: fontDisplay, marginTop: 4, textAlign: 'center' }}>{o.label}</Text>
              {active && <Text style={{ color: o.color, fontSize: 10 * fs, lineHeight: 16 * fs, fontFamily: fontBody }}>내 선택</Text>}
            </View>
          );
        })}
      </View>

      {/* 결과 분포(투표 후 공개) — 모을 곳이 없는 동안은 안내만 */}
      {myVote && !showCrowd && (
        <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, lineHeight: 17 * fs, fontFamily: fontBody, marginTop: 12 }}>
          다른 점검자들의 응답을 모아 보여주는 기능은 준비 중이에요.
        </Text>
      )}
      {myVote && showCrowd && (
        <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 14, gap: 8 }}>
          <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontFamily: fontBody }}>{total.toLocaleString()}명 참여</Text>
          {OPTIONS.map((o) => {
            const p = pct(counts[o.key]);
            const mine = myVote === o.key;
            return (
              <View key={o.key} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: mine ? o.color : c.textSecondary, fontSize: 11.5 * fs, fontFamily: mine ? fontDisplay : fontBody }}>
                    {o.label}{mine ? ' · 내 선택' : ''}
                  </Text>
                  <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontFamily: fontMono }}>{p}%</Text>
                </View>
                <View style={{ height: 7, backgroundColor: c.surfaceAlt, borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ width: `${p}%`, height: '100%', backgroundColor: o.color, borderRadius: 4, opacity: mine ? 1 : 0.55 }} />
                </View>
              </View>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 12 },
  options: { flexDirection: 'row', gap: 8 },
  opt: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
});
