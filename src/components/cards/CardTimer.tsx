import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, AppState } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, cancelAnimation, interpolateColor } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontMono } from '../../theme/tokens';
import type { CardDifficulty } from '../../domain/models/LearningCard';

/** 난이도별 목표 시간(초) — 마이크로러닝 3분 흐름. */
export const TIME_BY_DIFFICULTY: Record<CardDifficulty, number> = {
  easy: 20,
  medium: 30,
  hard: 40,
};

/**
 * 카드 앞면 상단의 작은 타이머. 칩 배경이 차오르며 생각할 시간의 경과를 보여준다.
 * 시간이 다 돼도 카드를 강제로 넘기지 않는다. 만료 시 onExpire 로 부드러운 신호(햅틱 등)만
 * 보내고, 뒤집기/정답 확인은 사용자가 준비됐을 때 직접 한다(제어권은 사용자에게).
 *
 * 성능: 칩의 배경은 UI 스레드(Reanimated)에서 선형 트윈으로 매끄럽게 변한다 —
 * 카운트다운 동안 JS 리렌더가 발생하지 않는다. React 상태는 "표시되는 정수 초"와 만료 여부뿐이라,
 * 리렌더는 초가 실제로 바뀌는 순간(초당 1회 이하)에만 일어난다. (이전엔 setState 를 초당 10회
 * 호출해 매 프레임 리렌더가 났다.)
 */
export function CardTimer({ seconds, resetKey, onExpire }: { seconds: number; resetKey: string; onExpire?: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const [displaySec, setDisplaySec] = useState(() => Math.ceil(seconds));
  const [expired, setExpired] = useState(false);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  const progress = useSharedValue(1);

  useEffect(() => {
    setExpired(false);
    setDisplaySec(Math.ceil(seconds));

    // 텍스트: 벽시계(Date.now) 기준으로 남은 초를 계산해 드리프트를 막고,
    // 정수 초가 바뀔 때만 setState → 리렌더를 초당 1회 이하로 억제한다.
    //
    // 백그라운드 처리: 전화·알림 확인 등으로 앱을 잠깐 나갔다 오면, 벽시계 기준이라
    // 그동안의 시간이 그대로 흘러 돌아왔을 때 이미 '준비 완료'가 되어 있다.
    // 이 타이머는 '생각할 시간'을 재는 페이서이므로, 화면을 보지 않은 시간은 세지 않는다.
    // → 비활성 구간의 길이를 누적해(pausedMs) 남은 시간 계산에서 빼준다.
    const total = Math.max(0, seconds * 1000);
    const start = Date.now();
    let pausedMs = 0;
    let pausedAt: number | null = AppState.currentState === 'background' || AppState.currentState === 'inactive' ? Date.now() : null;
    progress.value = 1;
    if (pausedAt === null) progress.value = withTiming(0, { duration: total, easing: Easing.linear });

    const appSub = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        if (pausedAt !== null) {
          pausedMs += Date.now() - pausedAt;
          pausedAt = null;
          // 남은 시간에 맞춰 칩 배경도 다시 이어서 흐르게 한다.
          const leftMs = Math.max(0, total - (Date.now() - start - pausedMs));
          cancelAnimation(progress);
          progress.value = total > 0 ? leftMs / total : 0;
          if (leftMs > 0) {
            progress.value = withTiming(0, { duration: leftMs, easing: Easing.linear });
          }
        }
      } else if (pausedAt === null) {
        pausedAt = Date.now();
        cancelAnimation(progress);
      }
    });

    const t = setInterval(() => {
      if (pausedAt !== null) return; // 백그라운드 동안에는 카운트다운을 멈춘다
      const left = Math.max(0, total - (Date.now() - start - pausedMs)) / 1000;
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
      appSub.remove();
      cancelAnimation(progress);
    };
  }, [resetKey, seconds]);

  const low = displaySec <= 5 && !expired;
  // 만료 = 실패가 아니라 "이제 확인해도 좋아요" — 차분한 성공색으로 안내한다.
  const color = expired ? c.success : low ? c.warning : c.primary;
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: 1 - progress.value }],
    backgroundColor: interpolateColor(progress.value, [0, 0.17, 1], [c.success + '33', c.warning + '44', c.primary + '26']),
  }));

  return (
    <View testID="card-timer" accessible accessibilityLabel={expired ? '생각할 시간 종료, 준비 완료' : `생각할 시간 ${displaySec}초 남음`} accessibilityLiveRegion={expired ? 'polite' : 'none'} style={[styles.pill, { backgroundColor: c.surfaceAlt, borderColor: color + '44' }]}>
      <Animated.View testID="card-timer-fill" pointerEvents="none" style={[styles.fill, fillStyle]} />
      <Ionicons name={expired ? 'checkmark-circle' : low ? 'alarm' : 'timer-outline'} size={12} color={color} />
      <Text style={[styles.time, { color, fontSize: 11 * fs, lineHeight: 14 * fs }]}>{expired ? '준비' : `${displaySec}초`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { minWidth: 64, minHeight: 22, flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
  time: { fontFamily: fontMono, fontWeight: '800' },
  fill: { ...StyleSheet.absoluteFillObject, transformOrigin: 'left' },
});
