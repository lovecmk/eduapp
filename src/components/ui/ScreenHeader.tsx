import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { ROUTES } from '../../constants/routes';

/**
 * 뒤로가기 헤더 — 스택으로 push 된 화면(알림/설정/컨텐츠/상세)에서 공통 사용.
 * 상태바(노치) 안전영역을 처리하고 높이·타이포를 통일한다.
 */
export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // 돌아갈 화면이 없을 때(웹 주소로 직접 진입, 알림 딥링크로 바로 열림, 앱 재시작 후 복원)
  // router.back() 은 아무 일도 하지 않는다. 그러면 헤더의 ← 버튼이 먹통이 되어
  // 사용자가 그 화면에 갇힌다. 그럴 땐 홈으로 보내 반드시 빠져나갈 길을 남긴다.
  const back =
    onBack ??
    (() => {
      if (router.canGoBack()) router.back();
      else router.replace(ROUTES.home as never);
    });

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        {/* 아이콘만 있는 버튼은 스크린리더가 읽을 텍스트가 없다 — 라벨을 명시한다. */}
        <Pressable onPress={back} hitSlop={8} style={{ padding: 8 }} accessibilityRole="button" accessibilityLabel="뒤로 가기">
          <Ionicons name="chevron-back" size={24} color={c.primary} />
        </Pressable>
        <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 16, flex: 1 }} numberOfLines={1}>
          {title}
        </Text>
        {right ? <View style={{ marginRight: 8 }}>{right}</View> : null}
      </View>
    </View>
  );
}
