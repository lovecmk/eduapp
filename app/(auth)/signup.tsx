import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { AvailabilityField, type CheckState } from '../../src/components/auth/AvailabilityField';
import { BridgeLogo } from '../../src/components/ui/BridgeLogo';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuthStore } from '../../src/store/authStore';
import { authRepository } from '../../src/data/repositories';
import { fontBody, fontDisplay } from '../../src/theme/tokens';
import { ROUTES } from '../../src/constants/routes';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9가-힣_]{2,20}$/;
const NICKNAME_RE = /^[a-zA-Z0-9가-힣_]{2,12}$/;

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
  // 이메일 인증코드(데모) — 실서버 연동 시 발송/검증을 API로 대체.
  const [sentCode, setSentCode] = useState<string | null>(null);
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
    if (sentCode || emailVerified) { setSentCode(null); setEmailVerified(false); setCodeInput(''); setCodeError(null); }
  };

  const sendCode = () => {
    if (!EMAIL_RE.test(email.trim())) { setErrors((e) => ({ ...e, email: '올바른 이메일 형식이 아닙니다' })); return; }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setSentCode(code);
    setCodeInput('');
    setCodeError(null);
    setEmailVerified(false);
  };

  const verifyCode = () => {
    if (codeInput.trim() === sentCode) { setEmailVerified(true); setCodeError(null); }
    else setCodeError('인증코드가 일치하지 않습니다');
  };

  const validateUsername = (v: string) =>
    USERNAME_RE.test(v.trim()) ? null : '아이디는 2~20자(한글/영문/숫자)로 입력하세요';
  const validateNickname = (v: string) =>
    NICKNAME_RE.test(v.trim()) ? null : '닉네임은 2~12자(한글/영문/숫자)로 입력하세요';

  const onSubmit = async () => {
    setFormHint(null);
    const next: Errors = {};
    if (!name.trim()) next.name = '이름을 입력해주세요';
    if (!EMAIL_RE.test(email.trim())) next.email = '올바른 이메일 형식이 아닙니다';
    if (pw.length < 4) next.pw = '비밀번호는 4자 이상이어야 합니다';
    if (pw !== pw2) next.pw2 = '비밀번호가 일치하지 않습니다';
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
    if (ok) router.replace(ROUTES.home);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, maxWidth: 480, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <BridgeLogo size={64} />
            <Text style={{ color: c.textPrimary, fontSize: 22 * fs, marginTop: 12, fontFamily: fontDisplay }}>회원가입</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 6, fontFamily: fontBody }}>현장학습 계정을 만들어 안전학습을 시작하세요</Text>
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
              <Pressable onPress={sendCode}
                style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.primary + '14', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Ionicons name="mail-outline" size={14} color={c.primary} />
                <Text style={{ color: c.primary, fontSize: 12.5 * fs, fontFamily: fontDisplay }}>{sentCode ? '인증코드 재발송' : '인증코드 발송'}</Text>
              </Pressable>
              {sentCode && (
                <>
                  {/* 데모: 실제 메일 발송 대신 코드를 화면에 노출(실서버 연동 시 제거). */}
                  <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody, marginTop: 6 }}>
                    데모용 인증코드: <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{sentCode}</Text> · 실서버에선 이메일로 발송돼요
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6 }}>
                    <View style={{ flex: 1 }}>
                      <TextField label="인증코드" value={codeInput} onChangeText={(t) => { setCodeInput(t); setCodeError(null); }} placeholder="6자리 코드" keyboardType="number-pad"
                        status={codeError ? 'error' : 'default'} helperText={codeError ?? undefined} />
                    </View>
                    <Pressable onPress={verifyCode}
                      style={{ marginTop: 28, backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 13 }}>
                      <Text style={{ color: '#fff', fontSize: 13 * fs, fontFamily: fontDisplay }}>확인</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          )}

          <TextField label="소속 (선택)" value={org} onChangeText={setOrg} placeholder="예) 안전관리본부" />
          <TextField label="비밀번호" value={pw} onChangeText={(t) => { setPw(t); clearField('pw'); }} secureTextEntry placeholder="4자 이상"
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
