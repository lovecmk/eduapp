import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * OTA 진단 오버레이 — 배포 파이프라인 검증용 (테스트 코드)
 *
 * 목적: EAS Update(OTA)가 "설치된 네이티브 앱"에 실제로 도달하는지 폰에서 눈으로
 * 확인한다. 이 컴포넌트가 화면에 보인다는 것 자체가 "OTA 번들이 적용됐다"는 신호다.
 *
 * 사용법(엔드투엔드 테스트):
 *  1) 이 코드가 없는 빌드를 먼저 설치한다(현재 main 빌드).
 *  2) 이 코드를 main 에 머지 → `eas update --branch production` 로 OTA 게시.
 *  3) 설치된 앱을 완전히 종료 후 재실행 → 아래 배지가 "나타나면" OTA 성공.
 *  4) 이후 반복 검증은 OTA_TEST_MARKER 값을 v2, v3… 로 바꿔 재게시하면
 *     재시작 후 배지의 마커가 바뀌는지로 확인한다.
 *
 * 웹에서는 렌더링하지 않는다(웹은 version.json 경로를 쓰며 expo-updates 무관).
 */

// ⚠️ 반복 OTA 테스트 시 이 값을 v2, v3… 로 올려 재게시하라. 재시작 후 이 값이
//    바뀌면 "그 다음 OTA"까지 정상 동작한다는 뜻이다.
const OTA_TEST_MARKER = 'v1';

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19);
  return String(v);
}

export function OtaDiagnostics() {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [checking, setChecking] = useState(false);

  // 수동 업데이트 확인 — 서버 연결/런타임 매칭/가용 여부를 그대로 노출한다.
  const checkNow = useCallback(async () => {
    if (!Updates.isEnabled) {
      Alert.alert(
        'OTA 비활성',
        'Updates.isEnabled = false — 이 빌드는 expo-updates 가 꺼져 있거나\nExpo Go/개발 환경입니다. 프로덕션 빌드에서만 OTA 가 동작합니다.',
      );
      return;
    }
    setChecking(true);
    try {
      const res = await Updates.checkForUpdateAsync();
      const reason = (res as { reason?: string }).reason;
      Alert.alert(
        '업데이트 확인 결과',
        [
          `isAvailable : ${res.isAvailable}`,
          reason ? `reason      : ${reason}` : null,
          `channel     : ${fmt(Updates.channel)}`,
          `runtimeVer  : ${fmt(Updates.runtimeVersion)}`,
          res.isAvailable && res.manifest ? `new id      : ${fmt((res.manifest as { id?: string }).id).slice(0, 8)}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    } catch (e) {
      Alert.alert('확인 실패', String((e as Error)?.message ?? e));
    } finally {
      setChecking(false);
    }
  }, []);

  // 웹은 대상 아님.
  if (Platform.OS === 'web') return null;

  const rows: Array<[string, string]> = [
    ['marker', OTA_TEST_MARKER],
    ['isEnabled', fmt(Updates.isEnabled)],
    ['embeddedLaunch', fmt(Updates.isEmbeddedLaunch)],
    ['channel', fmt(Updates.channel)],
    ['runtimeVersion', fmt(Updates.runtimeVersion)],
    ['updateId', fmt(Updates.updateId).slice(0, 8)],
    ['createdAt', fmt(Updates.createdAt)],
  ];

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + 8 }]}
    >
      {expanded && (
        <View
          style={[
            styles.panel,
            { backgroundColor: c.surface, borderColor: c.border, boxShadow: `0 8px 24px ${c.primary}22` },
          ]}
        >
          <Text style={[styles.panelTitle, { color: c.textPrimary }]}>OTA 진단</Text>
          {rows.map(([k, v]) => (
            <View key={k} style={styles.row}>
              <Text style={[styles.key, { color: c.textSecondary }]}>{k}</Text>
              <Text style={[styles.val, { color: c.textPrimary }]} numberOfLines={1}>
                {v}
              </Text>
            </View>
          ))}
          <Pressable
            onPress={checkNow}
            disabled={checking}
            style={[styles.checkBtn, { backgroundColor: c.primary, opacity: checking ? 0.6 : 1 }]}
          >
            <Text style={styles.checkText}>{checking ? '확인 중…' : '지금 업데이트 확인'}</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        onPress={() => setExpanded((s) => !s)}
        style={[styles.badge, { backgroundColor: c.primary }]}
        accessibilityLabel="OTA 진단 열기"
      >
        <Text style={styles.badgeText}>🟢 OTA {OTA_TEST_MARKER}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 10,
    alignItems: 'flex-end',
    zIndex: 2000,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  panel: {
    width: 230,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 8,
  },
  panelTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, gap: 8 },
  key: { fontSize: 11 },
  val: { fontSize: 11, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  checkBtn: {
    marginTop: 10,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  checkText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
