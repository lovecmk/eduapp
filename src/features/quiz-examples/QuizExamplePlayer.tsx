import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay } from '../../theme/tokens';
import { answerSummary, gradeQuiz, initialQuizState, QUIZ_INSTRUCTION, quizReducer, responseIsComplete, type QuizAction, type QuizExample } from './quiz';

/** Isolated player: no learning store, repository, timers or network writes. */
export function QuizExamplePlayer({ quiz }: { quiz: QuizExample }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const [state, setState] = useState(() => initialQuizState(quiz));
  const act = (action: QuizAction) => setState(current => quizReducer(quiz, current, action));
  const complete = responseIsComplete(quiz, state.response);
  const result = state.submitted ? gradeQuiz(quiz, state.response) : null;
  const optionText = (id: string) => quiz.kind !== 'matching' ? quiz.options.find(item => item.id === id)?.text ?? '' : '';
  const pairedText = (left: string) => quiz.kind === 'matching' ? quiz.right.find(item => item.id === state.response.pairs.find(pair => pair[0] === left)?.[1])?.text : undefined;

  function option(label: string, onPress: () => void, settings: { selected?: boolean; disabled?: boolean; checkbox?: boolean; hint?: string; accessibilityLabel?: string; allowAfterSubmit?: boolean } = {}) {
    const disabled = (!settings.allowAfterSubmit && state.submitted) || !!settings.disabled;
    return (
      <Pressable onPress={onPress} disabled={disabled} accessibilityRole={settings.checkbox ? 'checkbox' : 'button'}
        accessibilityLabel={settings.accessibilityLabel ?? label}
        accessibilityHint={settings.hint}
        accessibilityState={{ disabled, ...(settings.checkbox ? { checked: !!settings.selected } : settings.selected !== undefined ? { selected: settings.selected } : {}) }}
        aria-checked={settings.checkbox ? !!settings.selected : undefined}
        aria-selected={!settings.checkbox ? settings.selected : undefined}
        style={[styles.option, { backgroundColor: settings.selected ? c.primary + '14' : c.surface, borderColor: settings.selected ? c.primary : c.border, opacity: disabled ? 0.7 : 1 }]}>
        <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontBody }}>
          {settings.checkbox ? (settings.selected ? '☑ ' : '☐ ') : ''}{label}
        </Text>
        {settings.hint ? <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontBody, marginTop: 6 }}>{settings.hint}</Text> : null}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]} testID="quiz-example-player">
      <Text style={{ color: c.textPrimary, fontSize: 20 * fs, fontFamily: fontDisplay }}>{quiz.title}</Text>
      <Text style={{ color: c.textPrimary, fontSize: 16 * fs, fontFamily: fontBody, lineHeight: 25 * fs }}>{quiz.question}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody, lineHeight: 21 * fs }}>{QUIZ_INSTRUCTION[quiz.kind]}</Text>

      {quiz.kind === 'multiple' && <View style={styles.options}>
        {quiz.options.map(item => <View key={item.id}>{option(item.text, () => act({ type: 'toggle', id: item.id }), { checkbox: true, selected: state.response.ids.includes(item.id) })}</View>)}
      </View>}

      {quiz.kind === 'ordering' && <>
        <View style={styles.options} accessibilityLabel="선택한 순서" accessibilityLiveRegion="polite">
          {!state.response.ids.length && <Text style={{ color: c.textSecondary, fontSize: 13 * fs }}>아래 보기를 첫 단계부터 눌러 주세요.</Text>}
          {state.response.ids.map((id, index) => <View key={id}>
            {option(`${index + 1}. ${optionText(id)}${state.submitted ? '' : ' ×'}`, () => act({ type: 'toggle', id }), { selected: true, accessibilityLabel: `${index + 1}번 ${optionText(id)} 선택 취소` })}
          </View>)}
        </View>
        <View style={styles.options} accessibilityLabel="순서 보기">
          {quiz.options.map(item => <View key={item.id}>{option(item.text, () => act({ type: 'toggle', id: item.id }), { disabled: state.response.ids.includes(item.id) })}</View>)}
        </View>
      </>}

      {quiz.kind === 'matching' && <>
        <View style={styles.matching}>
          <View style={styles.column} accessibilityLabel="연결할 용어">
            {quiz.left.map(item => <View key={item.id}>{option(item.text, () => act({ type: 'left', id: item.id }), { selected: state.activeLeft === item.id, hint: pairedText(item.id) ?? '설명 선택 전' })}</View>)}
          </View>
          <View style={styles.column} accessibilityLabel="연결할 설명">
            {quiz.right.map(item => <View key={item.id}>{option(item.text, () => act({ type: 'pair', id: item.id }))}</View>)}
          </View>
        </View>
        <Text accessibilityLiveRegion="polite" style={{ color: c.textSecondary, fontSize: 13 * fs }}>{state.response.pairs.length} / {quiz.left.length}쌍 연결</Text>
      </>}

      {state.submitted && <View accessibilityLiveRegion="polite" testID="quiz-example-feedback" style={[styles.feedback, { borderColor: result === 'correct' ? c.success : c.error }]}>
        <Text style={{ color: result === 'correct' ? c.success : c.error, fontSize: 17 * fs, fontFamily: fontDisplay }}>{result === 'correct' ? '정답입니다!' : '다시 확인해 보세요.'}</Text>
        <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontBody, lineHeight: 23 * fs }}>정답{'\n'}{answerSummary(quiz)}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 14 * fs, fontFamily: fontBody, lineHeight: 23 * fs }}>{quiz.explanation}</Text>
      </View>}

      <View style={styles.options}>
        <Pressable onPress={() => act({ type: 'submit' })} disabled={state.submitted || !complete} accessibilityRole="button" accessibilityLabel="정답 확인"
          accessibilityState={{ disabled: state.submitted || !complete }} style={[styles.submit, { backgroundColor: c.primary, opacity: state.submitted || !complete ? 0.45 : 1 }]}>
          <Text style={{ color: '#fff', fontSize: 15 * fs, fontFamily: fontDisplay }}>정답 확인</Text>
        </Pressable>
        {option('처음부터 풀기', () => act({ type: 'reset' }), { allowAfterSubmit: true })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 16 },
  option: { borderWidth: 1.5, borderRadius: 12, minHeight: 48, padding: 12, justifyContent: 'center' },
  options: { gap: 10 },
  matching: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  column: { flex: 1, minWidth: 0, gap: 10 },
  feedback: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 12 },
  submit: { minHeight: 48, borderRadius: 12, padding: 12, alignItems: 'center', justifyContent: 'center' },
});
