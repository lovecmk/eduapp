import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontMono, fontCute } from '../../theme/tokens';
import { SYSTEM_STATUS_META } from '../../domain/models/SystemHealth';
import { useSystemHealth } from '../../hooks/useSystemHealth';

/** 은은하게 확장·소멸을 반복하는 상태 표시등(펄스). */
function PulseDot({ color }: { color: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(2.6, { duration: 1400, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 0 }),
      ),
      -1,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 1400, easing: Easing.out(Easing.ease) }),
        withTiming(0.6, { duration: 0 }),
      ),
      -1,
    );
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.dotWrap}>
      <Animated.View style={[styles.ring, { backgroundColor: color }, ringStyle]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.metricValue, { color: c.textPrimary }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: c.textSecondary }]}>{label}</Text>
    </View>
  );
}

/**
 * 백엔드 연결 상태 실시간 모니터링 위젯.
 * 20초마다 헬스체크를 폴링하며, 성공률/지연/상태를 펄스 인디케이터와 함께 보여준다.
 */
export function SystemStatusCard() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { data, isLoading, isError } = useSystemHealth();

  const meta = isError
    ? SYSTEM_STATUS_META.down
    : data
      ? SYSTEM_STATUS_META[data.status]
      : SYSTEM_STATUS_META.operational;

  const successPct = data ? (data.successRate * 100).toFixed(1) : '—';
  const latency = data ? `${data.latencyMs}ms` : '—';

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <View style={styles.statusRow}>
          <PulseDot color={meta.color} />
          <Text style={[styles.statusLabel, { color: c.textPrimary }]}>
            {isLoading && !data ? '상태 확인 중…' : meta.label}
          </Text>
        </View>
        <View style={[styles.chip, { backgroundColor: meta.color + '1A' }]}>
          <Text style={[styles.chipText, { color: meta.color }]}>LIVE</Text>
        </View>
      </View>

      <Text style={[styles.subtitle, { color: c.textSecondary }]}>백엔드 연결 상태</Text>

      <View style={[styles.metrics, { borderTopColor: c.border }]}>
        <Metric label="성공률" value={isError ? '—' : `${successPct}%`} />
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Metric label="응답 지연" value={isError ? '—' : latency} />
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Metric label="가동" value={isError ? 'OFF' : '24/7'} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dotWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: 15, fontWeight: '800', fontFamily: fontCute },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chipText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  subtitle: { fontSize: 12, marginTop: 4 },
  metrics: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  divider: { width: 1, height: 26 },
  metricValue: { fontSize: 18, fontWeight: '900', fontFamily: fontMono, textAlign: 'center' },
  metricLabel: { fontSize: 10, marginTop: 3, textAlign: 'center' },
});
