import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontCute } from '../../theme/tokens';
import { CenterModal } from '../ui/CenterModal';
import { TextField } from '../ui/TextField';
import { Button } from '../ui/Button';
import { supportRepository } from '../../data/repositories';
import { toApiError } from '../../data/network/errors';
import { isMeaningful, textLength, INPUT_LIMITS } from '../../utils/sanitize';
import { useSafeTimeout, useIsMounted } from '../../hooks/useSafeTimeout';

// 사내 학습 서비스라 결제가 없다 — '결제/멤버십'은 없는 것을 묻는 칸이었다.
const CATEGORIES = ['학습 오류', '계정 문제', '멤버십 등급', '기능 제안', '기타'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Phase = 'form' | 'sending' | 'done';

/**
 * 보내지 못한 이유 — 사용자가 다음에 무엇을 해야 하는지로 나눈다.
 *  · offline     : 기다렸다 다시 보내면 된다.
 *  · unavailable : 서버에 문의 창구(라우트)가 아직 없다. 다시 보내도 소용없다.
 *  · other       : 서버가 거절했다 — 서버의 문장을 그대로 보인다.
 */
type Failure = { kind: 'offline' | 'unavailable' | 'other'; message: string };

/** 고객센터 문의 폼 — 카테고리 선택 + 이메일/내용 검증 + 서버 접수(supportRepository). */
export function SupportModal({
  visible,
  onClose,
  defaultEmail,
}: {
  visible: boolean;
  onClose: () => void;
  defaultEmail?: string;
}) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('학습 오류');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [receipt, setReceipt] = useState('');
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
    setFailure(null);
    setReceipt('');
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
    setFailure(null);
    try {
      const res = await supportRepository.submit({ category, email: email.trim(), message });
      if (!alive()) return; // 전송 중 화면을 떠났다면 상태를 건드리지 않는다
      setReceipt(res.id);
      setPhase('done');
    } catch (e) {
      if (!alive()) return;
      const err = toApiError(e);
      // 적은 내용은 지우지 않는다 — 다시 보내거나 다른 곳에 옮겨 적을 수 있어야 한다.
      setPhase('form');
      if (err.kind === 'offline') {
        setFailure({ kind: 'offline', message: '연결이 없어 보내지 못했어요. 연결된 곳에서 다시 보내 주세요.' });
      } else if (err.kind === 'notFound' || err.status === 501) {
        setFailure({
          kind: 'unavailable',
          message: '앱에서 문의를 받는 창구가 아직 열리지 않았어요. 급한 문의는 소속 교육 담당 부서로 직접 연락해 주세요.',
        });
      } else {
        setFailure({ kind: 'other', message: err.userMessage });
      }
    }
  };

  return (
    <CenterModal visible={visible} onClose={handleClose} title="고객센터 문의" icon="chatbubble-ellipses-outline">
      {phase === 'done' ? (
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <View style={[styles.successCircle, { backgroundColor: c.success + '1A' }]}>
            <Ionicons name="checkmark-circle" size={44} color={c.success} />
          </View>
          <Text style={[styles.doneTitle, { color: c.textPrimary }]}>문의가 접수되었어요</Text>
          {/* 답변 기한은 약속하지 않는다 — 앱이 정할 수 있는 값이 아니다. */}
          <Text style={[styles.doneDesc, { color: c.textSecondary }]}>
            확인 후 {email.trim()} 으로{'\n'}답변드릴게요.
          </Text>
          {receipt ? (
            <Text style={[styles.doneDesc, { color: c.textSecondary, marginTop: 6 }]}>접수 번호 {receipt}</Text>
          ) : null}
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
                  <Text style={{ color: active ? c.textOnPrimary : c.textSecondary, fontSize: 12 * fs, fontWeight: '700', fontFamily: fontCute }}>
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

          {failure && (
            <View
              accessibilityRole="alert"
              style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: c.warning + '14', borderColor: c.warning + '44', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 }}
            >
              <Ionicons name={failure.kind === 'offline' ? 'cloud-offline-outline' : 'alert-circle-outline'} size={16} color={c.warning} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, color: c.textPrimary, fontSize: 12.5 * fs, lineHeight: 18 * fs }}>{failure.message}</Text>
            </View>
          )}

          <Button
            label={phase === 'sending' ? '' : failure?.kind === 'offline' ? '다시 보내기' : '문의 보내기'}
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
