import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody } from '../../theme/tokens';

/**
 * 이미지 문제용 이미지 뷰 — 로딩 중 스켈레톤, 실패 시 아이콘 폴백으로 깨진 이미지를 방지.
 * imageUrl 은 백엔드가 내려주는 실제 URL(또는 목업 원격 이미지)을 그대로 사용한다.
 */
export function QuestionImage({ uri, height = 190 }: { uri: string; height?: number }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  return (
    <View style={[styles.wrap, { height, backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
      {!failed && (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setFailed(true); setLoading(false); }}
        />
      )}

      {loading && !failed && (
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} />
        </View>
      )}

      {failed && (
        <View style={styles.center}>
          <Ionicons name="image-outline" size={30} color={c.textSecondary} />
          <Text style={[styles.failText, { color: c.textSecondary }]}>이미지를 불러올 수 없어요</Text>
        </View>
      )}

      <View style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
        <Ionicons name="image" size={11} color="#fff" />
        <Text style={styles.badgeText}>이미지 문제</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 6 },
  failText: { fontSize: 12, fontFamily: fontBody },
  badge: {
    position: 'absolute', top: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
