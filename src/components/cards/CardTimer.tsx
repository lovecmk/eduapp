import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
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

const TRACK_W = 120;

/**
 * 카드 앞면(문제) 하단의 귀여운 카운트다운 타이머 — "생각할 시간"을 재는 페이서.
 * 시간이 다 돼도 카드를 강제로 넘기지 않는다. 만료 시 onExpire 로 부드러운 신호(햅틱 등)만
 * 보내고, 뒤집기/정답 확인은 사용자가 준비됐을 때 직접 한다(제어권은 사용자에게).
 *
 * 성능: 진행 바는 UI 스레드(Reanimated)에서 한 번의 선형 트윈으로 매끄럽게 줄어든다 —
 * 카운트다운 동안 JS 리렌더가 발생하지 않는다. React 상태는 "표시되는 정수 초"와 만료 여부뿐이라,
 * 리렌더는 초가 실제로 바뀌는 순간(초당 1회 이하)에만 일어난다. (이전엔 setState 를 초당 10회
 * 호출해 매 프레임 리렌더가 났다.)
 */
export function CardTimer({ seconds, resetKey, onExpire }: { seconds: number; resetKey: string; onExpire?: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [displaySec, setDisplaySec] = useState(() => Math.ceil(seconds));
  const [expired, setExpired] = useState(false);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  const progress = useSharedValue(1);

  useEffect(() => {
    setExpired(false);
    setDisplaySec(Math.ceil(seconds));

    // 바: UI 스레드에서 1.0 → 0.0 으로 선형 감소(정확히 seconds 초). 프레임마다 매끄럽게 흐른다.
    progress.value = 1;
    progress.value = withTiming(0, { duration: seconds * 1000, easing: Easing.linear });

    // 텍스트: 벽시계(Date.now) 기준으로 남은 초를 계산해 드리프트를 막고,
    // 정수 초가 바뀔 때만 setState → 리렌더를 초당 1회 이하로 억제한다.
    const total = seconds * 1000;
    const start = Date.now();
    const t = setInterval(() => {
      const left = Math.max(0, total - (Date.now() - start)) / 1000;
      setDisplaySec((prev) => {
        const next = Math.ceil(left);
        return next !== prev ? next : prev;
      });
      if (left <= 0) {
        clearInterval(t);
        setExpired(true);
        expireRef.current?.();
      }
    }, 200);

    return () => {
      clearInterval(t);
      cancelAnimation(progress);
    };
  }, [resetKey, seconds]);

  const low = displaySec <= 5 && !expired;
  // 만료 = 실패가 아니라 "이제 확인해도 좋아요" — 차분한 성공색으로 안내한다.
  const color = expired ? c.success : low ? c.warning : c.primary;
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  return (
    <View style={styles.wrap}>
      <View style={[styles.pill, { backgroundColor: color + '14', borderColor: color + '33' }]}>
        <Ionicons name={expired ? 'checkmark-circle' : low ? 'alarm' : 'timer-outline'} size={14} color={color} />
        <Text style={[styles.time, { color }]}>{expired ? '준비 완료' : `${displaySec}초`}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
      </View>
      <Text style={[styles.hint, { color: c.textSecondary }]}>
        {expired ? '준비되면 탭해서 확인하세요' : low ? '시간 안에 답을 떠올려보세요!' : '탭하면 바로 정답 확인'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 7 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  time: { fontSize: 13, fontFamily: fontMono, fontWeight: '800' },
  track: { width: TRACK_W, height: 5, borderRadius: 3, overflow: 'hidden' },
  // 바닥 트랙 전체를 채운 뒤 scaleX(왼쪽 고정)로 줄인다 — 퍼센트 width 애니메이션보다 UI 스레드에 친화적.
  fill: { width: TRACK_W, height: '100%', borderRadius: 3, transformOrigin: 'left' },
  hint: { fontSize: 11, fontFamily: fontBody },
});
