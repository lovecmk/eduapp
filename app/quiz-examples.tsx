import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { QuizExamplePlayer } from '../src/features/quiz-examples/QuizExamplePlayer';
import { QUIZ_EXAMPLES } from '../src/features/quiz-examples/examples';
import { QUIZ_KIND_LABEL } from '../src/features/quiz-examples/quiz';
import { useTheme } from '../src/theme/ThemeProvider';
import { contentColumn } from '../src/theme/layout';
import { fontBody, fontDisplay } from '../src/theme/tokens';

export default function QuizExamplesScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const [selected, setSelected] = useState(QUIZ_EXAMPLES[0]!);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="문제 유형 예시" />
      <ScrollView contentContainerStyle={[contentColumn, styles.content]}>
        <Text style={{ color: c.textSecondary, fontSize: 14 * fs, fontFamily: fontBody, lineHeight: 23 * fs }}>
          예시 체험입니다. 운영 카드에 등록되거나 학습기록에 반영되지 않습니다.
        </Text>
        <View style={styles.types} accessibilityLabel="예시 문제 유형">
          {QUIZ_EXAMPLES.map(quiz => <Pressable key={quiz.id} onPress={() => setSelected(quiz)} accessibilityRole="button"
            accessibilityLabel={QUIZ_KIND_LABEL[quiz.kind]} accessibilityState={{ selected: selected.id === quiz.id }}
            style={[styles.type, { borderColor: selected.id === quiz.id ? c.primary : c.border, backgroundColor: selected.id === quiz.id ? c.primary + '14' : c.surface }]}>
            <Text style={{ color: selected.id === quiz.id ? c.primary : c.textPrimary, fontSize: 14 * fs, fontFamily: fontDisplay }}>{QUIZ_KIND_LABEL[quiz.kind]}</Text>
          </Pressable>)}
        </View>
        <QuizExamplePlayer key={selected.id} quiz={selected} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 32 },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5, borderRadius: 12, justifyContent: 'center' },
});
