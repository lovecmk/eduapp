import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import type { DiffVote } from '../../domain/models/DifficultyPoll';
import { useDifficultyPoll } from '../../hooks/useDifficultyPoll';
import { firstDecision, useSrsStore } from '../../store/srsStore';
import { SectionTitle } from '../ui/SectionTitle';

const REVIEW_CHOICES = [
  { needsReview: true, label: '다음에 한번 더 볼게요', icon: 'refresh-circle' as const },
  { needsReview: false, label: '안 볼게요', icon: 'checkmark-circle' as const },
];

const OPTIONS: { key: DiffVote; label: string; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; color: string }[] = [
  { key: 'easy', label: '쉬웠어요', icon: 'happy-outline', color: '#34C759' },
  { key: 'normal', label: '적당해요', icon: 'remove-circle-outline', color: '#FF9500' },
  { key: 'hard', label: '어려웠어요', icon: 'sad-outline', color: '#FF3B30' },
];

/** 복습 상세의 학습 기록(처음 선택한 답변 + 체감 난이도). 학습 중 선택한 값은 여기서 변경하지 않는다. */
export function CardDifficultyPoll({ cardId }: { cardId: string }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  /**
   * 다른 사람의 분포는 **서버에서만** 온다(`/cards/:id/difficulty`). 서버가 열리기 전에는
   * counts 가 null 이라 분포를 그리지 않는다 — 예전에는 카드 id 를 해시해 "137명 참여 ·
   * 쉬웠어요 34%" 를 지어냈다(목업 모드 시연용 분포는 목업 저장소가 따로 만든다).
   */
  const { counts: crowd, mine: myVote } = useDifficultyPoll(cardId);
  const first = firstDecision(useSrsStore(s => s.cards[cardId]));
  const firstNeedsReview = first ? first.grade === 'again' || first.grade === 'hard' : null;
  const showCrowd = crowd !== null;
  const counts = crowd ?? { easy: 0, normal: 0, hard: 0 };
  const total = counts.easy + counts.normal + counts.hard;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const firstColor = firstNeedsReview === null ? c.textSecondary : firstNeedsReview ? c.warning : c.success;

  // 위 → 아래: 처음 선택한 답변 → 체감 난이도. 둘 다 학습 때 남긴 기록이라 한 카드에 담는다.
  return (
    <View testID="review-difficulty" style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View testID="recorded-review-choice">
        <SectionTitle icon="checkmark-done-circle" color={c.success} title="처음 선택한 답변"
          caption={first ? '처음 학습 때 고른 답' : undefined} />
        <View style={styles.options}>
          {REVIEW_CHOICES.map(option => {
            const active = firstNeedsReview === option.needsReview;
            const color = option.needsReview ? c.warning : c.success;
            return (
              <View key={option.label} accessible accessibilityRole="text" pointerEvents="none"
                accessibilityLabel={`${option.label}${active ? ' · 처음 선택' : ''}`}
                accessibilityState={{ disabled: true, selected: active }}
                style={[styles.recordedOpt, { backgroundColor: active ? color + '1A' : c.surfaceAlt, borderColor: active ? color : c.border }]}>
                <Ionicons name={option.icon} size={18} color={active ? color : c.textSecondary} />
                <Text style={{ color: active ? color : c.textSecondary, fontSize: 12 * fs, lineHeight: 19 * fs, fontFamily: fontDisplay, flexShrink: 1, textAlign: 'center' }}>{option.label}</Text>
              </View>
            );
          })}
        </View>
        <View style={[styles.note, { backgroundColor: firstColor + '12' }]}>
          <Ionicons name={first ? 'lock-closed' : 'information-circle-outline'} size={12} color={firstColor} />
          <Text testID="first-review-choice" style={{ color: c.textSecondary, fontSize: 11 * fs, lineHeight: 17 * fs, fontFamily: fontBody, flexShrink: 1 }}>
            {first ? '처음 선택한 기록이에요. 변경할 수 없어요.' : '이 카드의 최초 선택 기록을 확인할 수 없어요.'}
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: c.border }]} />

      <SectionTitle icon="podium" color={c.primary} title="체감 난이도"
        caption={myVote ? '내 선택 · 변경할 수 없어요' : '아직 난이도 선택 기록이 없어요'} />

      {/* 저장된 선택을 표시하는 읽기 전용 항목 */}
      <View testID="difficulty-options" style={styles.options}>
        {OPTIONS.map((o) => {
          const active = myVote === o.key;
          return (
            <View accessible accessibilityLabel={`${o.label}${active ? ' · 내 선택' : ''}`} key={o.key}
              style={[styles.opt, { backgroundColor: active ? o.color + '1A' : c.surfaceAlt, borderColor: active ? o.color : c.border }]}>
              <Ionicons name={o.icon} size={22} color={active ? o.color : c.textSecondary} />
              <Text style={{ color: active ? o.color : c.textSecondary, fontSize: 11.5 * fs, lineHeight: 18 * fs, fontFamily: fontDisplay, marginTop: 4, textAlign: 'center' }}>{o.label}</Text>
              {active && <Pill color={o.color} label="내 선택" fs={fs} />}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="people" size={12} color={c.textSecondary} />
            <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontFamily: fontBody }}>{total.toLocaleString()}명 참여</Text>
          </View>
          {OPTIONS.map((o) => {
            const p = pct(counts[o.key]);
            const mine = myVote === o.key;
            return (
              <View key={o.key} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: mine ? o.color : c.textSecondary, fontSize: 11.5 * fs, fontFamily: mine ? fontDisplay : fontBody }}>
                    {o.label}{mine ? ' · 내 선택' : ''}
                  </Text>
                  <Text style={{ color: mine ? o.color : c.textSecondary, fontSize: 11 * fs, fontFamily: fontMono }}>{p}%</Text>
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

/** 선택된 칸 아래의 작은 꼬리표 */
function Pill({ color, label, fs }: { color: string; label: string; fs: number }) {
  return (
    <View style={{ marginTop: 5, backgroundColor: color, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 }}>
      <Text style={{ color: '#fff', fontSize: 9.5 * fs, lineHeight: 15 * fs, fontFamily: fontDisplay }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  options: { flexDirection: 'row', gap: 8 },
  opt: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  recordedOpt: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, borderWidth: 1.5 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  divider: { height: 1, marginVertical: 16 },
});
