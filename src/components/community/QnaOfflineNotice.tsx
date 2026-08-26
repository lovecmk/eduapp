import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay } from '../../theme/tokens';
import { useDegraded } from '../../hooks/useDegraded';

/**
 * 질문 & 답변이 아직 서버에 붙지 않았음을 알리는 줄.
 *
 * 문구는 '연결되지 않았다'가 아니라 '준비 중'이다. 앱은 서버에 멀쩡히 붙어 있고
 * 학습·통계는 실제 데이터로 돌고 있는데, 이 기능만 라우트가 없는 상태다. 그런데
 * '서버에 연결되지 않았어요' 라고 쓰면 사용자도 운영자도 **앱 전체가 오프라인이라고**
 * 읽는다 — 실제로 그렇게 오해해 서버부터 뒤진 일이 있었다.
 *
 * 서버에 `/inner/api/v1/qna` 라우트가 열리기 전까지 질문·답변은 이 기기 안에서만 돈다.
 * 그 사실을 말하지 않으면 화면은 평소와 똑같아서, 사용자는 자기 질문이 동료들에게
 * 갔다고 믿는다. 그리고 아무 답도 달리지 않는 것을 보고 "여긴 아무도 안 본다"로
 * 읽는다 — 실제로는 애초에 아무에게도 가지 않았다. 기능이 없는 것보다,
 * 있는 척하는 것이 신뢰를 더 깎는다.
 *
 * 라우트가 열리면 저장소가 실서버로 올라서고 이 줄은 스스로 사라진다
 * (강등 장부를 구독한다 — useDegraded).
 */
export function QnaOfflineNotice() {
  const { theme } = useTheme();
  const c = theme.colors;
  // 판단 기준은 강등 장부 하나다. 목업 전용 빌드(주소 없음)는 애초에 실서버를 부르지
  // 않아 장부에도 오르지 않지만, 그 빌드는 '서버 없이 화면만' 보려고 만드는 개발용이라
  // 사용자에게 가지 않는다 — 규칙을 둘로 늘릴 값어치가 없다.
  const degraded = useDegraded('qna');

  if (!degraded) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        backgroundColor: c.surfaceAlt,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 12,
      }}
    >
      <Ionicons name="construct-outline" size={15} color={c.textSecondary} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.textPrimary, fontSize: 12.5, fontFamily: fontDisplay }}>
          질문 & 답변은 준비 중이에요
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 11.5, lineHeight: 16, marginTop: 2, fontFamily: fontBody }}>
          아직 열리지 않은 기능이라, 올린 질문과 답변은 이 기기에만 저장되고 다른 사람에게는 보이지 않아요.
        </Text>
      </View>
    </View>
  );
}
