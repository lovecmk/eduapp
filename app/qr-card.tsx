// 내 QR 명함 — 우선 제거(비활성화). 아래 원본 구현은 요청에 따라 주석으로 보존한다.
// 다시 활성화하려면 아래 블록 주석을 해제하고, app/(tabs)/mypage.tsx 의 진입 MyRow 와
// app/_layout.tsx 의 <Stack.Screen name="qr-card" /> 주석도 함께 해제하면 된다.
//
// expo-router 는 app/ 하위 파일을 자동으로 라우트로 등록하므로, 라우트 파일 자체는
// 유효한 default export 를 유지해야 한다(빌드 오류 방지). 링크가 모두 제거되어 도달할 수 없고,
// 혹시 직접 진입하더라도 아무것도 표시하지 않도록 홈으로 되돌린다.

import { Redirect } from 'expo-router';

export default function QRCardScreen() {
  return <Redirect href="/(tabs)/mypage" />;
}

/* ── 원본 구현(주석 보존) ─────────────────────────────────────────────
import React, { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { QRCode } from '../src/components/ui/QRCode';
import { Avatar } from '../src/components/ui/Avatar';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { displayName, membershipMeta } from '../src/domain/models/User';
import { fontCute, fontMono, fontBody } from '../src/theme/tokens';
import { useResponsive } from '../src/theme/responsive';

// 프로필을 여는 딥링크(웹 프로필로도 연결 가능한 형태).
function profileLink(loginId?: string, nickname?: string): string {
  const base = 'https://bridge.kfpa.or.kr/u/';
  const id = encodeURIComponent(loginId ?? 'guest');
  const n = nickname ? `?n=${encodeURIComponent(nickname)}` : '';
  return `${base}${id}${n}`;
}

export default function QRCardScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const user = useAuthStore((s) => s.user);
  const profileImage = useSettingsStore((s) => s.profileImage);
  const { width, isSmall } = useResponsive();

  const link = useMemo(() => profileLink(user?.loginId, user?.nickname), [user]);
  // 화면 폭에 맞춰 QR 크기를 정하되(반응형), 태블릿에서 과대해지지 않게 상한.
  const qrSize = Math.min(width - 96, isSmall ? 190 : 240);
  const meta = user ? membershipMeta(user.membership) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="내 QR 명함" />
      <ScrollView
        contentContainerStyle={{ padding: 24, alignItems: 'center', maxWidth: 520, width: '100%', alignSelf: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ color: c.textSecondary, fontSize: 13 * fs, textAlign: 'center', marginBottom: 20, fontFamily: fontBody, lineHeight: 20 }}>
          동료에게 QR을 보여주면{'\n'}내 프로필을 바로 열 수 있어요.
        </Text>

        <View
          style={{
            backgroundColor: c.surface,
            borderRadius: 24,
            padding: 24,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: c.border,
            width: '100%',
            boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
          }}
        >
          <Avatar uri={profileImage} size={64} ring={2} ringColor={c.primary} />
          <Text style={{ color: c.textPrimary, fontSize: 20 * fs, fontWeight: '800', marginTop: 12, fontFamily: fontCute }} numberOfLines={1}>
            {displayName(user)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {user?.loginId ? (
              <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontMono }}>@{user.loginId}</Text>
            ) : null}
            {meta ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: meta.accent + '1A', borderColor: meta.accent + '55', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Ionicons name={meta.icon as never} size={11} color={meta.accent} />
                <Text style={{ color: meta.accent, fontSize: 11, fontWeight: '800', fontFamily: fontCute }}>{meta.label}</Text>
              </View>
            ) : null}
          </View>

          <View style={{ backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginTop: 20 }}>
            <QRCode value={link} size={qrSize} ecLevel="M" color="#111111" background="#FFFFFF" />
          </View>

          {user?.org ? (
            <Text style={{ color: c.textSecondary, fontSize: 12 * fs, marginTop: 16, fontFamily: fontBody }}>{user.org}</Text>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, paddingHorizontal: 16 }}>
          <Ionicons name="link-outline" size={14} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontFamily: fontMono, flexShrink: 1 }} numberOfLines={1}>{link}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
────────────────────────────────────────────────────────────────────── */
