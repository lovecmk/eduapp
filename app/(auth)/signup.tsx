import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { BridgeLogo } from '../../src/components/ui/BridgeLogo';
import { useTheme } from '../../src/theme/ThemeProvider';
import { ROUTES } from '../../src/constants/routes';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; pw?: string }>({});

  const onSubmit = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = '이름을 입력해주세요';
    if (!EMAIL_RE.test(email.trim())) next.email = '올바른 이메일 형식이 아닙니다';
    if (pw.length < 4) next.pw = '비밀번호는 4자 이상이어야 합니다';
    setErrors(next);
    if (Object.keys(next).length === 0) router.replace(ROUTES.home as any);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <BridgeLogo size={72} />
            <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontWeight: '800', marginTop: 12 }}>회원가입</Text>
          </View>

          <TextField label="이름" value={name} onChangeText={setName} placeholder="이름을 입력하세요"
            status={errors.name ? 'error' : 'default'} helperText={errors.name} />
          <TextField label="이메일" value={email} onChangeText={setEmail} placeholder="이메일을 입력하세요" autoCapitalize="none" keyboardType="email-address"
            status={errors.email ? 'error' : 'default'} helperText={errors.email} />
          <TextField label="비밀번호" value={pw} onChangeText={setPw} secureTextEntry placeholder="비밀번호를 입력하세요"
            status={errors.pw ? 'error' : 'default'} helperText={errors.pw} />

          <View style={{ marginTop: 8 }}>
            <Button label="가입 완료" variant="filled" onPress={onSubmit} />
          </View>
          <View style={{ marginTop: 10 }}>
            <Button label="뒤로 가기" variant="outline" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}