import React, { useEffect, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { AppLogo } from '../../src/components/ui/AppLogo';
import { useTheme } from '../../src/theme/ThemeProvider';
import { fontDisplay, fontBody } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/store/authStore';
import { ROUTES } from '../../src/constants/routes';
import { APP_NAME } from '../../src/constants/brand';

const SAVED_ID_KEY = 'saved_login_id';

export default function LoginScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [rememberId, setRememberId] = useState(false);
  const { login, loading, error: authError, sessionEndedReason, clearError } = useAuthStore();


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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 32 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <View style={{ alignItems: 'center', marginBottom: 36 }}>

            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 82, height: 82, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
                alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 30px ${c.primary}22`,
              }}
            >
              <AppLogo size={52} />
            </View>
            <Text style={{ color: c.textPrimary, fontSize: 24 * fs, fontFamily: fontDisplay, marginTop: 18, letterSpacing: 1 }}>{APP_NAME}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 6, fontFamily: fontBody }}>현장 안전학습, 매일 3분이면 충분합니다</Text>
          </View>


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



            <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontBody, textAlign: 'center', marginTop: 18, lineHeight: 18 * fs }}>
              계정 만들기와 비밀번호 찾기는{'\n'}브릿지(bridge.kfpa.or.kr)에서 진행합니다
            </Text>







        </ScrollView>
      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}
