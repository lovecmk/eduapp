import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { BridgeLogo } from '../../src/components/ui/BridgeLogo';
import { useTheme } from '../../src/theme/ThemeProvider';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function FindPwScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();

  const onSend = () => {
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('올바른 이메일 형식이 아닙니다');
      return;
    }
    setEmailError(undefined);
    setSent(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <BridgeLogo size={72} />
            <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontWeight: '800', marginTop: 12 }}>비밀번호 찾기</Text>
          </View>

          {!sent ? (
            <>
              <TextField label="가입한 이메일" value={email} onChangeText={setEmail} placeholder="이메일을 입력하세요" autoCapitalize="none" keyboardType="email-address"
                status={emailError ? 'error' : 'default'} helperText={emailError} />
              <View style={{ marginTop: 8 }}>
                <Button label="인증 메일 보내기" variant="filled" onPress={onSend} />
              </View>
            </>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: c.textSecondary, fontSize: 14 * fs, lineHeight: 22, textAlign: 'center', marginBottom: 20 }}>
                {email}로{'\n'}비밀번호 재설정 링크를 보냈어요
              </Text>
              <Button label="로그인으로 돌아가기" variant="filled" onPress={() => router.back()} />
            </View>
          )}

          <View style={{ marginTop: 10 }}>
            <Button label="뒤로 가기" variant="outline" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}