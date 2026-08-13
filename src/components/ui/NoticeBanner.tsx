import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay } from '../../theme/tokens';
import { useServiceConfig } from '../../hooks/useServiceConfig';
import type { NoticeLevel } from '../../domain/models/ServiceConfig';

/**
 * 운영 공지 배너 — 관리 콘솔의 '운영 설정 → 공지 배너'가 사용자에게 닿는 자리.
 *
 * ── 왜 여기(탭 레이아웃)에 있나 ────────────────────────────────────────
 * 공지는 어느 탭을 보고 있든 참인 사실이다. 홈 화면 안에 두면 학습 탭에 머무는
 * 사람에게는 영영 닿지 않는다. 연결 상태 배너(OfflineBanner)와 같은 자리에
 * 같은 생김새로 두어, 화면 맨 위 한 줄이 '지금 알아야 할 것'을 맡게 한다.
 *
 * ── 닫을 수 있게 둔 이유 ───────────────────────────────────────────────
 * 배너는 매 화면 위에 남는다. 이미 읽은 공지가 하루 종일 자리를 차지하면
 * 다음 공지도 같이 무시당한다. 대신 **앱을 다시 켜면 돌아온다** — 기기에
 * 영구히 기억시키면 정말 중요한 안내를 놓치는 쪽이 더 위험하다.
 *
 * 점검 모드는 닫을 수 없다. 그건 안내가 아니라 지금 앱이 동작하지 않는 이유다.
 *
 * ── 점검 중에 이 배너를 보는 사람은 관리자뿐이다 ────────────────────────
 * 일반 사용자는 화면 전체가 덮이므로(`MaintenanceGate`) 여기까지 오지 않는다.
 * 관리자는 점검 중에도 서버를 통과해 앱을 쓸 수 있어(§5) 덮지 않는데, 그렇다고
 * 아무 표시가 없으면 '지금 보고 있는 화면이 점검 중의 화면'이라는 사실을 잊는다.
 * 그래서 점검 분기를 남겨 둔다 — 관리자에게는 이 배너가 유일한 표시다.
 */
export function NoticeBanner() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { config } = useServiceConfig();
  const [dismissed, setDismissed] = useState<string | null>(null);

  const maintenance = config.maintenance;
  const notice = config.noticeText.trim();

  if (!maintenance && (notice === '' || dismissed === notice)) return null;

  const look: Record<NoticeLevel, { bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
    info: { bg: c.primary, icon: 'information-circle' },
    warn: { bg: c.warning, icon: 'alert-circle' },
    danger: { bg: c.error, icon: 'warning' },
  };

  // 점검 중이면 단계와 무관하게 가장 센 표시를 쓴다 — 지금 앱이 막혀 있다는 뜻이라
  // '안내' 색으로 보여 주면 사용자가 그냥 넘긴다.
  const { bg, icon } = maintenance ? look.danger : look[config.noticeLevel];
  const message = maintenance
    ? config.maintenanceMessage.trim() || '서비스 점검 중이에요. 잠시 후 다시 이용해주세요.'
    : notice;

  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: bg,
        paddingVertical: 6,
        paddingLeft: 16,
        paddingRight: maintenance ? 16 : 6,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <Ionicons name={icon} size={13} color="#fff" />
      <Text
        numberOfLines={2}
        style={{
          color: '#fff',
          fontSize: 12,
          lineHeight: 17,
          fontFamily: maintenance ? fontDisplay : fontBody,
          flexShrink: 1,
        }}
      >
        {message}
      </Text>
      {!maintenance && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="공지 닫기"
          // 손가락이 닿는 넓이를 아이콘보다 넉넉히 잡는다(13px 아이콘만 맞히기 어렵다).
          hitSlop={10}
          style={{ padding: 4 }}
          onPress={() => setDismissed(notice)}
        >
          <Ionicons name="close" size={14} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}
