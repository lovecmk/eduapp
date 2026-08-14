import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody, fontCute } from '../../theme/tokens';
import { getCategoryColor } from '../../constants/categories';
import { minutesSince, type Question } from '../../domain/models/Qna';
import { timeAgoLabel } from '../../store/notificationStore';

/**
 * '답변을 기다리는 질문' 카드 — 커뮤니티 활성화의 핵심 장치.
 *
 * 커뮤니티가 죽는 가장 흔한 이유는 "질문은 올라오는데 아무도 답을 안 다는 것"이다.
 * 답이 없으면 질문자도 다시 오지 않는다. 그래서 **아직 답변이 0개인 질문 딱 한 건**을
 * 골라 "당신이 도울 수 있다"고 조용히 권한다.
 *
 * 피로감을 주지 않기 위한 규칙:
 *  · 푸시·뱃지·배너 없이 **커뮤니티 화면 안에서만** 보인다.
 *  · 한 번에 **한 건만** 보여준다(목록으로 몰아주면 부담이 된다).
 *  · 답변 대기 질문이 없으면 **아무것도 렌더하지 않는다**(빈 상태 안내조차 노이즈).
 *  · 내가 올린 질문은 제외한다(내 질문에 내가 답할 일은 없다).
 */
/**
 * 강조할 질문 한 건을 고른다 — 아직 아무도 답하지 않은, 남이 올린 질문 중
 * 가장 오래 기다린 것. (오래 방치될수록 커뮤니티 신뢰가 깎인다)
 * 화면이 이 결과를 알아야 아래 목록에서 중복 제거를 할 수 있어 밖으로 뺐다.
 */
export function pickHelpWanted(questions: Question[]): Question | null {
  // 답변 수는 카운터로 본다 — 목록 응답에는 답변 본문이 실리지 않는다.
  const waiting = questions.filter((q) => !q.mine && q.answerCount === 0);
  if (waiting.length === 0) return null;
  // 가장 오래 기다린 = 가장 먼저 올라온(작성 시각이 가장 이른) 질문.
  return waiting.reduce((a, b) => (b.createdAt < a.createdAt ? b : a));
}

export function HelpWantedCard({
  question: target,
  onPress,
}: {
  question: Question | null;
  onPress: (id: string) => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  if (!target) return null;

  const accent = getCategoryColor(target.category ?? '') ?? c.primary;

  return (
    <Pressable accessibilityRole="button"
      onPress={() => onPress(target.id)}
      style={{
        backgroundColor: c.surface,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: c.primary + '40',
        padding: 16,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Ionicons name="hand-right" size={15} color={c.primary} />
        <Text style={{ color: c.primary, fontSize: 12.5, fontFamily: fontDisplay }}>답변을 기다리고 있어요</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody }}>
          {timeAgoLabel(minutesSince(target.createdAt))}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <View style={{ backgroundColor: accent + '1A', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
          <Text style={{ color: accent, fontSize: 10.5, fontFamily: fontDisplay }}>{target.category}</Text>
        </View>
      </View>

      <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 14.5, lineHeight: 20, fontFamily: fontDisplay }}>
        {target.title}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          marginTop: 12,
          backgroundColor: c.primary + '12',
          borderRadius: 10,
          paddingVertical: 9,
        }}
      >
        <Ionicons name="chatbubble-ellipses" size={14} color={c.primary} />
        <Text style={{ color: c.primary, fontSize: 13, fontFamily: fontCute }}>알고 있다면 답변해주세요</Text>
      </View>
    </Pressable>
  );
}
