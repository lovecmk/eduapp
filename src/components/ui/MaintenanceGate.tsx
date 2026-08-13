import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay, fontMono } from '../../theme/tokens';
import { Button } from './Button';
import { useServiceConfig } from '../../hooks/useServiceConfig';
import { useAuthStore } from '../../store/authStore';

/**
 * 점검 모드 — 화면을 덮는다.
 *
 * ── 배너로는 부족하다 ──────────────────────────────────────────────────
 * 점검이 켜지면 서버는 일반 사용자의 API 를 **전부 503** 으로 막는다. 그런데 앱의
 * 보조 기능 폴백(`data/repositories/_fallback.ts`)은 503 을 '지금 못 닿았다'로 보고
 * 하루 상한·날씨·사용자 디렉터리를 잠시 목업으로 떨어뜨린다. 그래서 배너 한 줄만
 * 띄우면 **점검 중인데 하루 상한만 로컬 값으로 도는** 화면이 만들어진다 — 사용자는
 * 학습을 시작했다가 채점에서 실패하고, 자기 기록이 남았는지 알 수 없게 된다.
 * 그럴 바에는 들어가지 못하게 막고 이유를 말하는 쪽이 정직하다
 * (docs/PLATFORM_SPLIT.md §5).
 *
 * ── 잠그는 조건은 좁게 ────────────────────────────────────────────────
 *  · `maintenance === true` 라고 **서버가 지금 말할 때만** 덮는다. 설정을 못 읽었을
 *    때의 기본값은 '평상시'이고(`defaultServiceConfig`), 지난 점검 상태를 디스크에
 *    남기지도 않는다 — 지하에서 잠깐 끊긴 것이 앱을 잠그는 이유가 되면 안 된다.
 *  · 관리자는 통과시킨다. 서버도 점검 중 관리자 요청은 통과시키므로(§5), 여기서
 *    막으면 점검이 잘 끝났는지 확인할 사람만 확인하지 못한다.
 *
 * 덮인 동안 설정은 30초마다 다시 확인한다(useServiceConfig) — 점검이 끝나면
 * 사용자가 아무것도 하지 않아도 화면이 열린다.
 */
export function MaintenanceGate() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { config, refetch, isFetching } = useServiceConfig();
  const isAdmin = useAuthStore((s) => s.user?.isAdmin ?? false);

  if (!config.maintenance || isAdmin) return null;

  const message =
    config.maintenanceMessage.trim() ||
    '서비스 점검 중이에요.\n점검이 끝나면 자동으로 열립니다.';

  return (
    <View
      accessibilityRole="alert"
      accessibilityViewIsModal
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: c.bg,
        // 토스트·업데이트 안내보다 위에 있어야 한다 — 점검 중에 누를 수 있는 것은 없다.
        zIndex: 100,
        elevation: 100,
      }}
    >
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: c.warning + '1F',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <Ionicons name="construct-outline" size={32} color={c.warning} />
        </View>

        <Text
          style={{
            color: c.textPrimary,
            fontSize: 19,
            fontFamily: fontDisplay,
            marginBottom: 10,
            textAlign: 'center',
          }}
        >
          서비스 점검 중
        </Text>

        <Text
          style={{
            color: c.textSecondary,
            fontSize: 14,
            lineHeight: 22,
            fontFamily: fontBody,
            textAlign: 'center',
            marginBottom: 28,
          }}
        >
          {message}
        </Text>

        <Button
          label={isFetching ? '확인 중…' : '다시 확인'}
          variant="outline"
          loading={isFetching}
          onPress={() => void refetch()}
          style={{ minWidth: 160 }}
        />

        {config.serverVersion !== '' && (
          <Text
            style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontMono, marginTop: 18 }}
          >
            server {config.serverVersion}
          </Text>
        )}
      </SafeAreaView>
    </View>
  );
}
