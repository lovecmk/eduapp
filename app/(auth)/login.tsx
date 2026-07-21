import React, { useEffect, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { SocialButtonRow } from '../../src/components/ui/SocialButton';
import { BridgeLogo } from '../../src/components/ui/BridgeLogo';
import { useTheme } from '../../src/theme/ThemeProvider';
import { fontDisplay, fontBody } from '../../src/theme/tokens';
import { isBiometricAvailable, tryBiometricLogin } from '../../src/data/auth/BiometricAuth';
import { useAuthStore } from '../../src/store/authStore';
import { ROUTES } from '../../src/constants/routes';

export default function LoginScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const { login, loading, error: authError, clearError } = useAuthStore();

  useEffect(() => { isBiometricAvailable().then(setBioAvailable); }, []);

  const onLogin = async () => {
    if (!id.trim() || !pw.trim()) { setFormError('아이디와 비밀번호를 모두 입력해주세요'); return; }
    setFormError(null); clearError();
    const ok = await login(id.trim(), pw);
    if (ok) router.replace(ROUTES.home);
  };

  const onBiometric = async () => {
    const ok = await tryBiometricLogin();
    if (ok) router.replace(ROUTES.home);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 32 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 브랜드 */}
          <View style={{ alignItems: 'center', marginBottom: 36 }}>
            <View style={{
              width: 82, height: 82, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
              alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 30px ${c.primary}22`,
            }}>
              <BridgeLogo size={52} />
            </View>
            <Text style={{ color: c.textPrimary, fontSize: 24 * fs, fontFamily: fontDisplay, marginTop: 18, letterSpacing: 1 }}>현장학습</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 6, fontFamily: fontBody }}>현장 안전학습, 매일 3분이면 충분합니다</Text>
          </View>

          {/* 로그인 */}
          <TextField
            label="아이디"
            value={id}
            onChangeText={(t) => { setId(t); if (formError) setFormError(null); }}
            placeholder="아이디를 입력하세요"
            autoCapitalize="none"
            status={formError ? 'error' : 'default'}
          />
          <TextField
            label="비밀번호"
            value={pw}
            onChangeText={(t) => { setPw(t); if (formError) setFormError(null); }}
            secureTextEntry
            placeholder="비밀번호를 입력하세요"
            status={formError ? 'error' : 'default'}
            helperText={formError ?? authError ?? undefined}
          />

          <Button label="로그인" variant="filled" loading={loading} onPress={onLogin} style={{ marginTop: 4 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 18, gap: 18, alignItems: 'center' }}>
            <Pressable onPress={() => router.push(ROUTES.signup)} hitSlop={8}>
              <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>회원가입</Text>
            </Pressable>
            <View style={{ width: 1, height: 12, backgroundColor: c.border }} />
            <Pressable onPress={() => router.push(ROUTES.findPw)} hitSlop={8}>
              <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>비밀번호 찾기</Text>
            </Pressable>
          </View>

          {/* 데모 계정 안내 — 실서버 연동 전 시연/회의용 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, backgroundColor: c.surfaceAlt, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 }}>
            <Ionicons name="information-circle-outline" size={14} color={c.textSecondary} />
            <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody }}>데모 계정 · 원진섭 / demo1234</Text>
          </View>

          {bioAvailable && (
            <View style={{ marginTop: 16 }}>
              <Button label="생체인증으로 로그인" variant="outline" onPress={onBiometric} />
            </View>
          )}

          {/* 간편 로그인 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 28, marginBottom: 16 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
            <Text style={{ marginHorizontal: 14, color: c.textSecondary, fontSize: 12, fontFamily: fontBody }}>간편 로그인</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
          </View>
          <SocialButtonRow />

          {/* <Text style={{ textAlign: 'center', color: c.textSecondary, fontSize: 11, marginTop: 22, fontFamily: fontBody }}>
            Bridge와 동일한 계정을 사용합니다
          </Text> */}
        </ScrollView>
      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}
