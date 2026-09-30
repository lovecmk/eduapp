import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { useDiffPollStore, baseCounts, type DiffVote } from '../../store/diffPollStore';

const OPTIONS: { key: DiffVote; label: string; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; color: string }[] = [
  { key: 'easy', label: '쉬웠어요', icon: 'happy-outline', color: '#34C759' },
  { key: 'normal', label: '적당해요', icon: 'remove-circle-outline', color: '#FF9500' },
  { key: 'hard', label: '어려웠어요', icon: 'sad-outline', color: '#FF3B30' },
];

/** 체감 난이도 투표(사용자 참여) — 커뮤니티의 체감 난이도 분포를 함께 만든다. */
export function CardDifficultyPoll({ cardId }: { cardId: string }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const myVote = useDiffPollStore((s) => s.myVotes[cardId]);
  const vote = useDiffPollStore((s) => s.vote);

  const base = baseCounts(cardId);
  const counts = { ...base };
  if (myVote) counts[myVote] += 1;
  const total = counts.easy + counts.normal + counts.hard;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <Ionicons name="podium-outline" size={16} color={c.primary} />
        <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontDisplay }}>체감 난이도</Text>
        <Text style={{ color: c.textSecondary, fontSize: 11 * fs, marginLeft: 'auto', fontFamily: fontBody }}>
          {myVote ? `${total.toLocaleString()}명 참여` : '이 문제, 얼마나 어려우셨나요?'}
        </Text>
      </View>

      {/* 투표 버튼 */}
      <View style={styles.options}>
        {OPTIONS.map((o) => {
          const active = myVote === o.key;
          return (
            <Pressable accessibilityRole="button" key={o.key} onPress={() => vote(cardId, o.key)}
              style={[styles.opt, { backgroundColor: active ? o.color + '1A' : c.surfaceAlt, borderColor: active ? o.color : c.border }]}>
              <Ionicons name={o.icon} size={20} color={active ? o.color : c.textSecondary} />
              <Text style={{ color: active ? o.color : c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontDisplay, marginTop: 4 }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* 결과 분포(투표 후 공개) */}
      {myVote && (
        <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 14, gap: 8 }}>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  options: { flexDirection: 'row', gap: 8 },
  opt: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
});
