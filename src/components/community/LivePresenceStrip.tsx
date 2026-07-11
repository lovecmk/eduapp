import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, FadeIn, FadeOut, Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody } from '../../theme/tokens';
import { useCommunity } from '../../hooks/useCommunity';
import { ROUTES } from '../../constants/routes';
import type { LiveActivity } from '../../domain/models/Community';

function actionText(a: LiveActivity): string {
  const cat = a.category ? `${a.category} ` : '';
  switch (a.action) {
    case 'mastered': return `${cat}카드를 마스터했어요 🎉`;
    case 'learning': return `${cat}학습을 시작했어요`;
    case 'streak': return `연속 학습 기록을 이어갔어요 🔥`;
    case 'joined': return `방금 학습에 참여했어요 👋`;
  }
}

/** 홈 상단의 얇은 라이브 스트립 — 서비스가 살아있는 느낌을 준다. 탭하면 커뮤니티로. */
export function LivePresenceStrip() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { data } = useCommunity();
  const [idx, setIdx] = useState(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    scale.value = withRepeat(withSequence(withTiming(2.2, { duration: 1300, easing: Easing.out(Easing.ease) }), withTiming(1, { duration: 0 })), -1);
    opacity.value = withRepeat(withSequence(withTiming(0, { duration: 1300 }), withTiming(0.55, { duration: 0 })), -1);
  }, []);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

  const activities = data?.activities ?? [];
  useEffect(() => {
    if (activities.length === 0) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % activities.length), 3400);
    return () => clearInterval(t);
  }, [activities.length]);

  if (!data) return null;
  const cur = activities[idx % Math.max(activities.length, 1)];

  return (
    <Pressable onPress={() => router.push(ROUTES.community)} style={[styles.strip, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
      <View style={styles.dotWrap}>
        <Animated.View style={[styles.ring, { backgroundColor: '#34C759' }, ring]} />
        <View style={[styles.dot, { backgroundColor: '#34C759' }]} />
      </View>
      <Text style={{ color: c.textPrimary, fontSize: 12.5, fontFamily: fontDisplay }}>{data.onlineNow}명 학습 중</Text>
      <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: c.border }} />
      <View style={{ flex: 1, overflow: 'hidden' }}>
        {cur && (
          <Animated.Text key={cur.id} entering={FadeIn.duration(400)} exiting={FadeOut.duration(200)} numberOfLines={1} style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontBody }}>
            <Text style={{ color: c.textPrimary, fontFamily: fontDisplay }}>{cur.name}</Text>님이 {actionText(cur)}
          </Animated.Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={14} color={c.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9, marginBottom: 14 },
  dotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
