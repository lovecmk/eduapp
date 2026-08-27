import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { QuestionImage } from '../ui/QuestionImage';
import { resolveCardImage, hasCardImage } from '../../data/cardImages';
import type { LearningCard } from '../../domain/models/LearningCard';

/** 프로세스 체인 문자열을 단계로 분리("→" 또는 원문자 기준). */
function splitSteps(text: string): string[] {
  return text
    .split('→')
    .map((s) => s.replace(/^\s*(?:[①-⑳]|\d+\))\s*/, '').trim())
    .filter(Boolean);
}

/**
 * 학습카드 뒷면(구조화 해설) 공통 렌더러.
 * 결론(핵심) → 원리 → 진행 프로세스 → 화재의 3요소 → 출처 순으로 표출.
 * 학습(cards)·복습(review)·상세(content)에서 동일한 형태로 재사용한다.
 */
export function CardBackBody({ card }: { card: LearningCard }) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const steps = card.process ? splitSteps(card.process) : [];

  return (
    <View style={{ gap: 12 }}>
      {/* 뒷면 미디어(해설 도해/사진) */}
      {hasCardImage(card.answerImageUrl) && (
        <QuestionImage source={resolveCardImage(card.answerImageUrl)} height={170} alt={`${card.title} 해설 사진`} />
      )}

      {/* 원리(먼저 근거를 제시하고) */}
      {!!card.principle && (
        <Text style={{ color: c.textPrimary, fontSize: 14.5 * fs, lineHeight: 22, fontFamily: fontBody }}>
          {card.principle}
        </Text>
      )}

      {/* 핵심 결론(그 다음 '따라서 ~' 결론으로 마무리) */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: c.warning + '12', borderRadius: 12, padding: 12 }}>
        <Ionicons name="bulb" size={20} color={c.warning} style={{ marginTop: 1 }} />
        <Text style={{ color: c.textPrimary, fontSize: 15.5 * fs, lineHeight: 24, fontFamily: fontDisplay, flex: 1 }}>
          {card.conclusion}
        </Text>
      </View>

      {/* 진행 프로세스 */}
      {steps.length > 0 && (
        <View style={{ backgroundColor: c.warning + '12', borderRadius: 14, padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 }}>
            <Ionicons name="flame" size={13} color={c.warning} />
            <Text style={{ color: c.warning, fontSize: 11.5, fontFamily: fontDisplay }}>화재·폭발 진행 과정</Text>
          </View>
          {steps.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: i === steps.length - 1 ? 0 : 8 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c.warning, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                <Text style={{ color: '#fff', fontSize: 10, fontFamily: fontMono, fontWeight: '800' }}>{i + 1}</Text>
              </View>
              <Text style={{ color: c.textPrimary, fontSize: 12.5 * fs, lineHeight: 18, fontFamily: fontBody, flex: 1 }}>{s}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 화재의 3요소 */}
      {!!card.fireTriangle && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12 }}>
          <Text style={{ fontSize: 15 }}>🔺</Text>
          <Text style={{ color: c.textPrimary, fontSize: 12.5 * fs, lineHeight: 19, fontFamily: fontBody, flex: 1 }}>
            {card.fireTriangle}
          </Text>
        </View>
      )}

      {/* 키워드 */}
      {card.keywords.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {card.keywords.map((k) => (
            <View key={k} style={{ backgroundColor: c.primary + '12', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: c.primary, fontSize: 11, fontFamily: fontBody }}>#{k}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 출처 */}
      {!!card.source && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2 }}>
          <Ionicons name="document-text-outline" size={12} color={c.textSecondary} style={{ marginTop: 2 }} />
          <Text style={{ color: c.textSecondary, fontSize: 11 * fs, lineHeight: 16, fontFamily: fontBody, flex: 1 }}>
            {card.source}
          </Text>
        </View>
      )}
    </View>
  );
}
