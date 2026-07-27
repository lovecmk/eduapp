import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { describePlan, type ReviewPlan } from '../../domain/reviewPlan';

/**
 * 오늘의 복습 지시 카드.
 *
 * 이 화면에서 사용자가 해야 할 결정은 **하나뿐**이어야 한다: 지금 시작할지 말지.
 * 무엇을 볼지는 이미 간격반복 엔진이 정했고, 그 판단이 사람의 선택보다 정확하다.
 * 선택지를 여러 개 늘어놓으면 고르는 데 힘을 쓰고 정작 복습은 미루게 된다.
 *
 * 급한 정도에 따라 생김새가 달라진다. 기한이 지났을 때만 강조색을 쓰고,
 * 평소에는 차분하게 둔다 — 늘 빨갛게 칠해 두면 아무 신호도 되지 못한다.
 */
export function ReviewPlanCard({ plan, onStart }: { plan: ReviewPlan; onStart: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const { title, detail } = describePlan(plan);

  const hasWork = plan.queue.length > 0;
  const urgent = plan.urgency === 'overdue';

  // 할 일이 없을 때는 '쉬어 가는 상태'로 보여 준다.
  // 복습이 비어 있는 것은 잘 해낸 결과지 실패가 아니다.
  if (!hasWork) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: c.surface,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: c.border,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            backgroundColor: c.success + '18',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={plan.urgency === 'empty' ? 'leaf-outline' : 'checkmark-done'}
            size={22}
            color={c.success}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>{title}</Text>
          <Text
            style={{ color: c.textSecondary, fontSize: 12 * fs, marginTop: 2, fontFamily: fontBody }}
          >
            {detail}
          </Text>
        </View>
      </View>
    );
  }

  const accent = urgent ? c.warning : c.primary;

  return (
    <Pressable
      onPress={onStart}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      style={{
        backgroundColor: accent,
        borderRadius: 16,
        padding: 16,
        boxShadow: urgent ? '0 6px 16px rgba(217,119,6,0.26)' : '0 6px 16px rgba(37,99,235,0.24)',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={urgent ? 'alarm' : 'flash'} size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 16 * fs, fontFamily: fontDisplay }}>{title}</Text>
          <Text
            style={{
              color: 'rgba(255,255,255,0.88)',
              fontSize: 12 * fs,
              marginTop: 3,
              lineHeight: 17 * fs,
              fontFamily: fontBody,
            }}
          >
            {detail}
          </Text>
        </View>
      </View>

      {/* 구성 요약 — 숫자를 쪼개 보여 주면 '왜 이 장수인지'가 납득된다. */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {plan.overdue > 0 && <Chip label="기한 지남" value={plan.overdue} />}
        {plan.dueToday > 0 && <Chip label="오늘 예정" value={plan.dueToday} />}
        {plan.fragile > 0 && <Chip label="자주 잊음" value={plan.fragile} />}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginTop: 14,
          backgroundColor: 'rgba(255,255,255,0.18)',
          borderRadius: 12,
          paddingVertical: 11,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 14 * fs, fontFamily: fontDisplay }}>지금 시작하기</Text>
        <Ionicons name="arrow-forward" size={16} color="#fff" />
      </View>
    </Pressable>
  );
}

function Chip({ label, value }: { label: string; value: number }) {
  const { fontScale: fs } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 * fs, fontFamily: fontBody }}>
        {label}
      </Text>
      <Text style={{ color: '#fff', fontSize: 12 * fs, fontFamily: fontMono, fontWeight: '800' }}>
        {value}
      </Text>
    </View>
  );
}
