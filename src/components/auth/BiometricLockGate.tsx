import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { AppLogo } from '../ui/AppLogo';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { authenticateWithBiometrics, isBiometricAvailable } from '../../data/auth/BiometricAuth';
import { APP_NAME } from '../../constants/brand';

/** 설정 스토어가 디스크에서 돌아왔는가 — 돌아오기 전의 기본값(꺼짐)으로 판단하면 잠금이 새어 나간다. */
function useSettingsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useSettingsStore.persist?.hasHydrated?.() ?? true);
  useEffect(() => {
    if (hydrated) return;
    const unsub = useSettingsStore.persist?.onFinishHydration?.(() => setHydrated(true));
    if (useSettingsStore.persist?.hasHydrated?.()) setHydrated(true);
    return unsub;
  }, [hydrated]);
  return hydrated;
}

/**
 * 생체인증 잠금 — 설정의 '생체인증 잠금'을 켠 사람이 앱을 새로 열면 화면을 덮는다.
 *
 * ── 예전에는 무엇이 있었나 ───────────────────────────────────────────────
 * 설정에 '생체인증 로그인' 스위치가 있었지만 **아무도 그 값을 읽지 않았다.**
 * 한편 로그인 화면에는 지문 인식 기기라면 누구에게나 '생체인증으로 로그인' 버튼이
 * 떴고, 인증이 통과하면 세션 없이 홈으로 보냈다 — 로그인하지 않은 채 탭 화면이
 * 열리고, 서버 요청은 전부 401 로 떨어졌다. 스위치는 죽어 있었고 버튼은 거짓이었다.
 *
 * 지금은 생체인증을 '저장된 세션을 여는 열쇠'로만 쓴다.
 *  · 덮는 때: 설정이 켜져 있고, 세션이 **저장된 토큰으로 복구된** 실행일 때
 *    (authStore.needsUnlock). 방금 비밀번호로 들어온 사람에게는 묻지 않는다.
 *  · 여는 방법: 지문·얼굴(기기 암호 폴백 포함). 안 되면 '비밀번호로 로그인'으로
 *    나갈 수 있다 — 지문이 등록 해제된 기기에서 영영 갇히면 안 된다.
 *  · 웹에는 생체인증이 없으므로 덮지 않는다.
 */
export function BiometricLockGate() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const enabled = useSettingsStore((s) => s.biometricLoginEnabled);
  const hydrated = useSettingsHydrated();
  const needsUnlock = useAuthStore((s) => s.needsUnlock && !!s.user);
  const unlock = useAuthStore((s) => s.unlock);
  const logout = useAuthStore((s) => s.logout);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const prompted = useRef(false);

  const locked = Platform.OS !== 'web' && hydrated && enabled && needsUnlock;

  const tryUnlock = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const ok = await authenticateWithBiometrics(`${APP_NAME} 잠금 해제`);
      if (ok) unlock();
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [unlock]);

  // 덮이는 순간 한 번은 곧바로 묻는다 — 사용자가 버튼을 찾아 누르게 하지 않는다.
  useEffect(() => {
    if (!locked) {
      prompted.current = false;
      return;
    }
    if (prompted.current) return;
    prompted.current = true;
    void (async () => {
      const ok = await isBiometricAvailable();
      setAvailable(ok);
      if (ok) await tryUnlock();
    })();
  }, [locked, tryUnlock]);

  if (!locked) return null;

  return (
    <View
      accessibilityViewIsModal
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.bg, zIndex: 90, elevation: 90 }}
    >
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <AppLogo size={56} />
        <Text style={{ color: c.textPrimary, fontSize: 19 * fs, fontFamily: fontDisplay, marginTop: 20, textAlign: 'center' }}>
          잠겨 있어요
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 13 * fs, lineHeight: 20 * fs, fontFamily: fontBody, marginTop: 8, textAlign: 'center' }}>
          {available
            ? failed
              ? '확인하지 못했어요. 다시 시도해 주세요.'
              : '지문 또는 얼굴로 확인하면 이어서 쓸 수 있어요.'
            : '이 기기에서 생체인증을 쓸 수 없어요.\n비밀번호로 다시 로그인해 주세요.'}
        </Text>
        {available ? (
          <View style={{ width: '100%', maxWidth: 320, marginTop: 24 }}>
            <Button label="잠금 해제" loading={busy} onPress={() => { void tryUnlock(); }} />
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          disabled={busy}
          // 로그아웃해도 이 기기의 학습 기록은 남는다(sessionScope) — 같은 사람이
          // 비밀번호로 다시 들어오면 그대로 이어진다. 인증 가드가 로그인 화면으로 보낸다.
          onPress={() => { void logout().catch(() => {}); }}
          style={{ marginTop: 18, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Ionicons name="key-outline" size={14} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>비밀번호로 로그인</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
