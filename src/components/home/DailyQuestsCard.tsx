import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { useDailyQuests, type Quest } from '../../hooks/useDailyQuests';

/** 일일 미션 카드 — 데일리 퀘스트로 오늘의 학습 복귀를 유도. */
export function DailyQuestsCard() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { quests, completed, total, allDone } = useDailyQuests();

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: allDone ? c.success + '55' : c.border }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="ribbon" size={16} color={allDone ? c.success : c.primary} />
          <Text style={{ color: c.textPrimary, fontSize: 15, fontFamily: fontDisplay }}>오늘의 미션</Text>
        </View>
        <View style={[styles.counter, { backgroundColor: (allDone ? c.success : c.primary) + '18' }]}>
          <Text style={{ color: allDone ? c.success : c.primary, fontSize: 12, fontFamily: fontMono }}>{completed}/{total}</Text>
        </View>
      </View>

      {allDone && (
        <View style={[styles.congrats, { backgroundColor: c.success + '12' }]}>
          <Text style={{ fontSize: 15 }}>🎉</Text>
          <Text style={{ color: c.success, fontSize: 12.5, fontFamily: fontDisplay }}>오늘 미션을 모두 완료했어요! 내일 또 만나요</Text>
        </View>
      )}

      <View style={{ gap: 10, marginTop: allDone ? 4 : 2 }}>
        {quests.map((q) => <QuestRow key={q.id} quest={q} />)}
      </View>
    </View>
  );
}

function QuestRow({ quest }: { quest: Quest }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const pct = Math.round((quest.progress / quest.target) * 100);
  return (
    <View style={styles.quest}>
      <View style={[styles.qIcon, { backgroundColor: quest.done ? c.success + '1A' : c.surfaceAlt }]}>
        <Ionicons name={quest.done ? 'checkmark' : quest.icon} size={15} color={quest.done ? c.success : c.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <Text style={{ color: quest.done ? c.textSecondary : c.textPrimary, fontSize: 13, fontFamily: fontBody, textDecorationLine: quest.done ? 'line-through' : 'none' }}>{quest.label}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontMono }}>{quest.progress}/{quest.target}</Text>
        </View>
        <View style={{ height: 5, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: '100%', backgroundColor: quest.done ? c.success : c.primary, borderRadius: 3 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, padding: 16, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  counter: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  congrats: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 10, marginBottom: 12 },
  quest: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
