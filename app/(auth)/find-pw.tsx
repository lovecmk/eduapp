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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = { username?: string; email?: string; pw?: string; pw2?: string };

export default function FindPwScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { resetPassword, loading, error: authError, clearError } = useAuthStore();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState(false);

  const clearField = (key: keyof Errors) => {
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (authError) clearError();
  };

  const onSubmit = async () => {
    const next: Errors = {};
    if (!username.trim()) next.username = '아이디를 입력해주세요';
    if (!EMAIL_RE.test(email.trim())) next.email = '올바른 이메일 형식이 아닙니다';
    if (pw.length < 4) next.pw = '비밀번호는 4자 이상이어야 합니다';
    if (pw !== pw2) next.pw2 = '비밀번호가 일치하지 않습니다';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const ok = await resetPassword(username.trim(), email.trim(), pw);
    if (ok) setDone(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <BridgeLogo size={64} />
            <Text style={{ color: c.textPrimary, fontSize: 22 * fs, marginTop: 12, fontFamily: fontDisplay }}>비밀번호 재설정</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 6, fontFamily: fontBody, textAlign: 'center' }}>가입 시 등록한 아이디와 이메일을 확인해 새 비밀번호를 설정해요</Text>
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
                <Button label="로그인하러 가기" variant="filled" onPress={() => router.back()} />
              </View>
            </View>
          ) : (
            <>
              <TextField label="아이디" value={username} onChangeText={(t) => { setUsername(t); clearField('username'); }} placeholder="가입한 아이디" autoCapitalize="none"
                status={errors.username ? 'error' : 'default'} helperText={errors.username} />
              <TextField label="가입 이메일" value={email} onChangeText={(t) => { setEmail(t); clearField('email'); }} placeholder="가입한 이메일" autoCapitalize="none" keyboardType="email-address"
                status={errors.email ? 'error' : 'default'} helperText={errors.email} />
              <TextField label="새 비밀번호" value={pw} onChangeText={(t) => { setPw(t); clearField('pw'); }} secureTextEntry placeholder="4자 이상"
                status={errors.pw ? 'error' : 'default'} helperText={errors.pw} />
              <TextField label="새 비밀번호 확인" value={pw2} onChangeText={(t) => { setPw2(t); clearField('pw2'); }} secureTextEntry placeholder="새 비밀번호를 다시 입력하세요"
                status={errors.pw2 ? 'error' : 'default'} helperText={errors.pw2 ?? authError ?? undefined} />

              <View style={{ marginTop: 8 }}>
                <Button label="비밀번호 재설정" variant="filled" loading={loading} onPress={onSubmit} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 }}>
                <Ionicons name="arrow-back" size={14} color={c.textSecondary} />
                <Text onPress={() => router.back()} style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>로그인으로 돌아가기</Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
