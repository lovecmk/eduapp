import React, { useEffect, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { SocialButtonRow } from '../../src/components/ui/SocialButton';
import { AppLogo } from '../../src/components/ui/AppLogo';
import { useTheme } from '../../src/theme/ThemeProvider';
import { fontDisplay, fontBody } from '../../src/theme/tokens';
import { isBiometricAvailable, tryBiometricLogin } from '../../src/data/auth/BiometricAuth';
import { useAuthStore } from '../../src/store/authStore';
import { ROUTES } from '../../src/constants/routes';
import { APP_NAME } from '../../src/constants/brand';
import { env } from '../../src/data/network/env';

const SAVED_ID_KEY = 'saved_login_id';

export default function LoginScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [rememberId, setRememberId] = useState(false);
  const { login, socialLogin, loading, error: authError, clearError } = useAuthStore();

  useEffect(() => { isBiometricAvailable().then(setBioAvailable); }, []);
  // 저장해 둔 아이디가 있으면 자동으로 채우고 '아이디 저장'을 켜둔다.
  useEffect(() => {
    AsyncStorage.getItem(SAVED_ID_KEY).then((saved) => {
      if (saved) { setId(saved); setRememberId(true); }
    });
  }, []);

  const onLogin = async () => {
    if (!id.trim() || !pw.trim()) { setFormError('이메일(또는 아이디)과 비밀번호를 모두 입력해주세요'); return; }
    setFormError(null); clearError();
    const ok = await login(id.trim(), pw);
    if (ok) {
      // 로그인 성공 시에만 아이디 저장 상태를 반영(비번은 저장하지 않는다).
      // 저장소 쓰기가 실패해도(용량 부족·브라우저 시크릿 모드) 로그인 자체는 성공했으므로
      // 반드시 홈으로 보낸다. 예전엔 여기서 예외가 나면 홈 이동이 통째로 취소돼
      // "로그인은 됐는데 화면이 안 넘어간다"로 보였다.
      try {
        if (rememberId) await AsyncStorage.setItem(SAVED_ID_KEY, id.trim());
        else await AsyncStorage.removeItem(SAVED_ID_KEY);
      } catch { /* 아이디 저장 실패는 로그인 흐름을 막지 않는다 */ }
      router.replace(ROUTES.home);
    }
  };

  // 간편 로그인 — 데모: 카카오 → 원진섭, 애플 → 이용재 계정으로 로그인.
  const SOCIAL_ACCOUNT: Record<string, { name: string; email: string }> = {
    kakao: { name: '원진섭', email: 'won@example.com' },
    apple: { name: '이용재', email: 'lee@example.com' },
  };
  const onSocial = async (key: string) => {
    const acc = SOCIAL_ACCOUNT[key];
    if (!acc) { setFormError('준비 중인 로그인 방식이에요'); return; }
    setFormError(null); clearError();
    const ok = await socialLogin(acc.name, acc.email);
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
              <AppLogo size={52} />
            </View>
            <Text style={{ color: c.textPrimary, fontSize: 24 * fs, fontFamily: fontDisplay, marginTop: 18, letterSpacing: 1 }}>{APP_NAME}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 6, fontFamily: fontBody }}>현장 안전학습, 매일 3분이면 충분합니다</Text>
          </View>

          {/* 로그인 */}
          <TextField
            /* 브릿지 계정으로 로그인한다. 사람들이 외우고 있는 것은 대개
               브릿지 아이디가 아니라 자기 사내 이메일이라, 서버가 둘 다 받는다.
               라벨에 그 사실이 안 적혀 있으면 이메일을 넣어 볼 생각을 못 한다. */
            label="이메일 또는 아이디"
            value={id}
            onChangeText={(t) => { setId(t); if (formError) setFormError(null); }}
            placeholder="사내 이메일 또는 브릿지 아이디"
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

          {/* 아이디 저장 — 다음 방문 때 자동으로 채워준다(비밀번호는 저장하지 않음). */}
          <Pressable accessibilityRole="button"
            onPress={() => setRememberId((v) => !v)}
            hitSlop={6}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 2, marginBottom: 12, paddingVertical: 4 }}
          >
            <View style={{
              width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
              backgroundColor: rememberId ? c.primary : 'transparent', borderWidth: rememberId ? 0 : 1.5, borderColor: c.border,
            }}>
              {rememberId && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>아이디 저장</Text>
          </Pressable>

          <Button label="로그인" variant="filled" loading={loading} onPress={onLogin} style={{ marginTop: 4 }} />

          {/*
            계정은 브릿지(bridge.kfpa.or.kr)가 쥐고 있다.
            가입·비밀번호 찾기 화면이 있는 곳도 거기다(mybrdg 는 운영관리 콘솔이라
            일반 회원이 갈 곳이 아니다 — 주소를 잘못 알려 주면 헛걸음을 시킨다).

            실서버에서는 가입도 비밀번호 찾기도 이 앱이 할 수 있는 일이 아니다 —
            서버가 브릿지 회원을 읽기만 하기 때문이다. 그런데 버튼을 남겨 두면
            사용자는 양식을 다 채운 뒤에야 "여기서는 안 됩니다"를 듣는다.
            헛수고를 시킨 뒤 알려 주느니 처음부터 어디로 가야 하는지 말한다.
            (목업으로 도는 동안에는 앱 안에 가입 화면이 실제로 있으므로 남긴다.)
          */}
          {env.useMockData ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 18, gap: 18, alignItems: 'center' }}>
              <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.signup)} hitSlop={8}>
                <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>회원가입</Text>
              </Pressable>
              <View style={{ width: 1, height: 12, backgroundColor: c.border }} />
              <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.findPw)} hitSlop={8}>
                <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>비밀번호 찾기</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontBody, textAlign: 'center', marginTop: 18, lineHeight: 18 * fs }}>
              계정 만들기와 비밀번호 찾기는{'\n'}브릿지(bridge.kfpa.or.kr)에서 진행합니다
            </Text>
          )}

          {bioAvailable && (
            <View style={{ marginTop: 16 }}>
              <Button label="생체인증으로 로그인" variant="outline" onPress={onBiometric} />
            </View>
          )}

          {/* 간편 로그인 — 데모(목업)에서만 보인다.
              실서버에는 이 인증 경로가 없다. 이름·이메일만으로 세션을 내주는
              계약이라 그대로 서버에 옮기면 비밀번호를 묻지 않는 인증이 되기 때문이다.
              누를 때마다 실패하는 버튼을 띄워 두면 사용자는 앱이 고장났다고 여긴다. */}
          {env.useMockData && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 28, marginBottom: 16 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
                <Text style={{ marginHorizontal: 14, color: c.textSecondary, fontSize: 12, fontFamily: fontBody }}>간편 로그인</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
              </View>
              <SocialButtonRow onPress={onSocial} />
            </>
          )}

          {/* <Text style={{ textAlign: 'center', color: c.textSecondary, fontSize: 11, marginTop: 22, fontFamily: fontBody }}>
            Bridge와 동일한 계정을 사용합니다
          </Text> */}
        </ScrollView>
      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}
