import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody } from '../../theme/tokens';
import { describePlan, type ReviewPlan } from '../../domain/reviewPlan';

/**
 * 오늘의 복습 지시 카드.
 *
 * 이 화면에서 사용자가 해야 할 결정은 **하나뿐**이어야 한다: 지금 볼지 말지.
 * 무엇을 볼지는 이미 간격반복 엔진이 정했다. 선택지를 여러 개 늘어놓으면
 * 고르는 데 힘을 쓰고 정작 복습은 미루게 된다.
 *
 * 다만 **권할 뿐 재촉하지 않는다.** 복습은 사용자가 하기로 정하는 일이다.
 *  · 경고색·알람 아이콘을 쓰지 않는다. 늦었다는 신호를 주는 순간 안내가 독촉이 된다.
 *  · '기한 지남 2 · 오늘 예정 2' 같은 계산서를 내밀지 않는다. 숫자를 쪼개 보여 주면
 *    친절해 보이지만, 읽는 사람에게는 갚아야 할 목록이 된다.
 *  · 안 누르고 지나가는 것이 이상하지 않아야 한다. 그래서 이 카드는 화면을
 *    가로막지 않고, 바로 아래에 '직접 골라 보기'가 나란히 있다.
 */
export function ReviewPlanCard({ plan, onStart }: { plan: ReviewPlan; onStart: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const { title, detail } = describePlan(plan);

  const hasCards = plan.queue.length > 0;

  // 볼 것이 없는 날은 '쉬어 가는 상태'로 보여 준다.
  // 여기서 '오늘 치를 다 했다'고 말하면, 안 한 날은 자동으로 빚이 된다.
  if (!hasCards) {
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
          <Ionicons name="leaf-outline" size={22} color={c.success} />
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

  return (
    <Pressable
      onPress={onStart}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      style={{
        // 상태와 무관하게 늘 같은 색이다. 급할 때만 색을 바꾸면 그 색이 곧 경고가 된다.
        backgroundColor: c.primary,
        borderRadius: 16,
        padding: 16,
        boxShadow: '0 6px 16px rgba(37,99,235,0.24)',
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
          <Ionicons name="flash" size={22} color="#fff" />
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

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginTop: 16,
          backgroundColor: 'rgba(255,255,255,0.18)',
          borderRadius: 12,
          paddingVertical: 11,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 14 * fs, fontFamily: fontDisplay }}>지금 보기</Text>
        <Ionicons name="arrow-forward" size={16} color="#fff" />
      </View>
    </Pressable>
  );
}
