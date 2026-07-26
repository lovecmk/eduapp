import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { AppLogo } from '../../src/components/ui/AppLogo';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuthStore } from '../../src/store/authStore';
import { fontBody, fontDisplay } from '../../src/theme/tokens';
import {
  validatePassword as rulePassword,
  validatePasswordConfirm as rulePasswordConfirm,
  PASSWORD_PLACEHOLDER,
} from '../../src/domain/validation/auth';
import { ROUTES } from '../../src/constants/routes';

type Errors = { identifier?: string; pw?: string; pw2?: string };

export default function FindPwScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { resetPassword, loading, error: authError, clearError } = useAuthStore();

  const [identifier, setIdentifier] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState(false);

  // 비밀번호 재설정을 링크로 바로 열면 돌아갈 화면이 없어 back() 이 먹통이 된다.
  // 그때는 로그인 화면으로 교체 이동해 사용자가 갇히지 않게 한다.
  const goLogin = () => {
    if (router.canGoBack()) router.back();
    else router.replace(ROUTES.login);
  };

  const clearField = (key: keyof Errors) => {
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (authError) clearError();
  };

  const onSubmit = async () => {
    const next: Errors = {};
    // 검증 규칙은 src/domain/validation/auth.ts 단일 소스를 사용(회원가입과 동일).
    if (!identifier.trim()) next.identifier = '아이디 또는 가입 이메일을 입력해주세요';
    const pwError = rulePassword(pw);
    const pw2Error = rulePasswordConfirm(pw, pw2);
    if (pwError) next.pw = pwError;
    if (pw2Error) next.pw2 = pw2Error;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    // 아이디 또는 이메일 중 하나만 맞아도 되도록 동일 식별자를 두 인자에 전달.
    const ok = await resetPassword(identifier.trim(), identifier.trim(), pw);
    if (ok) setDone(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <AppLogo size={64} />
            <Text style={{ color: c.textPrimary, fontSize: 22 * fs, marginTop: 12, fontFamily: fontDisplay }}>비밀번호 재설정</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 6, fontFamily: fontBody, textAlign: 'center' }}>가입한 아이디 또는 이메일을 확인해 새 비밀번호를 설정해요</Text>
          </View>

          {done ? (
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.success + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Ionicons name="checkmark-circle" size={40} color={c.success} />
              </View>
              <Text style={{ color: c.textPrimary, fontSize: 16 * fs, fontFamily: fontDisplay, marginBottom: 8 }}>비밀번호가 변경되었어요</Text>
              <Text style={{ color: c.textSecondary, fontSize: 13 * fs, lineHeight: 20, textAlign: 'center', marginBottom: 24, fontFamily: fontBody }}>
                새 비밀번호로 로그인해주세요
              </Text>
              <View style={{ width: '100%' }}>
                <Button label="로그인하러 가기" variant="filled" onPress={goLogin} />
              </View>
            </View>
          ) : (
            <>
              <TextField label="아이디 또는 가입 이메일" value={identifier} onChangeText={(t) => { setIdentifier(t); clearField('identifier'); }} placeholder="아이디 또는 이메일을 입력하세요" autoCapitalize="none"
                status={errors.identifier ? 'error' : 'default'} helperText={errors.identifier} />
              <TextField label="새 비밀번호" value={pw} onChangeText={(t) => { setPw(t); clearField('pw'); }} secureTextEntry placeholder={PASSWORD_PLACEHOLDER}
                status={errors.pw ? 'error' : 'default'} helperText={errors.pw} />
              <TextField label="새 비밀번호 확인" value={pw2} onChangeText={(t) => { setPw2(t); clearField('pw2'); }} secureTextEntry placeholder="새 비밀번호를 다시 입력하세요"
                status={errors.pw2 ? 'error' : 'default'} helperText={errors.pw2 ?? authError ?? undefined} />

              <View style={{ marginTop: 8 }}>
                <Button label="비밀번호 재설정" variant="filled" loading={loading} onPress={onSubmit} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 }}>
                <Ionicons name="arrow-back" size={14} color={c.textSecondary} />
                <Text onPress={goLogin} style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>로그인으로 돌아가기</Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
