import React from 'react';
import { View, Text } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontMono } from '../../theme/tokens';
import type { UpcomingDay } from '../../domain/reviewPlan';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 앞으로 7일 복습 예정 — '내일 또 올 이유'를 만든다.
 *
 * 오늘 것을 보고 나면 화면이 비어 버리는데, 그러면 다음에 언제 와야 하는지 알 수 없다.
 * 앞으로가 보이면 복습이 '끝나는 일'이 아니라 '이어지는 일'이 된다.
 *
 * '예정'이라는 말은 쓰지 않는다. 약속처럼 들려서, 지키지 못하면 어긴 것이 된다.
 * 여기 있는 것은 일정표가 아니라 앞으로 만나게 될 카드의 분포다.
 *
 * 막대 높이로 양을 표현하되, 0인 날도 자리를 남겨 둔다 —
 * 빈 날이 지워지면 날짜 간격이 무너져 '언제'를 읽을 수 없다.
 */
export function UpcomingStrip({ days }: { days: UpcomingDay[] }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;

  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((sum, d) => sum + d.count, 0);

  // 앞으로 아무 일정도 없으면 빈 막대만 늘어놓게 된다 — 그럴 바엔 보이지 않는 편이 낫다.
  if (total === 0) return null;

  return (
    <View style={{ marginTop: 14 }}>
      <Text
        style={{ color: c.textSecondary, fontSize: 11.5 * fs, marginBottom: 8, fontFamily: fontBody }}
      >
        앞으로 7일간 볼 카드
      </Text>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
        {days.map((d) => {
          const ratio = d.count / max;
          // 0 인 날도 얇은 선으로 자리를 남긴다(간격이 무너지지 않게).
          const height = d.count === 0 ? 3 : 10 + Math.round(ratio * 26);
          const color = d.isToday ? c.primary : d.count === 0 ? c.border : c.primary + '55';
          return (
            <View key={d.date.toISOString()} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              {/* 0인 날은 숫자를 아예 그리지 않는다. 투명하게만 두면 눈에는 안 보여도
                  스크린리더는 "0"을 읽어 빈 날마다 잡음이 된다.
                  자리는 아래 빈 막대가 지켜 주므로 간격은 무너지지 않는다. */}
              <Text
                style={{ color: c.textSecondary, fontSize: 10 * fs, fontFamily: fontMono, minHeight: 13 * fs }}
              >
                {d.count > 0 ? d.count : ''}
              </Text>
              <View
                style={{ width: '100%', height, borderRadius: 3, backgroundColor: color }}
              />
              <Text
                style={{
                  color: d.isToday ? c.primary : c.textSecondary,
                  fontSize: 10.5 * fs,
                  fontFamily: fontBody,
                  fontWeight: d.isToday ? '700' : '400',
                }}
              >
                {d.isToday ? '오늘' : WEEKDAY[d.date.getDay()]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
