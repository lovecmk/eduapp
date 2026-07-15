import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontCute, fontDisplay, fontBody } from '../../theme/tokens';
import type { LearningCard } from '../../domain/models/LearningCard';

const CIRCLED = ['①', '②', '③', '④', '⑤'];

/**
 * 퀴즈형 카드의 앞면 정답 선택 UI — OX / 객관식.
 * 앞면에서 보기를 선택하면 즉시 정답 여부를 표시하고, 뒤집어 해설을 볼 수 있다.
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
    <View style={{ width: '100%' }}>
      {isOX ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {choices.map((label, i) => (
            <Pressable
              key={i}
              disabled={revealed}
              onPress={() => onPick(i)}
              style={{
                flex: 1, aspectRatio: 1.4, borderRadius: 18, borderWidth: 2,
                borderColor: borderFor(i), backgroundColor: bgFor(i),
                alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              <Ionicons
                name={i === 0 ? 'ellipse-outline' : 'close'}
                size={44 * fs}
                color={revealed ? (i === answer ? c.success : i === pick ? c.error : c.textSecondary) : c.textPrimary}
              />
              <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontDisplay }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {choices.map((label, i) => {
            const mark = markFor(i);
            return (
              <Pressable
                key={i}
                disabled={revealed}
                onPress={() => onPick(i)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  borderRadius: 14, borderWidth: 1.5, borderColor: borderFor(i), backgroundColor: bgFor(i),
                  paddingVertical: 13, paddingHorizontal: 14,
                }}
              >
                <Text style={{ color: revealed && i === answer ? c.success : c.primary, fontSize: 16 * fs, fontFamily: fontDisplay }}>{CIRCLED[i] ?? i + 1}</Text>
                <Text style={{ color: c.textPrimary, fontSize: 14.5 * fs, lineHeight: 20, flex: 1, fontFamily: fontCute }}>{label}</Text>
                {mark && <Ionicons name={mark} size={20} color={markColor(i)} />}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 정답 피드백 */}
      {revealed && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, justifyContent: 'center' }}>
          <Ionicons name={isCorrect ? 'happy' : 'sad'} size={18} color={isCorrect ? c.success : c.error} />
          <Text style={{ color: isCorrect ? c.success : c.error, fontSize: 14 * fs, fontFamily: fontDisplay }}>
            {isCorrect ? '정답이에요!' : `아쉬워요 — 정답은 ${isOX ? choices[answer] : (CIRCLED[answer] ?? answer + 1)}`}
          </Text>
        </View>
      )}
      {revealed && (
        <Text style={{ color: c.textSecondary, fontSize: 12 * fs, textAlign: 'center', marginTop: 6, fontFamily: fontBody }}>
          카드를 뒤집어 해설을 확인해요
        </Text>
      )}
    </View>
  );
}
