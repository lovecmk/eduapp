import React, { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody } from '../../theme/tokens';
import { CenterModal } from '../ui/CenterModal';
import { TextField } from '../ui/TextField';
import { Button } from '../ui/Button';
import { reportRepository } from '../../data/repositories';
import { useAuthStore } from '../../store/authStore';
import { useReportStore, REPORT_REASON_LABEL, type ReportReason } from '../../store/reportStore';
import { sanitizeText, textLength, INPUT_LIMITS } from '../../utils/sanitize';
import { useSafeTimeout, useIsMounted } from '../../hooks/useSafeTimeout';
import type { LearningCard } from '../../domain/models/LearningCard';

const REASONS = Object.keys(REPORT_REASON_LABEL) as ReportReason[];
type Phase = 'form' | 'sending' | 'done';

/** 카드 내용 수정 요청(이의제기) 모달 — 사유 선택 + 간단한 설명. */
export function CardReportModal({ visible, card, onClose }: { visible: boolean; card: LearningCard | null; onClose: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const submit = useReportStore((s) => s.submit);
  const [reason, setReason] = useState<ReportReason>('wrong_answer');
  const [detail, setDetail] = useState('');
  const sending = useRef(false);
  const [failure, setFailure] = useState('');
  const [queued, setQueued] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');

  const { run } = useSafeTimeout();
  const alive = useIsMounted();

  const reset = () => { setReason('wrong_answer'); setDetail(''); setPhase('form'); setFailure(''); setQueued(false); };
  const handleClose = () => { if (sending.current) return; onClose(); run(reset, 200); };

  const send = async () => {
    const actor = useAuthStore.getState().user?.id;
    if (!card || phase !== 'form' || sending.current || !actor) return;
    const input = { cardId: card.id, reason, detail: sanitizeText(detail, { maxLength: INPUT_LIMITS.reportDetail, allowNewlines: true }) };
    sending.current = true; setPhase('sending'); setFailure('');
    try {
      const result = await reportRepository.submit(input);
      if (useAuthStore.getState().user?.id !== actor) return;
      submit(input);
      if (!alive()) return;
      setQueued(result === 'queued'); setPhase('done');
    } catch {
      if (alive()) { setFailure('신고를 보내지 못했습니다. 다시 시도해주세요.'); setPhase('form'); }
    } finally { sending.current = false; }
  };

  return (
    <CenterModal visible={visible} onClose={handleClose} title="카드 신고 · 내용 수정 요청" icon="flag-outline" position="bottom">
      {phase === 'done' ? (
        <View style={{ alignItems: 'center', paddingVertical: 10 }}>
          <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: c.success + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Ionicons name="checkmark-circle" size={40} color={c.success} />
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontFamily: fontDisplay, marginBottom: 8 }}>{queued ? '신고를 기기에 저장했어요' : '신고가 접수되었어요'}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 * fs, textAlign: 'center', lineHeight: 20 * fs, fontFamily: fontBody }}>
            {queued ? '인터넷에 연결되면 자동으로 보냅니다.' : '배포 관리자가 확인하고 필요한 카드는 다시 검수합니다.'}
          </Text>
          <Button label="확인" onPress={handleClose} style={{ width: '100%', marginTop: 20 }} />
        </View>
      ) : (
        <>
          {card && (
            <View style={[styles.cardPreview, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Text style={{ color: c.textSecondary, fontSize: 11 * fs, marginBottom: 3, fontFamily: fontBody }}>{card.category} · {card.subCategory}</Text>
              <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 13 * fs, lineHeight: 18 * fs, fontFamily: fontDisplay }}>{card.question}</Text>
            </View>
          )}

          <Text style={[styles.label, { color: c.textPrimary }]}>어떤 점이 문제인가요?</Text>
          <View style={styles.chips}>
            {REASONS.map((r) => {
              const active = r === reason;
              return (
                <Pressable accessibilityRole="button" key={r} disabled={phase === 'sending'} onPress={() => setReason(r)}
                  style={[styles.chip, { backgroundColor: active ? c.primary : c.surfaceAlt, borderColor: active ? c.primary : c.border }]}>
                  <Text style={{ color: active ? c.textOnPrimary : c.textSecondary, fontSize: 12 * fs, fontFamily: fontDisplay }}>{REPORT_REASON_LABEL[r]}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: 18 }}>
            <TextField
              label="상세 내용 (선택)"
              editable={phase !== 'sending'}
              value={detail}
              onChangeText={setDetail}
              placeholder="예: 정답이 0.5MPa가 아니라 0.17MPa 아닌가요?"
              multiline
              numberOfLines={3}
              maxLength={INPUT_LIMITS.reportDetail + 20}
              style={styles.textarea as never}
              helperText={`${textLength(detail)}/${INPUT_LIMITS.reportDetail}`}
            />
          </View>

          {!!failure && <Text accessibilityRole="alert" style={{ color: c.textPrimary, fontFamily: fontBody }}>{failure}</Text>}
          <Button label={phase === 'sending' ? '' : '신고 보내기'} loading={phase === 'sending'} onPress={send} style={{ width: '100%', marginTop: 4 }} />
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
