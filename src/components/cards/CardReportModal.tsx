import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody } from '../../theme/tokens';
import { CenterModal } from '../ui/CenterModal';
import { TextField } from '../ui/TextField';
import { Button } from '../ui/Button';
import { delay } from '../../data/repositories/_delay';
import { useReportStore, REPORT_REASON_LABEL, type ReportReason } from '../../store/reportStore';
import type { LearningCard } from '../../domain/models/LearningCard';

const REASONS = Object.keys(REPORT_REASON_LABEL) as ReportReason[];
type Phase = 'form' | 'sending' | 'done';

/** 카드 내용 수정 요청(이의제기) 모달 — 사유 선택 + 간단한 설명. */
export function CardReportModal({ visible, card, onClose }: { visible: boolean; card: LearningCard | null; onClose: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const submit = useReportStore((s) => s.submit);
  const [reason, setReason] = useState<ReportReason>('wrong_answer');
  const [detail, setDetail] = useState('');
  const [phase, setPhase] = useState<Phase>('form');

  const reset = () => { setReason('wrong_answer'); setDetail(''); setPhase('form'); };
  const handleClose = () => { onClose(); setTimeout(reset, 200); };

  const send = async () => {
    if (!card) return;
    setPhase('sending');
    await delay(800);
    submit({ cardId: card.id, reason, detail: detail.trim() });
    setPhase('done');
  };

  return (
    <CenterModal visible={visible} onClose={handleClose} title="내용 수정 요청" icon="flag-outline">
      {phase === 'done' ? (
        <View style={{ alignItems: 'center', paddingVertical: 10 }}>
          <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: c.success + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Ionicons name="checkmark-circle" size={40} color={c.success} />
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 17, fontFamily: fontDisplay, marginBottom: 8 }}>요청이 접수되었어요</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 20, fontFamily: fontBody }}>
            검토 후 콘텐츠에 반영할게요.{'\n'}더 나은 학습을 위해 감사합니다 🙏
          </Text>
          <Button label="확인" onPress={handleClose} style={{ width: '100%', marginTop: 20 }} />
        </View>
      ) : (
        <>
          {card && (
            <View style={[styles.cardPreview, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 3, fontFamily: fontBody }}>{card.category} · {card.subCategory}</Text>
              <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 13, lineHeight: 18, fontFamily: fontDisplay }}>{card.question}</Text>
            </View>
          )}

          <Text style={[styles.label, { color: c.textPrimary }]}>어떤 점이 문제인가요?</Text>
          <View style={styles.chips}>
            {REASONS.map((r) => {
              const active = r === reason;
              return (
                <Pressable key={r} onPress={() => setReason(r)}
                  style={[styles.chip, { backgroundColor: active ? c.primary : c.surfaceAlt, borderColor: active ? c.primary : c.border }]}>
                  <Text style={{ color: active ? c.textOnPrimary : c.textSecondary, fontSize: 12, fontFamily: fontDisplay }}>{REPORT_REASON_LABEL[r]}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: 18 }}>
            <TextField
              label="상세 내용 (선택)"
              value={detail}
              onChangeText={setDetail}
              placeholder="예: 정답이 0.5MPa가 아니라 0.17MPa 아닌가요?"
              multiline
              numberOfLines={3}
              style={styles.textarea as never}
            />
          </View>

          <Button label={phase === 'sending' ? '' : '수정 요청 보내기'} loading={phase === 'sending'} onPress={send} style={{ width: '100%', marginTop: 4 }} />
        </>
      )}
    </CenterModal>
  );
}

const styles = StyleSheet.create({
  cardPreview: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 18 },
  label: { fontSize: 13, fontFamily: fontDisplay, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  textarea: { height: 80, paddingTop: 12, textAlignVertical: 'top' },
});
