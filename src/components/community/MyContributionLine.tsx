import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay } from '../../theme/tokens';
import type { Question } from '../../domain/models/Qna';

/**
 * 내 커뮤니티 기여 한 줄 — "내가 남을 도왔다"는 사실을 조용히 되돌려준다.
 *
 * 사람은 자기 행동이 누군가에게 닿았다는 걸 알 때 다시 참여한다.
 * 다만 이걸 배너·팝업으로 만들면 자랑 강요처럼 느껴지므로,
 * **한 줄 텍스트**로만 두고 기여가 없으면 아예 보여주지 않는다.
 */
export function MyContributionLine({ questions }: { questions: Question[] }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;

  const stat = useMemo(() => {
    let answers = 0;
    let helped = 0; // 내가 답변을 단 '질문 수' = 도운 사람 수
    for (const q of questions) {
      // 목록 응답에는 답변 본문이 없다 — 서버가 세어 준 '내 답변 수'를 쓴다.
      if (q.myAnswerCount > 0) {
        answers += q.myAnswerCount;
        helped += 1;
      }
    }
    return { answers, helped, asked: questions.filter((q) => q.mine).length };
  }, [questions]);

  // 아직 아무 기여도 없으면 침묵한다(빈 상태를 굳이 알리지 않는다).
  if (stat.answers === 0 && stat.asked === 0) return null;

  const parts: string[] = [];
  if (stat.answers > 0) parts.push(`답변 ${stat.answers}개로 ${stat.helped}명을 도왔어요`);
  if (stat.asked > 0) parts.push(`질문 ${stat.asked}개`);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: c.success + '12',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 9,
        marginBottom: 12,
      }}
    >
      <Ionicons name="sparkles" size={14} color={c.success} />
      <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontBody, flex: 1 }} numberOfLines={1}>
        <Text style={{ color: c.success, fontFamily: fontDisplay }}>나의 기여 </Text>
        {parts.join(' · ')}
      </Text>
    </View>
  );
}
