// 아이디/닉네임 중복확인 입력 필드 — 라벨 + 입력 + '중복확인' 버튼 + 상태 메시지.
// 회원가입·내 정보 수정에서 공통으로 재사용한다.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay, fontCute } from '../../theme/tokens';
import { useIsMounted } from '../../hooks/useSafeTimeout';

export type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

interface Props extends Omit<TextInputProps, 'onChangeText' | 'value'> {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  /** 형식 검증 — 문제가 있으면 에러 메시지, 없으면 null. */
  validate: (v: string) => string | null;
  /** true = 이미 사용 중(중복). */
  checkTaken: (v: string) => Promise<boolean>;
  /** 상태가 바뀔 때 부모에 알림(제출 게이트용). */
  onStateChange?: (state: CheckState) => void;
  /** 중복확인 통과 시 안내 문구. */
  availableText?: string;
  /** 중복(이미 사용 중) 시 안내 문구. */
  takenText?: string;
}

export function AvailabilityField({
  label,
  value,
  onChangeText,
  validate,
  checkTaken,
  onStateChange,
  availableText = '사용 가능합니다',
  takenText = '이미 사용 중입니다',
  ...inputProps
}: Props) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const [state, setState] = useState<CheckState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const request = useRef(0);
  const checking = useRef(false);
  const latestValue = useRef(value);
  const alive = useIsMounted();

  const update = (next: CheckState, msg: string | null) => {
    setState(next);
    setMessage(msg);
    onStateChange?.(next);
  };

  const handleChange = (t: string) => {
    request.current++;
    checking.current = false;
    latestValue.current = t;
    onChangeText(t);
    // 값이 바뀌면 이전 확인 결과는 무효 — 다시 확인하도록 초기화.
    if (state !== 'idle') update('idle', null);
  };

  const onCheck = async () => {
    if (checking.current) return;
    const err = validate(value);
    if (err) {
      update('invalid', err);
      return;
    }
    update('checking', null);
    checking.current = true;
    const ticket = ++request.current;
    try {
      const taken = await checkTaken(value.trim());
      if (!alive() || ticket !== request.current) return;
      update(taken ? 'taken' : 'available', taken ? takenText : availableText);
    } catch {
      if (!alive() || ticket !== request.current) return;
      update('invalid', '확인 중 오류가 발생했어요. 다시 시도해주세요');
    } finally {
      if (ticket === request.current) checking.current = false;
    }
  };

  useEffect(() => {
    if (latestValue.current === value) return;
    latestValue.current = value;
    request.current++;
    checking.current = false;
    update('idle', null);
  }, [value]);

  const borderColor =
    state === 'available' ? c.success : state === 'taken' || state === 'invalid' ? c.error : c.border;
  const msgColor = state === 'available' ? c.success : c.error;
  const canCheck = value.trim().length > 0 && state !== 'checking';

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.label, { color: c.textPrimary, fontSize: 13 * fs, fontFamily: fontDisplay }]}>{label}</Text>
      {/* 좁은 화면(320px 등)에서도 '중복확인'이 화면 밖으로 밀리지 않도록:
          입력창은 minWidth:0 으로 줄어들 수 있게 하고(flex 기본값 min-width:auto 가
          입력창을 콘텐츠 폭 아래로 못 줄여 버튼을 밀어냈다), 버튼은 flexShrink:0 으로 지킨다. */}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch' }}>
        <TextInput
          {...inputProps}
          // 보이는 라벨은 별개의 <Text> 라 스크린리더가 입력과 묶어 주지 않는다.
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          value={value}
          onChangeText={handleChange}
          placeholderTextColor={c.textSecondary}
          style={[styles.input, { borderColor, backgroundColor: c.surface, color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontBody }]}
        />
        <Pressable accessibilityRole="button"
          onPress={onCheck}
          disabled={!canCheck}
          style={{
            paddingHorizontal: 14,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: canCheck ? c.primary : c.surfaceAlt,
            borderWidth: 1,
            borderColor: canCheck ? c.primary : c.border,
            minWidth: 76,
            flexShrink: 0,
          }}
        >
          {state === 'checking' ? (
            <ActivityIndicator size="small" color={canCheck ? '#fff' : c.textSecondary} />
          ) : (
            <Text style={{ color: canCheck ? '#fff' : c.textSecondary, fontSize: 13 * fs, fontWeight: '700', fontFamily: fontCute }}>중복확인</Text>
          )}
        </Pressable>
      </View>
      {message && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <Ionicons
            name={state === 'available' ? 'checkmark-circle' : 'alert-circle'}
            size={13}
            color={msgColor}
          />
          <Text style={{ color: msgColor, fontSize: 12 * fs, fontFamily: fontBody }}>{message}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '600', marginBottom: 6 },
  input: { flex: 1, minWidth: 0, height: 50, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14 },
});
