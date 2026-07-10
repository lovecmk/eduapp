import React, { useEffect, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Pressable, Modal, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { SocialButtonRow } from '../../src/components/ui/SocialButton';
import { BridgeLogo } from '../../src/components/ui/BridgeLogo';
import { BrandWordmark } from '../../src/components/ui/BrandWordmark';
import { useTheme } from '../../src/theme/ThemeProvider';
import { fontMono, fontCute, fontBody, fontDisplay } from '../../src/theme/tokens';
import { ALL_CATEGORIES, CATEGORY_COLOR, CATEGORY_ICON } from '../../src/constants/categories';
import { isBiometricAvailable, tryBiometricLogin } from '../../src/data/auth/BiometricAuth';
import { useAuthStore } from '../../src/store/authStore';
import { useCommunity } from '../../src/hooks/useCommunity';
import { ROUTES } from '../../src/constants/routes';

/** 로그인 화면 상단의 실시간 "함께 학습 중" 배지 — 첫 화면부터 혼자가 아님을 전한다. */
function LivePresencePill() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { data } = useCommunity();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    scale.value = withRepeat(withSequence(withTiming(2.2, { duration: 1300, easing: Easing.out(Easing.ease) }), withTiming(1, { duration: 0 })), -1);
    opacity.value = withRepeat(withSequence(withTiming(0, { duration: 1300 }), withTiming(0.5, { duration: 0 })), -1);
  }, []);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

  if (!data) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surfaceAlt, borderColor: c.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, marginTop: 16 }}>
      <View style={{ width: 8, height: 8, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' }, ring]} />
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' }} />
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 12.5, fontFamily: fontBody }}>
        지금 <Text style={{ color: c.primary, fontFamily: fontDisplay }}>{data.onlineNow.toLocaleString()}명</Text>의 점검자가 함께 학습 중
      </Text>
    </View>
  );
}

function LinkModal({
  visible, onClose, title, desc,
}: { visible: boolean; onClose: () => void; title: string; desc: string }) {
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
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {/* 히어로 */}
          <View style={{ alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 }}>
            <View style={{
              width: 76, height: 76, borderRadius: 22, backgroundColor: c.surface,
              borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(37,99,235,0.14)', elevation: 4,
            }}>
              <BridgeLogo size={48} />
            </View>
            <View style={{ marginTop: 16 }}>
              <BrandWordmark size="md" />
            </View>
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, marginTop: 14, fontFamily: fontDisplay, textAlign: 'center' }}>
              건물점검, 매일 3분이면 충분합니다
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 4, fontFamily: fontBody, textAlign: 'center' }}>
              점검 실무 지식을 카드로 가볍게 쌓아보세요
            </Text>

            {/* 학습 분야 칩 */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 18 }}>
              {ALL_CATEGORIES.map((cat) => (
                <View key={cat} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: CATEGORY_COLOR[cat] + '14',
                  borderWidth: 1, borderColor: CATEGORY_COLOR[cat] + '33',
                  borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
                }}>
                  <Ionicons name={CATEGORY_ICON[cat]} size={12} color={CATEGORY_COLOR[cat]} />
                  <Text style={{ color: CATEGORY_COLOR[cat], fontSize: 11.5, fontFamily: fontDisplay }}>{cat}</Text>
                </View>
              ))}
            </View>

            <LivePresencePill />
          </View>

          {/* 로그인 카드 */}
          <View style={{
            backgroundColor: c.surface, marginHorizontal: 20, borderRadius: 24,
            borderWidth: 1, borderColor: c.border, padding: 22, marginTop: 24, marginBottom: 16,
            boxShadow: '0 8px 28px rgba(15,23,42,0.08)', elevation: 3,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <Text style={{ color: c.textPrimary, fontSize: 18 * fs, fontFamily: fontDisplay }}>로그인</Text>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield-checkmark" size={17} color={c.primary} />
              </View>
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

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 16, gap: 18, alignItems: 'center' }}>
              <Pressable onPress={() => setShowSignupModal(true)} hitSlop={8}>
                <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>회원가입</Text>
              </Pressable>
              <View style={{ width: 1, height: 12, backgroundColor: c.border }} />
              <Pressable onPress={() => setShowFindPwModal(true)} hitSlop={8}>
                <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>비밀번호 찾기</Text>
              </Pressable>
            </View>

            {bioAvailable && (
              <View style={{ marginTop: 14 }}>
                <Button label="생체인증으로 로그인" variant="outline" onPress={onBiometric} />
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 40, marginBottom: 16 }}>
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

      <LinkModal
        visible={showSignupModal}
        onClose={() => setShowSignupModal(false)}
        title="회원가입"
        desc={'회원가입은\n브릿지 웹사이트에서 가능합니다'}
      />
      <LinkModal
        visible={showFindPwModal}
        onClose={() => setShowFindPwModal(false)}
        title="비밀번호 찾기"
        desc={'비밀번호 변경은\n브릿지 웹사이트에서 가능합니다'}
      />
    </SafeAreaView>
  );
}
