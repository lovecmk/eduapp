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

/** 아바타 줄에 그리는 최대 인원 — 나머지는 '+N' 으로 접는다. */
const MAX_AVATARS = 5;

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

  // 아바타에 그릴 사람과, 접혀서 안 보이는 인원.
  // 접힌 수는 **전체 접속자 - 나 - 그린 사람**이다. onlineNow 에서 5 를 빼던
  // 예전 식은 나를 빼지 않아, 나 말고 5명이 있을 때 '+1' 이 잘못 떴다.
  const shown = data.companions.slice(0, MAX_AVATARS);
  const more = Math.max(0, data.onlineNow - 1 - shown.length);

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

      {/* 동료 아바타 — '나 말고 누가 있나'. 나는 서버에서 이미 빠져 있다.

          아무도 없을 때 이 줄을 통째로 접는 이유: 예전에는 동료가 0명이어도
          '+0' 동그라미 하나가 홀로 떠서, 사람이 있는데 이름을 못 읽은 것처럼
          보였다. 혼자일 때는 아래 안내 한 줄이 그 자리를 대신한다. */}
      {shown.length > 0 ? (
        <View style={styles.companionRow}>
          <View style={styles.avatars}>
            {shown.map((cmp, i) => (
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
            {/* 접힌 인원이 실제로 있을 때만 '+N' 을 붙인다. */}
            {more > 0 && (
              <View style={[styles.avatar, styles.avatarMore, { backgroundColor: c.surfaceAlt, borderColor: c.surface, marginLeft: -10 }]}>
                <Text style={[styles.avatarMoreText, { color: c.textSecondary }]}>+{more}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.companionNames, { color: c.textSecondary }]} numberOfLines={1}>
            {shown.map((cmp) => cmp.name).join(' · ')}
            {more > 0 ? ` 외 ${more}명` : ''}
          </Text>
        </View>
      ) : (
        <View style={[styles.soloRow, { backgroundColor: c.surfaceAlt }]}>
          <Text style={styles.soloEmoji}>🌱</Text>
          <Text style={[styles.soloText, { color: c.textSecondary }]} numberOfLines={2}>
            지금은 나 혼자예요. 먼저 시작해서 자리를 데워둘까요?
          </Text>
        </View>
      )}

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

      {/* 공동 목표 진행바 —
          예전에는 진행바 아래에 '오늘 N명의 점검자가 함께했어요' 줄이 따로 있어
          한 카드에 숫자 블록이 세 개(지금 N명 / 분 / 오늘 N명) 쌓였다.
          누적 참여자 수를 목표 라벨에 합쳐 한 줄을 줄이고 카드를 가볍게 했다. */}
      <View style={styles.goalHeader}>
        <Text style={[styles.goalLabel, { color: c.textSecondary }]} numberOfLines={1}>
          오늘 함께 쌓은 학습 · {data.studiedToday.toLocaleString()}명 참여
        </Text>
        <Text style={[styles.goalValue, { color: c.textPrimary }]} numberOfLines={1}>
          {data.totalMinutesToday.toLocaleString()}
          <Text style={{ color: c.textSecondary, fontFamily: fontBody }}> / {data.dailyGoalMinutes.toLocaleString()}분</Text>
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
        <View style={[styles.fill, { width: `${goalPct}%`, backgroundColor: c.primary }]} />
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
  companionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  // 이름은 남는 폭만 차지한다 — 아바타가 밀리면 줄이 두 줄로 접힌다.
  companionNames: { fontSize: 11.5, fontFamily: fontBody, flex: 1, minWidth: 0 },
  soloRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  soloEmoji: { fontSize: 15 },
  soloText: { fontSize: 12, fontFamily: fontBody, flex: 1, minWidth: 0 },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '800', fontFamily: fontDisplay },
  avatarMore: {},
  avatarMoreText: { fontSize: 11, fontWeight: '800', fontFamily: fontMono },
  ticker: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  tickerText: { fontSize: 12.5, fontFamily: fontBody },
  tickerTime: { fontSize: 10, fontFamily: fontMono },
  goalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  // 좁은 화면(320px)에서 라벨이 줄지 않아 오른쪽 '5,619 / 9,000분' 이 두 줄로 접혔다.
  // flex 행에서는 줄어들 쪽에 flex:1 + minWidth:0 을, 지킬 쪽에 flexShrink:0 을 줘야 한다.
  goalLabel: { fontSize: 12, fontFamily: fontBody, flex: 1, minWidth: 0, marginRight: 8 },
  goalValue: { fontSize: 14, fontFamily: fontMono, fontWeight: '800', flexShrink: 0 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
