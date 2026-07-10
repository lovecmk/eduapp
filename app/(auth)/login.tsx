import React, { useEffect, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Pressable, Modal, Linking, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { SocialButtonRow } from '../../src/components/ui/SocialButton';
import { BridgeLogo } from '../../src/components/ui/BridgeLogo';
import { BrandWordmark } from '../../src/components/ui/BrandWordmark';
import { useTheme } from '../../src/theme/ThemeProvider';
import { fontMono, fontCute } from '../../src/theme/tokens';
import { isBiometricAvailable, tryBiometricLogin } from '../../src/data/auth/BiometricAuth';
import { useAuthStore } from '../../src/store/authStore';
import { ROUTES } from '../../src/constants/routes';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_SIZE = 8;
const GRID_ICONS = ['flame', 'school', 'shield-checkmark', 'trending-up', 'trophy', 'calendar', 'stats-chart', 'bulb',
  'heart', 'star', 'leaf', 'rocket', 'medal', 'notifications', 'book', 'refresh',
] as const;

export default function LoginScreen() {
  const { theme, fontScale } = useTheme();
  const fs = fontScale;
  const c = theme.colors;
  const router = useRouter();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showFindPwModal, setShowFindPwModal] = useState(false);
  const { login, loading, error: authError, clearError } = useAuthStore();

  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable);
  }, []);

  const onLogin = async () => {
    if (!id.trim() || !pw.trim()) {
      setFormError('아이디와 비밀번호를 모두 입력해주세요');
      return;
    }
    setFormError(null);
    clearError();
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
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', paddingTop: 32, paddingBottom: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginBottom: 20, opacity: 0.15, paddingHorizontal: 20 }}>
              {Array.from({ length: GRID_SIZE * 2 }).map((_, i) => (
                <View key={i} style={{
                  width: (SCREEN_W - 40 - 6 * 7) / 8, aspectRatio: 1,
                  backgroundColor: c.surfaceAlt, borderRadius: 12,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name={GRID_ICONS[i % GRID_ICONS.length]} size={14} color={c.textSecondary} />
                </View>
              ))}
            </View>

            <BridgeLogo size={72} />
            <View style={{ marginTop: 10 }}>
              <BrandWordmark size="md" />
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 6, fontFamily: fontCute }}>
              매일 3분, 내일의 안전을
            </Text>
          </View>

          <View style={{
            backgroundColor: c.surface, marginHorizontal: 20, borderRadius: 24,
            borderWidth: 1, borderColor: c.border, padding: 20, marginBottom: 16,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)', elevation: 3,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontWeight: '800', fontFamily: fontCute }}>
                로그인
              </Text>
              <Ionicons name="lock-closed" size={18} color={c.primary} />
            </View>

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

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 14, gap: 20 }}>
              <Pressable onPress={() => setShowSignupModal(true)}>
                <Text style={{ color: c.primary, fontSize: 13 * fs, fontWeight: '600', fontFamily: fontCute }}>회원가입</Text>
              </Pressable>
              <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontCute }}>|</Text>
              <Pressable onPress={() => setShowFindPwModal(true)}>
                <Text style={{ color: c.primary, fontSize: 13 * fs, fontWeight: '600', fontFamily: fontCute }}>비밀번호 찾기</Text>
              </Pressable>
            </View>

            {bioAvailable && (
              <View style={{ marginTop: 10 }}>
                <Button label="생체인증으로 로그인" variant="outline" onPress={onBiometric} />
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 40, marginBottom: 16 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
            <Text style={{ marginHorizontal: 14, color: c.textSecondary, fontSize: 12, fontFamily: fontCute }}>또는</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
          </View>

          <SocialButtonRow />

          <Text style={{ textAlign: 'center', color: c.textSecondary, fontSize: 11, marginTop: 24, marginBottom: 16, fontFamily: fontCute }}>
            Bridge와 동일한 계정을 사용합니다
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showSignupModal} transparent animationType="fade" onRequestClose={() => setShowSignupModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setShowSignupModal(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: c.surface, borderRadius: 20, padding: 24, marginHorizontal: 32, width: '80%', maxWidth: 320, borderWidth: 1, borderColor: c.border }}>
            <Ionicons name="link-outline" size={28} color={c.primary} style={{ alignSelf: 'center', marginBottom: 8 }} />
            <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontWeight: '800', textAlign: 'center', marginBottom: 8, fontFamily: fontCute }}>회원가입</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, textAlign: 'center', lineHeight: 20, marginBottom: 16, fontFamily: fontCute }}>
              회원가입은{'\n'}브릿지 웹사이트에서 가능합니다
            </Text>
            <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 10, marginBottom: 20, alignItems: 'center' }}>
              <Text style={{ color: c.primary, fontSize: 12, fontWeight: '600', fontFamily: fontMono }}>bridge.kfpa.or.kr</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="취소" variant="outline" onPress={() => setShowSignupModal(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="이동하기" variant="filled" onPress={() => { Linking.openURL('https://bridge.kfpa.or.kr/'); setShowSignupModal(false); }} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showFindPwModal} transparent animationType="fade" onRequestClose={() => setShowFindPwModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setShowFindPwModal(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: c.surface, borderRadius: 20, padding: 24, marginHorizontal: 32, width: '80%', maxWidth: 320, borderWidth: 1, borderColor: c.border }}>
            <Ionicons name="link-outline" size={28} color={c.primary} style={{ alignSelf: 'center', marginBottom: 8 }} />
            <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontWeight: '800', textAlign: 'center', marginBottom: 8, fontFamily: fontCute }}>비밀번호 변경</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, textAlign: 'center', lineHeight: 20, marginBottom: 16, fontFamily: fontCute }}>
              비밀번호 변경은{'\n'}브릿지 웹사이트에서 가능합니다
            </Text>
            <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 10, marginBottom: 20, alignItems: 'center' }}>
              <Text style={{ color: c.primary, fontSize: 12, fontWeight: '600', fontFamily: fontMono }}>bridge.kfpa.or.kr</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="취소" variant="outline" onPress={() => setShowFindPwModal(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="이동하기" variant="filled" onPress={() => { Linking.openURL('https://bridge.kfpa.or.kr/'); setShowFindPwModal(false); }} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
