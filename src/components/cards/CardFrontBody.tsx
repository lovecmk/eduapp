import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay } from '../../theme/tokens';
import type { LearningCard } from '../../domain/models/LearningCard';
import { CardSectionChip } from './CardSectionChip';
import { CARD_FRONT_TEXT_SIZE, CARD_FRONT_LINE_HEIGHT } from './cardPresentation';

/** 퀴즈·설명형 및 복습 상세가 같은 칩/본문 정렬을 사용한다. */
export function CardFrontBody({ card }: { card: LearningCard }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const textStyle = { fontSize: CARD_FRONT_TEXT_SIZE * fs, lineHeight: CARD_FRONT_LINE_HEIGHT * fs, fontFamily: fontDisplay };
  return (
    <View style={{ alignSelf: 'stretch', gap: 16 }}>
      {!!card.situation?.trim() && (
        <View style={{ gap: 8 }}>
          <CardSectionChip label="상황설명" color={c.textSecondary} />
          <Text style={[textStyle, { color: c.textPrimary }]}>{card.situation}</Text>
        </View>
      )}
      <View style={{ gap: 8 }}>
        <CardSectionChip label="질문" color={c.primary} />
        <Text style={[textStyle, { color: c.primary }]}>{card.question}</Text>
      </View>
    </View>
  );
}
