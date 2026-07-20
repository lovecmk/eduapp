import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { BridgeLogo } from '../../src/components/ui/BridgeLogo';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuthStore } from '../../src/store/authStore';
import { fontBody, fontDisplay } from '../../src/theme/tokens';
import { ROUTES } from '../../src/constants/routes';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9가-힣_]{2,20}$/;

type Errors = { username?: string; name?: string; email?: string; pw?: string; pw2?: string };

export default function SignupScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { register, loading, error: authError, clearError } = useAuthStore();

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [org, setOrg] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const clearField = (key: keyof Errors) => {
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (authError) clearError();
  };

  const onSubmit = async () => {
    const next: Errors = {};
    if (!USERNAME_RE.test(username.trim())) next.username = '아이디는 2~20자(한글/영문/숫자)로 입력하세요';
    if (!name.trim()) next.name = '이름을 입력해주세요';
    if (!EMAIL_RE.test(email.trim())) next.email = '올바른 이메일 형식이 아닙니다';
    if (pw.length < 4) next.pw = '비밀번호는 4자 이상이어야 합니다';
    if (pw !== pw2) next.pw2 = '비밀번호가 일치하지 않습니다';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const ok = await register({ username: username.trim(), password: pw, name: name.trim(), email: email.trim(), org: org.trim() });
    if (ok) router.replace(ROUTES.home);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <BridgeLogo size={64} />
            <Text style={{ color: c.textPrimary, fontSize: 22 * fs, marginTop: 12, fontFamily: fontDisplay }}>회원가입</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 6, fontFamily: fontBody }}>현장학습 계정을 만들어 안전학습을 시작하세요</Text>
          </View>

          <TextField label="아이디" value={username} onChangeText={(t) => { setUsername(t); clearField('username'); }} placeholder="로그인에 사용할 아이디" autoCapitalize="none"
            status={errors.username ? 'error' : 'default'} helperText={errors.username} />
          <TextField label="이름" value={name} onChangeText={(t) => { setName(t); clearField('name'); }} placeholder="이름을 입력하세요"
            status={errors.name ? 'error' : 'default'} helperText={errors.name} />
          <TextField label="이메일" value={email} onChangeText={(t) => { setEmail(t); clearField('email'); }} placeholder="이메일을 입력하세요" autoCapitalize="none" keyboardType="email-address"
            status={errors.email ? 'error' : 'default'} helperText={errors.email} />
          <TextField label="소속 (선택)" value={org} onChangeText={setOrg} placeholder="예) 안전관리본부" />
          <TextField label="비밀번호" value={pw} onChangeText={(t) => { setPw(t); clearField('pw'); }} secureTextEntry placeholder="4자 이상"
            status={errors.pw ? 'error' : 'default'} helperText={errors.pw} />
          <TextField label="비밀번호 확인" value={pw2} onChangeText={(t) => { setPw2(t); clearField('pw2'); }} secureTextEntry placeholder="비밀번호를 다시 입력하세요"
            status={errors.pw2 ? 'error' : 'default'} helperText={errors.pw2 ?? authError ?? undefined} />

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
