import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { useCommunity } from '../../hooks/useCommunity';
import { percent } from '../../utils/percent';

/** 이번 주 함께 참여하는 공동 챌린지 — "함께 쌓아가는" 참여형 학습. */
export function WeeklyChallengeCard() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { data } = useCommunity();
  if (!data) return null;
  const ch = data.challenge;
  const pct = percent(ch.currentCards, ch.goalCards);

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Ionicons name="trophy" size={16} color={c.warning} />
          <Text style={{ color: c.textPrimary, fontSize: 14.5, fontFamily: fontDisplay }} numberOfLines={1}>{ch.title}</Text>
        </View>
        <View style={[styles.days, { backgroundColor: c.warning + '18' }]}>
          <Ionicons name="time" size={11} color={c.warning} />
          <Text style={{ color: c.warning, fontSize: 11, fontFamily: fontDisplay }}>{ch.endsInDays}일 남음</Text>
        </View>
      </View>

      {/* 공동 진행 */}
      <View style={{ marginTop: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
          <Text style={{ color: c.textPrimary, fontSize: 20, fontFamily: fontMono, fontWeight: '900' }}>
            {ch.currentCards.toLocaleString()}
            <Text style={{ color: c.textSecondary, fontSize: 13, fontFamily: fontBody }}> / {ch.goalCards.toLocaleString()}문제</Text>
          </Text>
          <Text style={{ color: c.warning, fontSize: 14, fontFamily: fontDisplay }}>{pct}%</Text>
        </View>
        <View style={{ height: 10, backgroundColor: c.surfaceAlt, borderRadius: 5, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: '100%', backgroundColor: c.warning, borderRadius: 5 }} />
        </View>
      </View>

      {/* 내 기여 + 참여자 */}
      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <View style={styles.stat}>
          <Ionicons name="hand-right" size={13} color={c.primary} />
          <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontBody }}>
            내 기여 <Text style={{ color: c.primary, fontFamily: fontDisplay }}>{ch.myContribution}문제</Text>
          </Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="people" size={13} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontBody }}>{ch.participants.toLocaleString()}명 참여</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, padding: 16, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  days: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
