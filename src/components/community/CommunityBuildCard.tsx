import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { useCommunity } from '../../hooks/useCommunity';

/** 한 층을 올리는 데 필요한 공동 문제 수. */
const FLOOR_SIZE = 20_000;

// 층수 마일스톤 보상 — 함께 쌓은 학습이 콘텐츠/혜택으로 전환.
const MILESTONES: { floor: number; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { floor: 5, label: '신규 카드팩 공개', icon: 'albums' },
  { floor: 10, label: '한정 "빌더" 뱃지', icon: 'ribbon' },
  { floor: 20, label: '심화 문제 해금', icon: 'flame' },
  { floor: 35, label: '명예의 전당 등재', icon: 'trophy' },
  { floor: 50, label: '오프라인 안전 캠페인 후원', icon: 'heart' },
];

/** 미니 빌딩 일러스트 — 층수에 맞춰 자라나고 최상층은 시공 중. */
function BuildingArt({ progress, color, base }: { progress: number; color: string; base: string }) {
  const floors = [0, 1, 2, 3, 4]; // 아래→위(장식용 5층)
  return (
    <View style={{ width: 76, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, marginBottom: 2 }}>🏗️</Text>
      {floors.map((f, i) => {
        const isTop = i === 0;
        return (
          <View key={f} style={{
            width: 52 - i * 2, height: 15, borderRadius: 4, marginBottom: 3,
            backgroundColor: isTop ? color + '55' : color, opacity: isTop ? 0.9 : 1,
            borderWidth: isTop ? 1 : 0, borderColor: color, borderStyle: 'dashed',
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}>
            {!isTop && [0, 1, 2].map((w) => <View key={w} style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.75)' }} />)}
          </View>
        );
      })}
      <View style={{ width: 60, height: 5, borderRadius: 2, backgroundColor: base }} />
    </View>
  );
}

/** 함께 짓는 안전 빌딩 — 커뮤니티 누적 학습이 가상 빌딩을 층층이 올린다. */
export function CommunityBuildCard() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { data } = useCommunity();
  if (!data) return null;

  const total = data.totalCardsAllTime;
  const floors = Math.floor(total / FLOOR_SIZE);
  const within = total % FLOOR_SIZE;
  const progress = Math.round((within / FLOOR_SIZE) * 100);
  const next = MILESTONES.find((m) => m.floor > floors);

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <Ionicons name="business" size={16} color={c.primary} />
        <Text style={{ color: c.textPrimary, fontSize: 15, fontFamily: fontDisplay }}>함께 짓는 안전 빌딩</Text>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 12, marginBottom: 14, fontFamily: fontBody }}>
        점검자들이 함께 푼 문제가 모여 빌딩을 올려요
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <BuildingArt progress={progress} color={c.primary} base={c.border} />

        <View style={{ flex: 1 }}>
          <Text style={{ color: c.textPrimary, fontSize: 26, fontFamily: fontMono, fontWeight: '900' }}>
            {floors}<Text style={{ fontSize: 15, color: c.textSecondary, fontFamily: fontBody }}>층 완성</Text>
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontMono, marginTop: 2 }}>
            누적 {total.toLocaleString()}문제
          </Text>

          {/* 다음 층 진행 */}
          <View style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody }}>{floors + 1}층까지</Text>
              <Text style={{ color: c.primary, fontSize: 11, fontFamily: fontMono }}>{progress}%</Text>
            </View>
            <View style={{ height: 7, backgroundColor: c.surfaceAlt, borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ width: `${progress}%`, height: '100%', backgroundColor: c.primary, borderRadius: 4 }} />
            </View>
          </View>
        </View>
      </View>

      {/* 다음 보상 */}
      {next && (
        <View style={[styles.reward, { backgroundColor: c.warning + '12', borderColor: c.warning + '33' }]}>
          <View style={[styles.rewardIcon, { backgroundColor: c.warning + '22' }]}>
            <Ionicons name={next.icon} size={16} color={c.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody }}>다음 보상 · {next.floor}층</Text>
            <Text style={{ color: c.textPrimary, fontSize: 13, fontFamily: fontDisplay }}>{next.label}</Text>
          </View>
          <Text style={{ color: c.warning, fontSize: 12, fontFamily: fontMono }}>-{next.floor - floors}층</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, padding: 16, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 10, marginTop: 14 },
  rewardIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
