import React, { useEffect, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Pressable, Modal, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { SocialButtonRow } from '../../src/components/ui/SocialButton';
import { BridgeLogo } from '../../src/components/ui/BridgeLogo';
import { useTheme } from '../../src/theme/ThemeProvider';
import { fontMono, fontDisplay, fontBody } from '../../src/theme/tokens';
import { isBiometricAvailable, tryBiometricLogin } from '../../src/data/auth/BiometricAuth';
import { useAuthStore } from '../../src/store/authStore';
import { ROUTES } from '../../src/constants/routes';

function LinkModal({ visible, onClose, title, desc }: { visible: boolean; onClose: () => void; title: string; desc: string }) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: c.surface, borderRadius: 24, padding: 24, marginHorizontal: 32, width: '82%', maxWidth: 340, borderWidth: 1, borderColor: c.border }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.primary + '18', alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Ionicons name="link-outline" size={26} color={c.primary} />
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 17 * fs, textAlign: 'center', marginBottom: 8, fontFamily: fontDisplay }}>{title}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 * fs, textAlign: 'center', lineHeight: 20, marginBottom: 16, fontFamily: fontBody }}>{desc}</Text>
          <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 10, marginBottom: 20, alignItems: 'center' }}>
            <Text style={{ color: c.primary, fontSize: 12, fontWeight: '600', fontFamily: fontMono }}>bridge.kfpa.or.kr</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="취소" variant="outline" onPress={onClose} /></View>
            <View style={{ flex: 1 }}><Button label="이동하기" variant="filled" onPress={() => { Linking.openURL('https://bridge.kfpa.or.kr/'); onClose(); }} /></View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function LoginScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [showFindPw, setShowFindPw] = useState(false);
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
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 6, fontFamily: fontBody }}>건물점검, 매일 3분이면 충분합니다</Text>
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
            <Pressable onPress={() => setShowSignup(true)} hitSlop={8}>
              <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>회원가입</Text>
            </Pressable>
            <View style={{ width: 1, height: 12, backgroundColor: c.border }} />
            <Pressable onPress={() => setShowFindPw(true)} hitSlop={8}>
              <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>비밀번호 찾기</Text>
            </Pressable>
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

          <Text style={{ textAlign: 'center', color: c.textSecondary, fontSize: 11, marginTop: 22, fontFamily: fontBody }}>
            Bridge와 동일한 계정을 사용합니다
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <LinkModal visible={showSignup} onClose={() => setShowSignup(false)} title="회원가입" desc={'회원가입은\n브릿지 웹사이트에서 가능합니다'} />
      <LinkModal visible={showFindPw} onClose={() => setShowFindPw(false)} title="비밀번호 찾기" desc={'비밀번호 변경은\n브릿지 웹사이트에서 가능합니다'} />
    </SafeAreaView>
  );
}
