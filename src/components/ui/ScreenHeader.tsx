import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';

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
  const back = onBack ?? (() => router.back());

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        <Pressable onPress={back} hitSlop={8} style={{ padding: 8 }}>
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
