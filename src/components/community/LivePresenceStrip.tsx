import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay } from '../../theme/tokens';
import { useCommunity } from '../../hooks/useCommunity';
import { ROUTES } from '../../constants/routes';

/** 홈 상단의 오늘 학습 인원. 서버의 한국 날짜 기준 집계를 쓰며, 탭하면 커뮤니티로 이동한다. */
export function LivePresenceStrip() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { data } = useCommunity();

  if (!data) return null;
  const message = data.studiedToday > 0
    ? `오늘 ${data.studiedToday.toLocaleString('ko-KR')}명이 학습을 완료했어요`
    : '오늘의 첫 학습을 완료해 보세요';

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={message} accessibilityHint="커뮤니티로 이동" onPress={() => router.push(ROUTES.community)} style={[styles.strip, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
      <Ionicons name="checkmark-circle-outline" size={18} color={c.success} />
      <Text style={{ color: c.textPrimary, fontSize: 12.5 * fs, lineHeight: 18 * fs, fontFamily: fontDisplay, flex: 1 }}>{message}</Text>
      <Ionicons name="chevron-forward" size={14} color={c.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, borderWidth: 1, minHeight: 44, paddingHorizontal: 14, paddingVertical: 9, marginBottom: 14 },
});
