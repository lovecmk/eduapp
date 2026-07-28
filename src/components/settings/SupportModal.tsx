import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontCute } from '../../theme/tokens';
import { CenterModal } from '../ui/CenterModal';
import { TextField } from '../ui/TextField';
import { Button } from '../ui/Button';
import { delay } from '../../data/repositories/_delay';
import { isMeaningful, textLength, INPUT_LIMITS } from '../../utils/sanitize';
import { useSafeTimeout, useIsMounted } from '../../hooks/useSafeTimeout';

const CATEGORIES = ['학습 오류', '결제/멤버십', '계정 문제', '기능 제안', '기타'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Phase = 'form' | 'sending' | 'done';

/** 고객센터 문의 폼 — 카테고리 선택 + 이메일/내용 검증 + 전송 시뮬레이션. */
export function SupportModal({
  visible,
  onClose,
  defaultEmail,
}: {
  visible: boolean;
  onClose: () => void;
  defaultEmail?: string;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('학습 오류');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const { run } = useSafeTimeout();
  const alive = useIsMounted();

  const emailValid = EMAIL_RE.test(email.trim()) && email.trim().length <= INPUT_LIMITS.email;
  const messageValid = isMeaningful(message, 10);
  const canSubmit = emailValid && messageValid && phase === 'form';

  const reset = () => {
    setCategory('학습 오류');
    setEmail(defaultEmail ?? '');
    setMessage('');
    setTouched(false);
    setPhase('form');
  };

  const handleClose = () => {
    onClose();
    // 닫힘 애니메이션 이후 상태 초기화
    run(reset, 200);
  };

  const submit = async () => {
    setTouched(true);
    if (!canSubmit) return;
    setPhase('sending');
    await delay(900); // 실제 전송 지연 시뮬레이션
    if (!alive()) return; // 전송 중 화면을 떠났다면 상태를 건드리지 않는다
    setPhase('done');
  };

  return (
    <CenterModal visible={visible} onClose={handleClose} title="고객센터 문의" icon="chatbubble-ellipses-outline">
      {phase === 'done' ? (
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <View style={[styles.successCircle, { backgroundColor: c.success + '1A' }]}>
            <Ionicons name="checkmark-circle" size={44} color={c.success} />
          </View>
          <Text style={[styles.doneTitle, { color: c.textPrimary }]}>문의가 접수되었어요</Text>
          <Text style={[styles.doneDesc, { color: c.textSecondary }]}>
            영업일 기준 24시간 이내에{'\n'}{email.trim()} 으로 답변드릴게요.
          </Text>
          <Button label="확인" onPress={handleClose} style={{ width: '100%', marginTop: 20 }} />
        </View>
      ) : (
        <>
          <Text style={[styles.fieldLabel, { color: c.textPrimary }]}>문의 유형</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((cat) => {
              const active = cat === category;
              return (
                <Pressable accessibilityRole="button"
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? c.primary : c.surfaceAlt,
                      borderColor: active ? c.primary : c.border,
                    },
                  ]}
                >
                  <Text style={{ color: active ? c.textOnPrimary : c.textSecondary, fontSize: 12, fontWeight: '700', fontFamily: fontCute }}>
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: 18 }}>
            <TextField
              label="답변받을 이메일"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              maxLength={INPUT_LIMITS.email}
              status={touched && !emailValid ? 'error' : 'default'}
              helperText={touched && !emailValid ? '올바른 이메일 주소를 입력하세요' : undefined}
            />
          </View>

          <TextField
            label="문의 내용"
            value={message}
            onChangeText={setMessage}
            placeholder="문제 상황을 자세히 적어주세요 (최소 10자)"
            multiline
            numberOfLines={4}
            maxLength={INPUT_LIMITS.supportMessage + 50}
            style={styles.textarea as never}
            status={touched && !messageValid ? 'error' : 'default'}
            helperText={
              touched && !messageValid
                ? '의미 있는 내용을 10자 이상 입력해주세요'
                : `${textLength(message)}/${INPUT_LIMITS.supportMessage}`
            }
          />

          <Button
            label={phase === 'sending' ? '' : '문의 보내기'}
            loading={phase === 'sending'}
            disabled={!canSubmit}
            onPress={submit}
            style={{ width: '100%', marginTop: 4 }}
          />
        </>
      )}
    </CenterModal>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 10, fontFamily: fontCute },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  textarea: { height: 100, paddingTop: 12, textAlignVertical: 'top' },
  successCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  doneTitle: { fontSize: 18, fontWeight: '800', fontFamily: fontCute, marginBottom: 8 },
  doneDesc: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
