import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { hapticSuccess } from '../../utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontDisplay, fontBody, fontMono, fontCute } from '../../theme/tokens';
import { useAttendanceStore } from '../../store/attendanceStore';
import { dateKey } from '../../utils/dateKey';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 최근 7일(오늘 포함) 날짜 목록 — 왼→오, 오늘이 맨 오른쪽. */
function last7Days(): { key: string; label: string; dow: number; isToday: boolean }[] {
  const out = [];
  const today = dateKey(new Date());
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    out.push({ key, label: `${d.getDate()}`, dow: d.getDay(), isToday: key === today });
  }
  return out;
}

/**
 * 접속 출석 도장 — 하루 1회 도장을 찍고 연속(스트릭)·이번 달·누적 출석을 보여준다.
 * 최근 7일을 도장 스트립으로 시각화한다.
 */
export function AttendanceStampCard() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const stamps = useAttendanceStore((s) => s.stamps);
  const checkIn = useAttendanceStore((s) => s.checkIn);
  const hasToday = useAttendanceStore((s) => s.hasCheckedInToday);
  const streakFn = useAttendanceStore((s) => s.currentStreak);
  const totalFn = useAttendanceStore((s) => s.totalDays);

  const now = new Date();
  const days = useMemo(() => last7Days(), []);
  // stamps 가 바뀔 때마다 재계산되도록 파생값을 여기서 읽는다.
  const checkedToday = !!stamps[dateKey(now)];
  const streak = streakFn();
  const total = totalFn();
  const monthCount = useMemo(() => {
    const prefix = `${now.getFullYear()}-${now.getMonth()}-`;
    return Object.keys(stamps).filter((k) => k.startsWith(prefix)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamps]);

  const onCheckIn = () => {
    const ok = checkIn();
    if (ok) hapticSuccess();
    void hasToday; void streakFn; // 셀렉터 참조 유지
  };

  return (
    <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.card, padding: 16, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="ribbon" size={18} color={c.primary} />
          <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>출석 체크</Text>
        </View>
        {streak > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FF6B35' + '18', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
            <Text style={{ fontSize: 12 }}>🔥</Text>
            <Text style={{ color: '#FF6B35', fontSize: 12, fontFamily: fontMono, fontWeight: '800' }}>{streak}일 연속</Text>
          </View>
        )}
      </View>

      {/* 최근 7일 도장 스트립 */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
        {days.map((d) => {
          const stamped = !!stamps[d.key];
          return (
            <View key={d.key} style={{ alignItems: 'center', gap: 5 }}>
              <Text style={{ color: d.dow === 0 ? '#EF4444' : d.dow === 6 ? '#3B82F6' : c.textSecondary, fontSize: 10.5, fontFamily: fontBody }}>{DOW[d.dow]}</Text>
              <View style={{
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: stamped ? c.primary : c.surfaceAlt,
                borderWidth: d.isToday ? 2 : 1,
                borderColor: d.isToday ? c.primary : c.border,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {stamped ? (
                  <Ionicons name="checkmark-sharp" size={18} color="#fff" />
                ) : (
                  <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontMono }}>{d.label}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* 체크인 버튼 */}
      {checkedToday ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.success + '18', borderRadius: 14, paddingVertical: 13 }}>
          <Ionicons name="checkmark-circle" size={19} color={c.success} />
          <Text style={{ color: c.success, fontSize: 14.5 * fs, fontFamily: fontCute, fontWeight: '800' }}>오늘 출석 완료!</Text>
        </View>
      ) : (
        <Pressable onPress={onCheckIn}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 13, boxShadow: '0 6px 16px rgba(37,99,235,0.25)' }}>
          <Ionicons name="hand-left" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 14.5 * fs, fontFamily: fontCute, fontWeight: '800' }}>오늘 출석 도장 찍기</Text>
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 }}>
        <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontBody }}>이번 달 {monthCount}일</Text>
        <Text style={{ color: c.border, fontSize: 11.5 }}>·</Text>
        <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontBody }}>누적 {total}일</Text>
      </View>
    </View>
  );
}
