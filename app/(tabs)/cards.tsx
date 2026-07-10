import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Animated, PanResponder, Dimensions } from 'react-native';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useCardStore } from '../../src/store/cardStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { Button } from '../../src/components/ui/Button';
import { Badge } from '../../src/components/ui/Badge';
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { fontCute } from '../../src/theme/tokens';
import { ROUTES } from '../../src/constants/routes';
import { getCategoryIcon } from '../../src/constants/categories';

const SWIPE_THRESHOLD = 100;
const { width: SCREEN_W } = Dimensions.get('window');

export default function CardsScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const { entities, allIds, loading, error, fetchAll, markCard } = useCardStore();

  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [exiting, setExiting] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const keepScreenOn = useSettingsStore((s) => s.keepScreenOn);
  const toggleKeepScreenOn = useSettingsStore((s) => s.toggleKeepScreenOn);

  const translateX = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;

  const hapticTriggered = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 10 && !exiting,
      onPanResponderMove: (_, g) => {
        translateX.setValue(g.dx);
        rotate.setValue(Math.max(-0.4, Math.min(0.4, g.dx / 250)));
        if (Math.abs(g.dx) > SWIPE_THRESHOLD && !hapticTriggered.current && Platform.OS !== 'web') {
          hapticTriggered.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        if (Math.abs(g.dx) <= SWIPE_THRESHOLD) hapticTriggered.current = false;
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) completeSwipe('right');
        else if (g.dx < -SWIPE_THRESHOLD) completeSwipe('left');
        else resetPosition();
        hapticTriggered.current = false;
      },
    })
  ).current;

  const fireHaptic = () => {
    if (Platform.OS === 'web') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const completeSwipe = (dir: 'left' | 'right') => {
    if (!card || exiting || finished) return;
    setExiting(true);
    fireHaptic();

    const targetX = dir === 'right' ? SCREEN_W + 100 : -SCREEN_W - 100;
    Animated.parallel([
      Animated.timing(translateX, { toValue: targetX, duration: 250, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      markCard(card.id, dir === 'right' ? 'mastered' : 'learning');
      setDoneCount((n) => n + 1);
      setFlipped(false);
      setExiting(false);
      translateX.setValue(0);
      rotate.setValue(0);
      cardOpacity.setValue(1);
      const nextIdx = index + 1;
      if (nextIdx >= cards.length) {
        setFinished(true);
      } else {
        setIndex(nextIdx);
      }
    });
  };

  const resetPosition = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
    Animated.spring(rotate, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
  };

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (!finished) return;
    Animated.timing(progressAnim, { toValue: 1, duration: 2000, useNativeDriver: false }).start(({ finished: ok }) => {
      if (ok) router.replace(ROUTES.stats as any);
    });
  }, [finished]);

  const cards = allIds.map((id) => entities[id]).filter(Boolean);
  const card = cards[index];
  const rotation = rotate.interpolate({ inputRange: [-0.4, 0, 0.4], outputRange: ['-10deg', '0deg', '10deg'] });

  const restart = () => { setIndex(0); setDoneCount(0); setFlipped(false); setFinished(false); progressAnim.setValue(0); };

  if (loading && cards.length === 0 && !error) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <SkeletonLoader count={3} />
      </View>
    );
  }

  if (error && cards.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ErrorState message="학습 카드를 불러올 수 없어요" onRetry={fetchAll} />
      </View>
    );
  }

  if (!card || finished) {
    const barWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 52, marginBottom: 12 }}>🎉</Text>
        <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontWeight: '800', fontFamily: fontCute }}>학습 완료!</Text>
        <Text style={{ color: c.textSecondary, marginTop: 6, marginBottom: 28, fontFamily: fontCute }}>{doneCount}개 카드 학습 완료</Text>
        <View style={{ width: '60%', height: 4, backgroundColor: c.surfaceAlt, borderRadius: 2, overflow: 'hidden', marginBottom: 24 }}>
          <Animated.View style={{ width: barWidth, height: '100%', backgroundColor: c.primary, borderRadius: 2 }} />
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontCute }}>통계 화면으로 이동 중...</Text>
        <View style={{ marginTop: 20 }}>
          <Button label="다시 학습하기" variant="outline" onPress={restart} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {keepScreenOn && (
        <Pressable onPress={toggleKeepScreenOn} style={{ position: 'absolute', top: 0, right: 20, zIndex: 20, padding: 4 }}>
          <Ionicons name="lock-closed" size={16} color={c.textSecondary} />
        </Pressable>
      )}

      <Animated.View style={{ flex: 1, padding: 20, paddingBottom: 8 }} {...panResponder.panHandlers}>
        <Animated.View
          style={{
            flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
            borderRadius: 20, padding: 24,
            transform: [{ translateX }, { rotate: rotation }], opacity: cardOpacity,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)', elevation: 4,
          }}
        >
          <Pressable onPress={() => { if (exiting) return; setFlipped((f) => !f); }} style={{ flex: 1 }}>
            {!flipped ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Badge label={card.category} />
                  <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontCute }}>{index + 1}/{cards.length}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={getCategoryIcon(card.category)} size={48 * fs} color={c.primary} style={{ marginBottom: 12, opacity: 0.6 }} />
                  <Text style={{ color: c.textPrimary, fontSize: 20 * fs, fontWeight: '700', lineHeight: 30, textAlign: 'center', fontFamily: fontCute }}>
                    {card.question}
                  </Text>
                  <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 16 }}>탭하여 정답 확인</Text>
                </View>
              </>
            ) : (
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                  <Ionicons name="checkmark-circle" size={22} color={c.success} style={{ marginRight: 8 }} />
                  <Text style={{ color: c.primary, fontSize: 18 * fs, fontWeight: '800', flex: 1, fontFamily: fontCute }}>{card.answer}</Text>
                </View>
                {card.highlights?.map((h, i) => (
                  <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
                    <Text style={{ color: c.primary, fontSize: 13 * fs, marginRight: 6 }}>•</Text>
                    <Text style={{ color: c.textPrimary, fontSize: 13 * fs, lineHeight: 19, flex: 1 }}>{h}</Text>
                  </View>
                ))}
                <Text style={{ color: c.textSecondary, fontSize: 13 * fs, lineHeight: 20, marginTop: 8, flex: 1 }}>{card.explanation}</Text>
                {(card.standards?.length ?? 0) > 0 && (
                  <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 12, marginTop: 8 }}>
                    <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontWeight: '700', marginBottom: 6 }}>관련 기준</Text>
                    {card.standards?.map((s, i) => (
                      <Text key={i} style={{ color: c.textSecondary, fontSize: 12 * fs, lineHeight: 18 }}>{s}</Text>
                    ))}
                  </View>
                )}
              </View>
            )}
          </Pressable>
        </Animated.View>
      </Animated.View>

      {flipped && (
        <View style={{
          flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 32,
          paddingVertical: 14, paddingBottom: 24, borderTopWidth: 1, borderTopColor: c.border,
        }}>
          <Pressable onPress={() => { fireHaptic(); completeSwipe('left'); }}
            style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(255,59,48,0.3)', elevation: 5 }}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontCute }}>{index + 1} / {cards.length}</Text>
          <Pressable onPress={() => { fireHaptic(); completeSwipe('right'); }}
            style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#34C759', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(52,199,89,0.3)', elevation: 5 }}>
            <Ionicons name="checkmark" size={28} color="#fff" />
          </Pressable>
        </View>
      )}
    </View>
  );
}
