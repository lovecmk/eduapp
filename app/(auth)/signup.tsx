import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { AvailabilityField, type CheckState } from '../../src/components/auth/AvailabilityField';
import { AppLogo } from '../../src/components/ui/AppLogo';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuthStore } from '../../src/store/authStore';
import { authRepository } from '../../src/data/repositories';
import { fontBody, fontDisplay } from '../../src/theme/tokens';
import { ROUTES } from '../../src/constants/routes';

import {
  validateUsername as ruleUsername,
  validateNickname as ruleNickname,
  validateEmail as ruleEmail,
  validateName as ruleName,
  validatePassword as rulePassword,
  validatePasswordConfirm as rulePasswordConfirm,
  PASSWORD_PLACEHOLDER,
} from '../../src/domain/validation/auth';
import { APP_NAME } from '../../src/constants/brand';

type Errors = { name?: string; email?: string; pw?: string; pw2?: string };

export default function SignupScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { register, loading, error: authError, clearError } = useAuthStore();

  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [org, setOrg] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [usernameState, setUsernameState] = useState<CheckState>('idle');
  const [nicknameState, setNicknameState] = useState<CheckState>('idle');
  const [formHint, setFormHint] = useState<string | null>(null);
  // 이메일 인증 — 코드 생성/비교는 저장소(실서버) 책임. 화면은 '발송됨/검증됨' 상태만 갖는다.
  // (데모 모드에서만 devPreviewCode 를 받아 화면에 노출한다.)
  const [codeSent, setCodeSent] = useState(false);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const clearField = (key: keyof Errors) => {
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (authError) clearError();
  };

  const onEmailChange = (t: string) => {
    setEmail(t);
    clearField('email');
    // 이메일을 바꾸면 이전 인증은 무효화.
    if (codeSent || emailVerified) { setCodeSent(false); setPreviewCode(null); setEmailVerified(false); setCodeInput(''); setCodeError(null); }
  };

  const sendCode = async () => {
    const emailError = ruleEmail(email);
    if (emailError) { setErrors((e) => ({ ...e, email: emailError })); return; }
    if (codeBusy) return; // 중복 발송 방지
    setCodeBusy(true);
    try {
      const { devPreviewCode } = await authRepository.requestEmailCode(email.trim());
      setCodeSent(true);
      setPreviewCode(devPreviewCode ?? null);
      setCodeInput('');
      setCodeError(null);
      setEmailVerified(false);
    } catch {
      setCodeError('인증코드 발송에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setCodeBusy(false);
    }
  };

  const verifyCode = async () => {
    if (codeBusy) return; // 중복 검증 방지
    setCodeBusy(true);
    try {
      const ok = await authRepository.verifyEmailCode(email.trim(), codeInput);
      if (ok) { setEmailVerified(true); setCodeError(null); }
      else setCodeError('인증코드가 일치하지 않습니다');
    } catch {
      setCodeError('인증 확인에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setCodeBusy(false);
    }
  };

  const validateUsername = (v: string) => ruleUsername(v);
  const validateNickname = (v: string) => ruleNickname(v);

  const onSubmit = async () => {
    setFormHint(null);
    const next: Errors = {};
    // 검증 규칙은 src/domain/validation/auth.ts 단일 소스를 사용(백엔드와 동일 규칙).
    const nameError = ruleName(name);
    const emailError = ruleEmail(email);
    const pwError = rulePassword(pw);
    const pw2Error = rulePasswordConfirm(pw, pw2);
    if (nameError) next.name = nameError;
    if (emailError) next.email = emailError;
    if (pwError) next.pw = pwError;
    if (pw2Error) next.pw2 = pw2Error;
    setErrors(next);

    if (usernameState !== 'available') {
      setFormHint('아이디 중복확인을 완료해주세요');
      return;
    }
    if (nicknameState !== 'available') {
      setFormHint('닉네임 중복확인을 완료해주세요');
      return;
    }
    if (!emailVerified) {
      setFormHint('이메일 인증을 완료해주세요');
      return;
    }
    if (Object.keys(next).length > 0) return;

    const ok = await register({
      username: username.trim(),
      password: pw,
      name: name.trim(),
      nickname: nickname.trim(),
      email: email.trim(),
      org: org.trim(),
    });
    // 가입 성공 → 홈으로 진입. 진영(팀) 선택은 홈 진입 시점에 유도한다(홈에서 faction==null 이면 자동 안내).
    if (ok) router.replace(ROUTES.home);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, maxWidth: 480, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <AppLogo size={64} />
            <Text style={{ color: c.textPrimary, fontSize: 22 * fs, marginTop: 12, fontFamily: fontDisplay }}>회원가입</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 6, fontFamily: fontBody }}>{APP_NAME} 계정을 만들어 안전학습을 시작하세요</Text>
          </View>

          <AvailabilityField
            label="아이디"
            value={username}
            onChangeText={setUsername}
            placeholder="로그인에 사용할 아이디"
            autoCapitalize="none"
            validate={validateUsername}
            checkTaken={(v) => authRepository.isUsernameTaken(v)}
            onStateChange={setUsernameState}
            availableText="사용 가능한 아이디입니다"
            takenText="이미 사용 중인 아이디입니다"
          />
          <AvailabilityField
            label="닉네임"
            value={nickname}
            onChangeText={setNickname}
            placeholder="커뮤니티에 표시될 별명"
            autoCapitalize="none"
            validate={validateNickname}
            checkTaken={(v) => authRepository.isNicknameTaken(v)}
            onStateChange={setNicknameState}
            availableText="사용 가능한 닉네임입니다"
            takenText="이미 사용 중인 닉네임입니다"
          />
          <TextField label="이름" value={name} onChangeText={(t) => { setName(t); clearField('name'); }} placeholder="이름을 입력하세요"
            status={errors.name ? 'error' : 'default'} helperText={errors.name} />
          <TextField label="이메일" value={email} onChangeText={onEmailChange} placeholder="이메일을 입력하세요" autoCapitalize="none" keyboardType="email-address"
            editable={!emailVerified}
            status={errors.email ? 'error' : 'default'} helperText={errors.email} />

          {/* 이메일 인증 */}
          {emailVerified ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4, marginBottom: 12 }}>
              <Ionicons name="checkmark-circle" size={16} color={c.success} />
              <Text style={{ color: c.success, fontSize: 12.5 * fs, fontFamily: fontBody }}>이메일 인증이 완료되었어요</Text>
            </View>
          ) : (
            <View style={{ marginTop: -4, marginBottom: 12 }}>
              <Pressable onPress={sendCode} disabled={codeBusy}
                style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.primary + '14', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, opacity: codeBusy ? 0.6 : 1 }}>
                <Ionicons name="mail-outline" size={14} color={c.primary} />
                <Text style={{ color: c.primary, fontSize: 12.5 * fs, fontFamily: fontDisplay }}>{codeSent ? '인증코드 재발송' : '인증코드 발송'}</Text>
              </Pressable>
              {codeSent && (
                <>
                  {/* 데모(목업) 모드에서만 코드가 화면에 보인다. 실서버 응답에는 코드가 없어 이 줄은 사라진다. */}
                  {previewCode ? (
                    <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody, marginTop: 6 }}>
                      데모용 인증코드: <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{previewCode}</Text> · 실서버에선 이메일로 발송돼요
                    </Text>
                  ) : (
                    <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody, marginTop: 6 }}>
                      입력하신 이메일로 인증코드를 보냈어요 (5분 내 입력)
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6 }}>
                    <View style={{ flex: 1 }}>
                      <TextField label="인증코드" value={codeInput} onChangeText={(t) => { setCodeInput(t); setCodeError(null); }} placeholder="6자리 코드" keyboardType="number-pad"
                        status={codeError ? 'error' : 'default'} helperText={codeError ?? undefined} />
                    </View>
                    <Pressable onPress={verifyCode} disabled={codeBusy}
                      style={{ marginTop: 28, backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 13, opacity: codeBusy ? 0.6 : 1 }}>
                      <Text style={{ color: '#fff', fontSize: 13 * fs, fontFamily: fontDisplay }}>확인</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          )}

          <TextField label="소속 (선택)" value={org} onChangeText={setOrg} placeholder="예) 안전관리본부" />
          <TextField label="비밀번호" value={pw} onChangeText={(t) => { setPw(t); clearField('pw'); }} secureTextEntry placeholder={PASSWORD_PLACEHOLDER}
            status={errors.pw ? 'error' : 'default'} helperText={errors.pw} />
          <TextField label="비밀번호 확인" value={pw2} onChangeText={(t) => { setPw2(t); clearField('pw2'); }} secureTextEntry placeholder="비밀번호를 다시 입력하세요"
            status={errors.pw2 ? 'error' : 'default'} helperText={errors.pw2 ?? authError ?? formHint ?? undefined} />

          <View style={{ marginTop: 8 }}>
            <Button label="가입 완료" variant="filled" loading={loading} onPress={onSubmit} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 }}>
            <Ionicons name="arrow-back" size={14} color={c.textSecondary} />
            <Text onPress={() => router.back()} style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>로그인으로 돌아가기</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
