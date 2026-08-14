import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay } from '../../theme/tokens';
import { CenterModal } from '../ui/CenterModal';
import { TextField } from '../ui/TextField';
import { Button } from '../ui/Button';
import { ALL_CATEGORIES, CATEGORY_COLOR } from '../../constants/categories';
import { textLength, INPUT_LIMITS } from '../../utils/sanitize';
import { cleanQuestionDraft, useAskQuestion } from '../../hooks/useQna';
import { useSafeTimeout } from '../../hooks/useSafeTimeout';
import type { CardCategory } from '../../domain/models/LearningCard';

/** 질문 작성 모달 — 제목 + 내용 + 분야 선택. */
export function QuestionComposeModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const ask = useAskQuestion();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<CardCategory | undefined>();
  const [error, setError] = useState<string | null>(null);

  const { run } = useSafeTimeout();

  const reset = () => { setTitle(''); setBody(''); setCategory(undefined); setError(null); };
  const handleClose = () => { onClose(); run(reset, 200); };

  const draft = cleanQuestionDraft({ title, body, category });
  const canSubmit = !!draft && !ask.isPending;
  const submit = () => {
    if (!draft || ask.isPending) return;
    setError(null);
    // 등록은 서버가 id 를 줘야 상세로 넘어갈 수 있다 — 응답을 기다린다.
    // 실패하면 모달을 닫지 않는다. 닫아 버리면 사용자가 방금 쓴 글이 사라진다.
    ask.mutate(draft, {
      onSuccess: (created) => { onCreated?.(created.id); handleClose(); },
      onError: () => setError('질문을 올리지 못했어요. 잠시 후 다시 시도해주세요.'),
    });
  };

  return (
    <CenterModal visible={visible} onClose={handleClose} title="질문하기" icon="help-circle-outline">
      <Text style={[styles.label, { color: c.textPrimary }]}>분야 (선택)</Text>
      <View style={styles.chips}>
        {ALL_CATEGORIES.map((cat) => {
          const active = category === cat;
          const color = CATEGORY_COLOR[cat];
          return (
            <Pressable accessibilityRole="button" key={cat} onPress={() => setCategory(active ? undefined : cat)}
              style={[styles.chip, { backgroundColor: active ? color + '1A' : c.surfaceAlt, borderColor: active ? color : c.border }]}>
              <Text style={{ color: active ? color : c.textSecondary, fontSize: 12, fontFamily: fontDisplay }}>{cat}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: 18 }}>
        <TextField label="제목" value={title} onChangeText={setTitle} placeholder="무엇이 궁금하신가요?" maxLength={80} helperText={`${textLength(title)}/80`} />
      </View>
      <TextField
        label="내용" value={body} onChangeText={setBody}
        placeholder="상황을 구체적으로 적어주시면 좋은 답변을 받을 수 있어요"
        multiline numberOfLines={4} maxLength={INPUT_LIMITS.supportMessage + 50}
        style={styles.textarea as never} helperText={`${textLength(body)}/${INPUT_LIMITS.supportMessage}`}
      />
      {error && (
        <Text style={{ color: c.error, fontSize: 12.5, fontFamily: fontDisplay, marginBottom: 8 }}>{error}</Text>
      )}
      <Button
        label={ask.isPending ? '올리는 중...' : '질문 올리기'}
        disabled={!canSubmit}
        onPress={submit}
        style={{ width: '100%', marginTop: 4 }}
      />
    </CenterModal>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontFamily: fontDisplay, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  textarea: { height: 100, paddingTop: 12, textAlignVertical: 'top' },
});
