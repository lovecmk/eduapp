import React, { useState } from 'react';
import { View, Text, ScrollView, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { Button } from '../src/components/ui/Button';
import { fontDisplay, fontBody, fontMono } from '../src/theme/tokens';
import { sendTestNotification, triggerServerAlert } from '../src/data/notifications/NotificationService';
import { ENV_SUMMARY, env } from '../src/data/network/env';
import { apiClient, type HealthResult } from '../src/data/network/ApiClient';
import { logger } from '../src/utils/logger';
import { ROUTES } from '../src/constants/routes';
import { useAuthoredCardsStore } from '../src/store/authoredCardsStore';
import { contentColumn } from '../src/theme/layout';

type SendState = 'idle' | 'sending' | 'sent' | 'denied' | 'error';

const ALERT_VERSIONS = [
  { v: 1 as const, label: '알림 1 · 긴급 안전 점검', icon: 'warning' as const },
  { v: 2 as const, label: '알림 2 · 오늘의 학습 리마인더', icon: 'time' as const },
  { v: 3 as const, label: '알림 3 · 복습 주기 도래', icon: 'repeat' as const },
];

export default function DeveloperScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const authoredCount = useAuthoredCardsStore((s) => s.cards.length);
  const [state, setState] = useState<SendState>('idle');
  const [alertBusy, setAlertBusy] = useState<number | null>(null);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);

  // 서버 헬스체크 — 목업 모드에서는 호출할 서버가 없으므로 즉시 안내한다.
  const runHealthCheck = async () => {
    if (healthBusy) return; // 중복 요청 방지
    if (env.useMockData) {
      setHealth({ ok: false, latencyMs: 0, error: '목업 모드 — 점검할 실서버가 없습니다' });
      return;
    }
    setHealthBusy(true);
    const result = await apiClient.health(); // 내부에서 예외를 흡수해 항상 결과를 반환
    setHealth(result);
    logger.info('health_check', { ok: result.ok, latencyMs: result.latencyMs, version: result.version });
    setHealthBusy(false);
  };

  const onSend = async () => {
    setState('sending');
    try {
      const ok = await sendTestNotification();
      setState(ok ? 'sent' : 'denied');
    } catch {
      setState('error');
    }
  };

  // 서버발(發) 알림 3버전 — 텔레그램 /alert1~3 과 동일한 브로드캐스트 경로.
  const onServerAlert = async (v: 1 | 2 | 3) => {
    setAlertBusy(v);
    setAlertMsg(null);
    try {
      const res = await triggerServerAlert(v);
      if (!res) {
        setAlertMsg('실서버 연결이 필요해요(목업/웹에서는 동작하지 않습니다).');
      } else {
        setAlertMsg(`✅ "${res.label}" 발송 — ${res.sent}대 기기에 전송했어요.`);
      }
    } catch {
      setAlertMsg('알림 발송에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setAlertBusy(null);
    }
  };

  const feedback = {
    idle: null,
    sending: { icon: 'time-outline' as const, color: c.textSecondary, text: '알림을 보내는 중...' },
    sent: { icon: 'checkmark-circle' as const, color: c.success, text: Platform.OS === 'web' ? '브라우저 알림을 보냈어요.' : '내 폰으로 알림을 보냈어요! 잠시 후 확인해보세요.' },
    denied: { icon: 'notifications-off-outline' as const, color: c.warning, text: '알림 권한이 없어요. 설정에서 알림을 허용해주세요.' },
    error: { icon: 'alert-circle-outline' as const, color: c.error, text: '알림 전송에 실패했어요. 잠시 후 다시 시도해주세요.' },
  }[state];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="개발자 모드" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, ...contentColumn }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.primary + '14', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Ionicons name="construct-outline" size={30} color={c.primary} />
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontFamily: fontDisplay }}>개발자 도구</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 4, textAlign: 'center', lineHeight: 18, fontFamily: fontBody }}>
            테스트용 기능 모음입니다.
          </Text>
        </View>

        {/* 환경설정 — 현재 번들이 어떤 값으로 돌고 있는지 한눈에 확인(민감정보는 마스킹). */}
        <View style={{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Ionicons name="server-outline" size={18} color={c.primary} />
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>환경 설정</Text>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, lineHeight: 19, marginBottom: 14, fontFamily: fontBody }}>
            지금 실행 중인 번들에 적용된 환경변수(.env)입니다. 값은 빌드 타임에 구워지며, 실제 값 변경은 .env 를 수정한 뒤 다시 빌드해야 반영됩니다.
          </Text>
          <View style={{ gap: 2 }}>
            {ENV_SUMMARY.map((row) => (
              <View
                key={row.label}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.surfaceAlt }}
              >
                <Ionicons
                  name={row.ok ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={row.ok ? c.success : c.warning}
                />
                <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, width: 92, fontFamily: fontBody }}>{row.label}</Text>
                <Text style={{ color: c.textPrimary, fontSize: 12.5 * fs, flex: 1, fontFamily: fontMono }} numberOfLines={1}>
                  {row.value}
                </Text>
              </View>
            ))}
          </View>

          {/* 서버 헬스체크 — 배포 후 스모크 확인용(GET /api/health) */}
          <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: c.surfaceAlt, paddingTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable accessibilityRole="button" onPress={runHealthCheck} disabled={healthBusy}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.primary + '14', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, opacity: healthBusy ? 0.6 : 1 }}>
                <Ionicons name="pulse-outline" size={14} color={c.primary} />
                <Text style={{ color: c.primary, fontSize: 12.5 * fs, fontFamily: fontDisplay }}>
                  {healthBusy ? '점검 중…' : '서버 상태 점검'}
                </Text>
              </Pressable>
              {health && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
                  <Ionicons name={health.ok ? 'checkmark-circle' : 'alert-circle'} size={15} color={health.ok ? c.success : c.warning} />
                  <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontMono, flex: 1 }} numberOfLines={1}>
                    {health.ok
                      ? `정상 · ${health.latencyMs}ms${health.version ? ` · v${health.version}` : ''}`
                      : `실패 · ${health.error ?? '알 수 없음'}`}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* 콘텐츠 관리 — 문제 등록(웹 등록 도구와 동일 메타데이터 계약) */}
        <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.authorCard as never)}
          style={{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="create-outline" size={20} color={c.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>문제 등록 · 콘텐츠</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontBody, marginTop: 2 }}>폼/JSON으로 학습 카드 등록 · 등록 {authoredCount}개</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
        </Pressable>

        <View style={{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Ionicons name="notifications-outline" size={18} color={c.primary} />
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>알림 테스트</Text>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, lineHeight: 19, marginBottom: 16, fontFamily: fontBody }}>
            버튼을 누르면 이 기기로 학습 리마인더 알림을 즉시 전송하고 진동으로 알려드려요.
            설정에서 알림을 켜면 3시간마다 복습 리마인더가 자동으로 전송됩니다.
          </Text>

          <Button
            label="내 폰에 알림 보내기"
            onPress={onSend}
            loading={state === 'sending'}
          />

          {feedback && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12 }}>
              <Ionicons name={feedback.icon} size={18} color={feedback.color} />
              <Text style={{ color: c.textPrimary, fontSize: 12.5 * fs, flex: 1, lineHeight: 18, fontFamily: fontBody }}>{feedback.text}</Text>
            </View>
          )}

          {Platform.OS === 'web' && (
            <Text style={{ color: c.textSecondary, fontSize: 11 * fs, marginTop: 10, fontFamily: fontMono }}>
              * 웹에서는 브라우저 알림으로 대체됩니다.
            </Text>
          )}
        </View>

        {/* 서버발(發) 알림 3버전 — 텔레그램 /alert1~3 과 동일 경로 */}
        <View style={{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 18, marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Ionicons name="megaphone-outline" size={18} color={c.primary} />
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>서버 알림 발송 (3버전)</Text>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, lineHeight: 19, marginBottom: 14, fontFamily: fontBody }}>
            등록된 모든 기기로 알림을 동시에 보냅니다. 텔레그램 봇의 /alert1~3 명령과 완전히 같은 경로로 동작해요.
          </Text>

          <View style={{ gap: 8 }}>
            {ALERT_VERSIONS.map((a) => (
              <Button
                key={a.v}
                label={a.label}
                variant="outline"
                loading={alertBusy === a.v}
                onPress={() => onServerAlert(a.v)}
              />
            ))}
          </View>

          {alertMsg && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12 }}>
              <Ionicons name="information-circle-outline" size={18} color={c.primary} />
              <Text style={{ color: c.textPrimary, fontSize: 12.5 * fs, flex: 1, lineHeight: 18, fontFamily: fontBody }}>{alertMsg}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
