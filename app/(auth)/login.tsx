import React, { useEffect, useRef, useState } from 'react';
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
import { useAuthStore } from '../../src/store/authStore';
import { ROUTES } from '../../src/constants/routes';
import { APP_NAME } from '../../src/constants/brand';
import { env } from '../../src/data/network/env';
import { ADMIN_DEMO_USER, ADMIN_TAP_COUNT, ADMIN_TAP_WINDOW_MS } from '../../src/data/auth/adminDemoAccount';
import { useSafeTimeout } from '../../src/hooks/useSafeTimeout';
import { toast } from '../../src/store/toastStore';

const SAVED_ID_KEY = 'saved_login_id';

export default function LoginScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [rememberId, setRememberId] = useState(false);
  const { login, socialLogin, adminLogin, loading, error: authError, sessionEndedReason, clearError } = useAuthStore();
  const { run: runLater, cancelAll: cancelTapReset } = useSafeTimeout();
  // 로고 연속 두드리기 횟수 — 화면을 다시 그릴 이유가 없으므로 ref 로 센다.
  const logoTaps = useRef(0);

  // 저장해 둔 아이디가 있으면 자동으로 채우고 '아이디 저장'을 켜둔다.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SAVED_ID_KEY).then((saved) => {
      if (saved && !cancelled) { setId(saved); setRememberId(true); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const onLogin = async () => {
    if (!id.trim() || !pw.trim()) { setFormError('아이디와 비밀번호를 모두 입력해주세요'); return; }
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

  /**
   * 로고 연속 5번 두드리기 → 관리자 모드(이용재)로 진입한다.
   *
   * 눈에 보이는 버튼으로 두지 않는 이유는 adminDemoAccount 주석에 적어 두었다.
   * 두드림 사이가 ADMIN_TAP_WINDOW_MS 보다 벌어지면 처음부터 다시 센다 —
   * 무심코 한 번씩 누른 것이 쌓여서 열리면 그건 숨긴 게 아니다.
   */
  const onLogoTap = () => {
    cancelTapReset();
    logoTaps.current += 1;
    if (logoTaps.current < ADMIN_TAP_COUNT) {
      runLater(() => { logoTaps.current = 0; }, ADMIN_TAP_WINDOW_MS);
      return;
    }
    logoTaps.current = 0;
    void enterAdminMode();
  };

  const enterAdminMode = async () => {
    setFormError(null); clearError();
    const ok = await adminLogin();
    if (!ok) return;
    toast(`관리자 모드 · ${ADMIN_DEMO_USER.name}님으로 로그인했어요`, 'success');
    router.replace(ROUTES.home);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 32 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 브랜드 */}
          <View style={{ alignItems: 'center', marginBottom: 36 }}>
            {/* 로고 자리는 관리자 모드 입구이기도 하다(onLogoTap).
                accessibilityRole 을 button 으로 두지 않는 이유 — 스크린리더가
                "버튼"이라고 읽으면 숨겨 둔 의미가 없고, 일반 사용자에게는
                누를 것이 없는 장식이기 때문이다. */}
            <Pressable
              onPress={onLogoTap}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 82, height: 82, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
                alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 30px ${c.primary}22`,
              }}
            >
              <AppLogo size={52} />
            </Pressable>
            <Text style={{ color: c.textPrimary, fontSize: 24 * fs, fontFamily: fontDisplay, marginTop: 18, letterSpacing: 1 }}>{APP_NAME}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 6, fontFamily: fontBody }}>현장 안전학습, 매일 3분이면 충분합니다</Text>
          </View>

          {/* 세션이 서버에 의해 끝난 경우의 안내(정지·만료).

              비밀번호 칸 아래 도움말로 흘리지 않고 폼 위에 따로 세운다. 계정이
              정지된 사람에게 필요한 것은 '다시 입력해 보라'가 아니라 **무슨 일이
              일어났고 누구에게 물어야 하는가**다. 아무 설명 없이 로그인 화면으로
              돌아오면 사용자는 같은 시도를 반복하다 앱을 지운다. */}
          {!!sessionEndedReason && (
            <View
              accessibilityRole="alert"
              style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 14,
                backgroundColor: c.warning + '14', borderWidth: 1, borderColor: c.warning + '44',
                borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
              }}
            >
              <Ionicons name="alert-circle" size={16} color={c.warning} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, color: c.textPrimary, fontSize: 12.5 * fs, lineHeight: 18, fontFamily: fontBody }}>
                {sessionEndedReason}
              </Text>
            </View>
          )}

          {/* 로그인 */}
          <TextField
            /* 브릿지 계정으로 로그인한다. 서버는 사내 이메일도 브릿지 아이디도
               같은 '아이디'로 받으므로 라벨은 하나로 두고, 어떤 모양이면 되는지는
               placeholder 의 실제 예시가 대신 말해 준다. */
            label="아이디"
            value={id}
            onChangeText={(t) => { setId(t); if (formError) setFormError(null); }}
            placeholder="bridge@kfpa.or.kr"
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

          {/* '생체인증으로 로그인' 버튼은 여기 없다. 그 버튼은 지문이 맞으면 **세션 없이**
              홈으로 보냈다 — 로그인하지 않은 채 로그인한 사람의 화면이 열렸다.
              생체인증은 이제 저장된 세션을 여는 잠금으로만 쓴다(설정 → 생체인증 잠금,
              components/auth/BiometricLockGate). 세션이 없으면 열 것도 없다. */}

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
