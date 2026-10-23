import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontCute, fontDisplay, fontBody } from '../../theme/tokens';
import type { LearningCard } from '../../domain/models/LearningCard';
import { CARD_CHOICE_TEXT_SIZE, CARD_CHOICE_LINE_HEIGHT } from './cardPresentation';

const CIRCLED = ['①', '②', '③', '④', '⑤'];

/**
 * 퀴즈형 카드의 앞면 정답 선택 UI — OX / 객관식.
 * 앞면에서 보기를 선택하면 즉시 정답 여부를 표시하고(정답=통통 튀는 강조, 오답=좌우 흔들림),
 * 피드백을 확인한 뒤 사용자가 카드를 탭하면 해설로 뒤집는다.
 */
export function CardQuiz({
  card,
  pick,
  revealed,
  onPick,
}: {
  card: LearningCard;
  pick: number | null;
  revealed: boolean;
  onPick: (i: number) => void;
}) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const choices = card.choices ?? [];
  const answer = card.answerIndex ?? 0;
  const isOX = card.type === 'ox';
  const isCorrect = pick === answer;
  const labelFor = (i: number) => card.format === '선택비교형' ? String.fromCharCode(65 + i) : (CIRCLED[i] ?? String(i + 1));

  // 정답/오답 이펙트 애니메이션.
  const shake = useRef(new Animated.Value(0)).current; // 오답 시 좌우 흔들림
  const pop = useRef(new Animated.Value(0)).current;    // 피드백 배지 통통 등장

  useEffect(() => {
    if (!revealed) {
      shake.setValue(0);
      pop.setValue(0);
      return;
    }
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 4, tension: 80 }).start();
    if (!isCorrect) {
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0.6, duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -0.6, duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const shakeX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] });
  const popScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  // 보기별 상태 색: 미공개=선택 강조, 공개=정답 초록/오답 빨강.
  const borderFor = (i: number) => {
    if (!revealed) return pick === i ? c.primary : c.border;
    if (i === answer) return c.success;
    if (i === pick) return c.error;
    return c.border;
  };
  const bgFor = (i: number) => {
    if (!revealed) return pick === i ? c.primary + '12' : c.surface;
    if (i === answer) return c.success + '14';
    if (i === pick) return c.error + '12';
    return c.surface;
  };
  const markFor = (i: number): keyof typeof Ionicons.glyphMap | null => {
    if (!revealed) return null;
    if (i === answer) return 'checkmark-circle';
    if (i === pick) return 'close-circle';
    return null;
  };
  const markColor = (i: number) => (i === answer ? c.success : c.error);

  return (
    <Animated.View style={{ width: '100%', transform: [{ translateX: shakeX }] }}>
      {isOX ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {choices.map((_, i) => (
            <Pressable accessibilityRole="button"
              accessibilityLabel={i === 0 ? 'O' : 'X'}
              accessibilityState={{ disabled: revealed, selected: pick === i }}
              key={i}
              disabled={revealed}
              // 카드 앞면 전체가 '탭하여 뒤집기' Pressable 이라, 웹에서는 보기 선택 클릭이
              // 부모로 전파돼 "문제를 먼저 풀어주세요" 안내와 겹친다. 전파를 차단한다.
              onPress={(e) => { (e as unknown as { stopPropagation?: () => void })?.stopPropagation?.(); onPick(i); }}
              style={{
                // 기존 높이(너비 / 1.4)의 절반. 좁은 화면에서도 최소 터치 높이는 유지한다.
                flex: 1, aspectRatio: 2.8, minHeight: 44, borderRadius: 14, borderWidth: 1.5,
                borderColor: borderFor(i), backgroundColor: bgFor(i),
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons
                name={i === 0 ? 'ellipse-outline' : 'close'}
                size={30 * fs}
                color={revealed ? (i === answer ? c.success : i === pick ? c.error : c.textSecondary) : c.textPrimary}
              />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {choices.map((label, i) => {
            const mark = markFor(i);
            return (
              <Pressable accessibilityRole="button"
                key={i}
                disabled={revealed}
                onPress={(e) => { (e as unknown as { stopPropagation?: () => void })?.stopPropagation?.(); onPick(i); }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  borderRadius: 14, borderWidth: 1.5, borderColor: borderFor(i), backgroundColor: bgFor(i),
                  paddingVertical: 13, paddingHorizontal: 14,
                }}
              >
                <Text style={{ color: revealed && i === answer ? c.success : c.primary, fontSize: 16 * fs, fontFamily: fontDisplay }}>{labelFor(i)}</Text>
                <Text style={{ color: c.textPrimary, fontSize: CARD_CHOICE_TEXT_SIZE * fs, lineHeight: CARD_CHOICE_LINE_HEIGHT * fs, flex: 1, fontFamily: fontCute }}>{label}</Text>
                {mark && <Ionicons name={mark} size={20} color={markColor(i)} />}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 정답 피드백 */}
      {revealed && (
        <Animated.View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, justifyContent: 'center',
            transform: [{ scale: popScale }],
          }}
        >
          <Ionicons name={isCorrect ? 'happy' : 'sad'} size={20} color={isCorrect ? c.success : c.error} />
          <Text style={{ color: isCorrect ? c.success : c.error, fontSize: 15 * fs, fontFamily: fontDisplay }}>
            {isCorrect ? '정답이에요! 🎉' : `아쉬워요 — 정답은 ${isOX ? choices[answer] : labelFor(answer)}`}
          </Text>
        </Animated.View>
      )}
      {revealed && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8 }}>
          <Ionicons name="hand-left-outline" size={13} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 12 * fs, textAlign: 'center', fontFamily: fontBody }}>
            카드를 탭하면 해설을 볼 수 있어요
          </Text>
        </View>
      )}
    </Animated.View>
  );
}
