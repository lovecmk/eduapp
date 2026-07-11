import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontMono, fontBody } from '../../theme/tokens';
import type { CardDifficulty } from '../../domain/models/LearningCard';

/** 난이도별 목표 시간(초) — 마이크로러닝 3분 흐름. */
export const TIME_BY_DIFFICULTY: Record<CardDifficulty, number> = {
  easy: 20,
  medium: 30,
  hard: 40,
};

/**
 * 카드 앞면(문제) 하단의 귀여운 카운트다운 타이머.
 * 시간 내에 뒤집지 않으면 onExpire 로 자동 뒤집기. (해설/뒷면은 렌더하지 않음 = 시간제한 없음)
 */
export function CardTimer({ seconds, resetKey, onExpire }: { seconds: number; resetKey: string; onExpire: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [remaining, setRemaining] = useState(seconds);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    setRemaining(seconds);
    let r = seconds;
    const t = setInterval(() => {
      r = Math.max(0, r - 0.1);
      setRemaining(r);
      if (r <= 0) { clearInterval(t); expireRef.current(); }
    }, 100);
    return () => clearInterval(t);
  }, [resetKey, seconds]);

  const pct = Math.max(0, Math.min(1, remaining / seconds));
  const low = remaining <= 5;
  const color = low ? c.error : c.primary;

  return (
    <View style={styles.wrap}>
      <View style={[styles.pill, { backgroundColor: color + '14', borderColor: color + '33' }]}>
        <Ionicons name={low ? 'alarm' : 'timer-outline'} size={14} color={color} />
        <Text style={[styles.time, { color }]}>{Math.ceil(remaining)}초</Text>
      </View>
      <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
      </View>
      <Text style={[styles.hint, { color: c.textSecondary }]}>{low ? '시간 안에 답을 떠올려보세요!' : '탭하면 바로 정답 확인'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 7 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  time: { fontSize: 13, fontFamily: fontMono, fontWeight: '800' },
  track: { width: 120, height: 5, borderRadius: 3, overflow: 'hidden' },
  hint: { fontSize: 11, fontFamily: fontBody },
});
