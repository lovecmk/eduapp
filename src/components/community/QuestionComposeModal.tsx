import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay } from '../../theme/tokens';
import { CenterModal } from '../ui/CenterModal';
import { TextField } from '../ui/TextField';
import { Button } from '../ui/Button';
import { ALL_CATEGORIES, CATEGORY_COLOR } from '../../constants/categories';
import { isMeaningful, textLength, INPUT_LIMITS } from '../../utils/sanitize';
import { useQnaStore } from '../../store/qnaStore';
import { useAuthStore } from '../../store/authStore';
import type { CardCategory } from '../../domain/models/LearningCard';

/** 질문 작성 모달 — 제목 + 내용 + 분야 선택. */
export function QuestionComposeModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const addQuestion = useQnaStore((s) => s.addQuestion);
  const author = useAuthStore((s) => s.user?.name) ?? '나';
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<CardCategory | undefined>();

  const reset = () => { setTitle(''); setBody(''); setCategory(undefined); };
  const handleClose = () => { onClose(); setTimeout(reset, 200); };

  const canSubmit = isMeaningful(title, 4) && isMeaningful(body, 5);
  const submit = () => {
    const id = addQuestion({ title, body, category, author });
    if (id) { onCreated?.(id); handleClose(); }
  };

  return (
    <CenterModal visible={visible} onClose={handleClose} title="질문하기" icon="help-circle-outline">
      <Text style={[styles.label, { color: c.textPrimary }]}>분야 (선택)</Text>
      <View style={styles.chips}>
        {ALL_CATEGORIES.map((cat) => {
          const active = category === cat;
          const color = CATEGORY_COLOR[cat];
          return (
            <Pressable key={cat} onPress={() => setCategory(active ? undefined : cat)}
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
      <Button label="질문 올리기" disabled={!canSubmit} onPress={submit} style={{ width: '100%', marginTop: 4 }} />
    </CenterModal>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontFamily: fontDisplay, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  textarea: { height: 100, paddingTop: 12, textAlignVertical: 'top' },
});
