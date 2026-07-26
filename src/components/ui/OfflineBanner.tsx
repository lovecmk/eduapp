import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay } from '../../theme/tokens';
import { pendingCount } from '../../data/network/offlineQueue';
import { apiClient } from '../../data/network/ApiClient';
import { logger } from '../../utils/logger';

/** 복귀 후 '전송 완료'를 보여주는 시간. 너무 길면 잔소리가 된다. */
const SYNCED_TOAST_MS = 2600;

type Phase =
  | { kind: 'online' }
  | { kind: 'offline'; queued: number }
  | { kind: 'syncing' }
  | { kind: 'synced'; sent: number };

/**
 * 연결 상태 + 오프라인 대기 쓰기 안내 줄.
 *
 * 현장에서는 통신이 자주 끊긴다. 이때 사용자가 가장 불안해하는 건
 * "방금 푼 문제·출석이 날아갔나?" 이다. 실제로는 오프라인 큐에 안전하게
 * 쌓였다가 연결되면 자동 전송되는데, 그 사실이 화면에 전혀 드러나지 않아
 * 큐가 있으나 마나였다. 그래서 세 가지를 짧게 알려준다.
 *
 *  · 끊김      → "기록은 저장돼요"(대기 건수가 있으면 함께)
 *  · 복귀 직후 → 자동 전송하고 "n건 전송 완료"를 잠깐만
 *  · 그 외     → 아무것도 그리지 않는다(평소엔 조용해야 한다)
 */
export function OfflineBanner() {
  const { theme } = useTheme();
  const c = theme.colors;
  const [phase, setPhase] = useState<Phase>({ kind: 'online' });
  // 끊긴 적이 있어야 '복귀'를 판단할 수 있다(앱을 처음 켰을 땐 알릴 게 없다).
  const wasOfflineRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshQueued = useCallback(async () => {
    try {
      const queued = await pendingCount();
      setPhase((p) => (p.kind === 'offline' ? { kind: 'offline', queued } : p));
    } catch {
      /* 큐를 못 읽어도 배너는 계속 보여준다 */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const onOffline = () => {
      wasOfflineRef.current = true;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setPhase({ kind: 'offline', queued: 0 });
      void refreshQueued();
    };

    const onOnline = async () => {
      if (!wasOfflineRef.current) {
        setPhase({ kind: 'online' });
        return;
      }
      wasOfflineRef.current = false;
      let queued = 0;
      try {
        queued = await pendingCount();
      } catch {
        /* 무시 */
      }
      if (cancelled) return;
      if (queued === 0) {
        setPhase({ kind: 'online' });
        return;
      }
      // 사용자가 이미 '했다고 믿는' 행동이므로 복귀 즉시 흘려보낸다.
      setPhase({ kind: 'syncing' });
      let sent = 0;
      try {
        sent = await apiClient.flushPendingWrites();
      } catch {
        sent = 0;
      }
      if (cancelled) return;
      if (sent === 0) {
        // 아직 못 보냈으면(서버가 여전히 불안정) 조용히 물러난다 —
        // 다음 복귀나 앱 재개(useAppResume)에서 다시 시도한다.
        setPhase({ kind: 'online' });
        return;
      }
      logger.info('offline_queue_flushed', { sent });
      setPhase({ kind: 'synced', sent });
      toastTimer.current = setTimeout(() => setPhase({ kind: 'online' }), SYNCED_TOAST_MS);
    };

    const unsub = NetInfo.addEventListener((s) => {
      if (s.isConnected === false) onOffline();
      else void onOnline();
    });

    return () => {
      cancelled = true;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      unsub();
    };
  }, [refreshQueued]);

  if (phase.kind === 'online') return null;

  const look =
    phase.kind === 'synced'
      ? { bg: c.success, icon: 'checkmark-circle' as const }
      : phase.kind === 'syncing'
        ? { bg: c.primary, icon: 'cloud-upload' as const }
        : { bg: c.error, icon: 'cloud-offline' as const };

  const message =
    phase.kind === 'synced'
      ? `저장해둔 ${phase.sent}건을 전송했어요`
      : phase.kind === 'syncing'
        ? '저장해둔 기록을 전송하는 중이에요'
        : phase.queued > 0
          ? `오프라인 · ${phase.queued}건은 연결되면 자동 전송돼요`
          : '오프라인 · 학습 기록은 안전하게 저장돼요';

  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: look.bg,
        paddingVertical: 6,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <Ionicons name={look.icon} size={13} color="#fff" />
      <Text
        numberOfLines={1}
        style={{ color: '#fff', fontSize: 12, fontFamily: phase.kind === 'offline' ? fontDisplay : fontBody, flexShrink: 1 }}
      >
        {message}
      </Text>
    </View>
  );
}
