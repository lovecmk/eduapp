import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay } from '../../theme/tokens';
import { QuestionImage } from '../ui/QuestionImage';
import { CARD_TEXT_SIZE, CARD_TEXT_LINE_HEIGHT } from './cardPresentation';
import { resolveCardImage, hasCardImage } from '../../data/cardImages';
import type { LearningCard } from '../../domain/models/LearningCard';

/** 프로세스 체인 문자열을 단계로 분리("→" 또는 원문자 기준). */
function splitSteps(text: string): string[] {
  return text
    .split(/\u2192|\r?\n/)
    .map((s) => s.replace(/^\s*(?:[①-⑳]|\d+[.)\u3001\uff0e])\s*/, '').trim())
    .filter(Boolean);
}

function BackSection({ title, icon, color, backgroundColor, children }: React.PropsWithChildren<{
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  backgroundColor: string;
}>) {
  const { fontScale: fs } = useTheme();
  return (
    <View style={{ alignSelf: 'stretch', backgroundColor, borderRadius: 12, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon} size={16 * fs} color={color} />
        <Text accessibilityRole="header" style={{ color, fontSize: CARD_TEXT_SIZE * fs, lineHeight: CARD_TEXT_LINE_HEIGHT * fs, fontFamily: fontDisplay, flexShrink: 1 }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

/**
 * 학습카드 뒷면(구조화 해설) 공통 렌더러.
 * 해설(conclusion/answer) → 상세설명(principle) → 진행 프로세스 → 화재 3요소 → 개선 권고 → 관리 기록 순으로 표출.
 * 학습(cards)·복습(review)·상세(content)에서 동일한 형태로 재사용한다.
 */
export function CardBackBody({ card }: { card: LearningCard }) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const bodyStyle = { color: c.textPrimary, fontSize: CARD_TEXT_SIZE * fs, lineHeight: CARD_TEXT_LINE_HEIGHT * fs, fontFamily: fontBody };
  const process = card.process?.trim() ?? '';
  const steps = /^(?:null|undefined|n\/a|해당\s*없음)$/i.test(process) ? [] : splitSteps(process);
  // 키워드는 React key 로 쓰인다 — 같은 값이 두 번 들어오면 key 가 겹쳐 경고가 뜨고
  // 목록이 어긋난다. 원본(엑셀)에서 같은 태그를 두 번 적는 일은 드물지 않다.
  const keywords = [...new Set(card.keywords)];

  return (
    <View style={{ gap: 16 }}>
      {/* 뒷면 미디어(해설 도해/사진) */}
      {hasCardImage(card.answerImageUrl) && (
        <QuestionImage source={resolveCardImage(card.answerImageUrl)} height={170} alt={`${card.title} 해설 사진`} />
      )}

      {/* 해설(핵심 결론) */}
      {!!card.conclusion.trim() && (
        <BackSection title="해설" icon="bulb-outline" color={c.warning} backgroundColor={c.warning + '12'}>
          <Text style={bodyStyle}>{card.conclusion}</Text>
        </BackSection>
      )}

      {/* 상세설명 */}
      {!!card.principle.trim() && (
        <BackSection title="상세설명" icon="bulb-outline" color={c.primary} backgroundColor={c.surfaceAlt}>
          <Text style={bodyStyle}>{card.principle}</Text>
        </BackSection>
      )}

      {/* 진행 프로세스 */}
      <BackSection title="화재·폭발 진행 프로세스" icon="flame-outline" color={c.warning} backgroundColor={c.warning + '12'}>
        {steps.length > 0
          ? steps.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ width: 22 * fs, height: 22 * fs, borderRadius: 11 * fs, backgroundColor: c.warning, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: CARD_TEXT_SIZE * fs, lineHeight: CARD_TEXT_LINE_HEIGHT * fs, fontFamily: fontDisplay }}>{i + 1}</Text>
              </View>
              <Text style={[bodyStyle, { flex: 1 }]}>{s}</Text>
            </View>
          ))
          : <Text style={bodyStyle}>해당 없음</Text>}
      </BackSection>

      {/* 화재의 3요소 */}
      {!!card.fireTriangle?.trim() && (
        <BackSection title="화재 3요소" icon="warning-outline" color={c.primary} backgroundColor={c.primary + '12'}>
          <Text style={bodyStyle}>{card.fireTriangle}</Text>
        </BackSection>
      )}

      {/* 위험개선 권고사항 — Windows 검수/문제 수정 화면의 뒷면5와 같은 값 */}
      {!!card.improvement?.trim() && (
        <BackSection title="위험개선권고사항" icon="shield-checkmark-outline" color={c.success} backgroundColor={c.success + '12'}>
          <Text style={bodyStyle}>{card.improvement}</Text>
        </BackSection>
      )}

      {/* 키워드 */}
      {keywords.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {keywords.map((k) => (
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
          <Text style={{ color: c.textSecondary, fontSize: 11 * fs, lineHeight: 16 * fs, fontFamily: fontBody, flex: 1 }}>
            {card.source}
          </Text>
        </View>
      )}

      {!!card.note && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <Ionicons name="information-circle-outline" size={13} color={c.textSecondary} style={{ marginTop: 2 }} />
          <Text style={{ color: c.textSecondary, fontSize: 11 * fs, lineHeight: 16 * fs, fontFamily: fontBody, flex: 1 }}>
            {card.note}
          </Text>
        </View>
      )}
    </View>
  );
}
