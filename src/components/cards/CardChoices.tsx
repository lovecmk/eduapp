import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay } from '../../theme/tokens';
import type { LearningCard } from '../../domain/models/LearningCard';
import { CARD_CHOICE_TEXT_SIZE, CARD_CHOICE_LINE_HEIGHT, cardChoiceLabel } from './cardPresentation';

/** 상세·채점 불가 카드에서도 서버의 보기를 읽을 수 있게 표시한다. */
export function CardChoices({ card }: { card: LearningCard }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  if (card.type === 'ox' || !card.choices?.length) return null;
  return (
    <View accessibilityLabel="보기" style={{ gap: 10 }}>
      {card.choices.map((choice, index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingVertical: 13, paddingHorizontal: 14 }}>
          <Text style={{ color: c.primary, fontSize: CARD_CHOICE_TEXT_SIZE * fs, lineHeight: CARD_CHOICE_LINE_HEIGHT * fs, fontFamily: fontDisplay }}>{cardChoiceLabel(card.format, index)}</Text>
          <Text style={{ flex: 1, color: c.textPrimary, fontSize: CARD_CHOICE_TEXT_SIZE * fs, lineHeight: CARD_CHOICE_LINE_HEIGHT * fs, fontFamily: fontBody }}>{choice}</Text>
        </View>
      ))}
    </View>
  );
}
