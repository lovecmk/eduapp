import React, { useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { fontCute } from '../../src/theme/tokens';
import { getCategoryIcon } from '../../src/constants/categories';
import { getDifficultyMeta } from '../../src/constants/difficulty';
import { ROUTES } from '../../src/constants/routes';
import { useAllCards } from '../../src/hooks/useCards';

const statusLabel: Record<string, string> = { new: '새 카드', learning: '학습 중', mastered: '마스터' };

export default function ContentDetailScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: allCards = [], refetch } = useAllCards();
  const card = allCards.find((c) => c.id === id);

  useEffect(() => { if (!card) refetch(); }, [card, refetch]);

  if (!card) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScreenHeader title="컨텐츠 상세" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.textSecondary, fontFamily: fontCute }}>카드를 찾을 수 없어요</Text>
        </View>
      </View>
    );
  }

  const diff = getDifficultyMeta(theme, card.difficulty);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="컨텐츠 상세" />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Ionicons name={getCategoryIcon(card.category)} size={26} color={c.primary} />
          <Badge label={card.category} />
          <Text style={{ color: diff.color, fontSize: 12, fontWeight: '700', fontFamily: fontCute }}>{diff.label}</Text>
          <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '600', fontFamily: fontCute }}>{statusLabel[card.status]}</Text>
          </View>
        </View>

        <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <Ionicons name="help-circle" size={16} color={c.primary} />
            <Text style={{ color: c.primary, fontSize: 12, fontWeight: '700', fontFamily: fontCute }}>질문</Text>
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontWeight: '800', lineHeight: 25, fontFamily: fontCute }}>{card.question}</Text>
        </View>

        <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <Ionicons name="checkmark-circle" size={16} color={c.success} />
            <Text style={{ color: c.success, fontSize: 12, fontWeight: '700', fontFamily: fontCute }}>정답</Text>
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 15 * fs, lineHeight: 22, fontWeight: '600', fontFamily: fontCute }}>{card.answer}</Text>
        </View>

        {card.highlights && card.highlights.length > 0 && (
          <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <Ionicons name="bulb" size={16} color={c.warning} />
              <Text style={{ color: c.primary, fontSize: 12, fontWeight: '700', fontFamily: fontCute }}>핵심 포인트</Text>
            </View>
            {card.highlights.map((h, i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
                <Text style={{ color: c.primary, fontSize: 13, marginRight: 6 }}>•</Text>
                <Text style={{ color: c.textPrimary, fontSize: 13 * fs, lineHeight: 19, flex: 1 }}>{h}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <Ionicons name="document-text" size={16} color={c.textSecondary} />
            <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '700', fontFamily: fontCute }}>상세 설명</Text>
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 14 * fs, lineHeight: 21 }}>{card.explanation}</Text>
        </View>

        {card.standards && card.standards.length > 0 && (
          <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <Ionicons name="shield-checkmark" size={16} color={c.textSecondary} />
              <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '700', fontFamily: fontCute }}>관련 규정/기준</Text>
            </View>
            {card.standards.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
                <Text style={{ color: c.textSecondary, fontSize: 13, marginRight: 6 }}>•</Text>
                <Text style={{ color: c.textPrimary, fontSize: 13 * fs, lineHeight: 19, flex: 1 }}>{s}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 32, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
        <Button label="이 카드 학습하기" variant="filled" onPress={() => router.push(ROUTES.cards)} />
      </View>
    </View>
  );
}
