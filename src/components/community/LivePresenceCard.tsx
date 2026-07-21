import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
  FadeOut,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { useCommunity } from '../../hooks/useCommunity';
import { Skeleton, SkeletonCircle } from '../ui/Skeleton';
import type { LiveActivity } from '../../domain/models/Community';

function pulseText(a: LiveActivity): string {
  const cat = a.category ? `[${a.category}] ` : '';
  switch (a.action) {
    case 'mastered': return `${cat}카드를 마스터했어요 🎉`;
    case 'learning': return `${cat}학습을 시작했어요`;
    case 'streak': return `연속 학습 기록을 이어갔어요 🔥`;
    case 'joined': return `방금 학습에 참여했어요 👋`;
  }
}

function GreenPulse() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    scale.value = withRepeat(withSequence(withTiming(2.4, { duration: 1300, easing: Easing.out(Easing.ease) }), withTiming(1, { duration: 0 })), -1);
    opacity.value = withRepeat(withSequence(withTiming(0, { duration: 1300 }), withTiming(0.55, { duration: 0 })), -1);
  }, []);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  return (
    <View style={{ width: 8, height: 8, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' }, ring]} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' }} />
    </View>
  );
}

/** 접속자 수를 부드럽게 증감시키는 카운트업 숫자. */
function CountUp({ value, style }: { value: number; style?: object }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const from = display;
    const diff = value - from;
    if (diff === 0) return;
    const steps = 14;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setDisplay(Math.round(from + (diff * i) / steps));
      if (i >= steps) clearInterval(t);
    }, 28);
    return () => clearInterval(t);
  }, [value]);
  return <Text style={style as never}>{display.toLocaleString()}</Text>;
}

export function LivePresenceCard() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { data, isLoading } = useCommunity();
  const [tickerIdx, setTickerIdx] = useState(0);

  const activities = data?.activities ?? [];
  useEffect(() => {
    if (activities.length === 0) return;
    const t = setInterval(() => setTickerIdx((i) => (i + 1) % activities.length), 3200);
    return () => clearInterval(t);
  }, [activities.length]);

  if (isLoading && !data) {
    return (
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.header}>
          <Skeleton width="45%" height={15} />
          <Skeleton width={50} height={18} />
        </View>
        <View style={[styles.companionRow]}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCircle key={i} size={32} style={{ marginLeft: i === 0 ? 0 : -10 }} />
          ))}
        </View>
        <Skeleton width="100%" height={38} radius={12} style={{ marginTop: 12 }} />
        <Skeleton width="100%" height={8} radius={4} style={{ marginTop: 16 }} />
      </View>
    );
  }
  if (!data) return null;

  const goalPct = Math.min(100, Math.round((data.totalMinutesToday / data.dailyGoalMinutes) * 100));
  const current = activities[tickerIdx % Math.max(activities.length, 1)];

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* 헤더: 지금 함께 학습 중 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <GreenPulse />
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>지금 함께 학습 중</Text>
        </View>
        <View style={styles.onlineWrap}>
          <CountUp value={data.onlineNow} style={[styles.onlineNum, { color: c.primary }]} />
          <Text style={[styles.onlineUnit, { color: c.textSecondary }]}>명</Text>
        </View>
      </View>

      {/* 동료 아바타 + 라이브 티커 */}
      <View style={styles.companionRow}>
        <View style={styles.avatars}>
          {data.companions.slice(0, 5).map((cmp, i) => (
            <View
              key={cmp.id}
              style={[
                styles.avatar,
                { backgroundColor: cmp.color, borderColor: c.surface, marginLeft: i === 0 ? 0 : -10, zIndex: 5 - i },
              ]}
            >
              <Text style={styles.avatarText}>{cmp.name.charAt(0)}</Text>
            </View>
          ))}
          <View style={[styles.avatar, styles.avatarMore, { backgroundColor: c.surfaceAlt, borderColor: c.surface, marginLeft: -10 }]}>
            <Text style={[styles.avatarMoreText, { color: c.textSecondary }]}>+{Math.max(0, data.onlineNow - 5)}</Text>
          </View>
        </View>
      </View>

      {current ? (
        <View style={[styles.ticker, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="megaphone" size={13} color={c.primary} />
          <View style={{ flex: 1, overflow: 'hidden' }}>
            <Animated.Text
              key={current.id}
              entering={FadeIn.duration(400)}
              exiting={FadeOut.duration(200)}
              numberOfLines={1}
              style={[styles.tickerText, { color: c.textSecondary }]}
            >
              <Text style={{ color: c.textPrimary, fontFamily: fontDisplay }}>{current.name}</Text>
              님이 {pulseText(current)}
            </Animated.Text>
          </View>
          <Text style={[styles.tickerTime, { color: c.textSecondary }]}>{current.timeAgo}</Text>
        </View>
      ) : null}

      {/* 공동 목표 진행바 */}
      <View style={styles.goalHeader}>
        <Text style={[styles.goalLabel, { color: c.textSecondary }]}>오늘 함께 쌓은 학습</Text>
        <Text style={[styles.goalValue, { color: c.textPrimary }]}>
          {data.totalMinutesToday.toLocaleString()}
          <Text style={{ color: c.textSecondary, fontFamily: fontBody }}> / {data.dailyGoalMinutes.toLocaleString()}분</Text>
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
        <View style={[styles.fill, { width: `${goalPct}%`, backgroundColor: c.primary }]} />
      </View>

      <View style={styles.footer}>
        <Ionicons name="people" size={13} color={c.textSecondary} />
        <Text style={[styles.footerText, { color: c.textSecondary }]}>
          오늘 <Text style={{ color: c.primary, fontFamily: fontDisplay }}>{data.studiedToday.toLocaleString()}명</Text>의 점검자가 함께했어요
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, padding: 16, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 15, fontFamily: fontDisplay },
  onlineWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  onlineNum: { fontSize: 20, fontFamily: fontMono, fontWeight: '900' },
  onlineUnit: { fontSize: 12, fontFamily: fontBody },
  companionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '800', fontFamily: fontDisplay },
  avatarMore: {},
  avatarMoreText: { fontSize: 11, fontWeight: '800', fontFamily: fontMono },
  ticker: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  tickerText: { fontSize: 12.5, fontFamily: fontBody },
  tickerTime: { fontSize: 10, fontFamily: fontMono },
  goalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  goalLabel: { fontSize: 12, fontFamily: fontBody },
  goalValue: { fontSize: 14, fontFamily: fontMono, fontWeight: '800' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  footerText: { fontSize: 12, fontFamily: fontBody },
});
