import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { useCommunity } from '../../hooks/useCommunity';
import { useFactionStore } from '../../store/factionStore';
import {
  FACTIONS,
  getFaction,
  factionStandings,
  type BuildingVariant,
  type FactionId,
} from '../../constants/factions';
import { ROUTES } from '../../constants/routes';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// 층수 마일스톤 보상 — 함께 쌓은 학습이 콘텐츠/혜택으로 전환.
const MILESTONES: { floor: number; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { floor: 5, label: '신규 카드팩 공개', icon: 'albums' },
  { floor: 10, label: '한정 "빌더" 뱃지', icon: 'ribbon' },
  { floor: 20, label: '심화 문제 해금', icon: 'flame' },
  { floor: 35, label: '명예의 전당 등재', icon: 'trophy' },
  { floor: 50, label: '오프라인 안전 캠페인 후원', icon: 'heart' },
];

/** 'YYYY-MM' → 결정적 정수 시드(대항전 순위 흔들기용). */
function monthToSeed(month: string): number {
  return month.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
}

/** 진영 상세의 작은 지표 타일(지은 층수·기여 문제·전체 비중). */
function FactionStat({ color, value, label, c }: { color: string; value: string; label: string; c: Record<string, string> }) {
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
      <Text numberOfLines={1} style={{ color, fontSize: 14, fontFamily: fontMono, fontWeight: '900' }}>{value}</Text>
      <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: 10, fontFamily: fontBody, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

/** 미니 빌딩 일러스트 — 층수에 맞춰 자라나고 최상층은 시공 중. 진영마다 실루엣이 다르다. */
function BuildingArt({ color, base, variant }: { color: string; base: string; variant: BuildingVariant }) {
  const floors = [0, 1, 2, 3, 4]; // i=0 이 최상층(가장 위), 아래로 갈수록 i 증가
  const topEmoji = variant === 'blaze' ? '🔥' : variant === 'bolt' ? '⚡' : '🏗️';
  return (
    <View style={{ width: 76, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, marginBottom: 2 }}>{topEmoji}</Text>
      {floors.map((f, i) => {
        const isTop = i === 0;
        // blaze: 아래로 갈수록 넓어지는 불꽃 실루엣 / bolt: 좌우로 번갈아 밀리는 번개 실루엣 / tower: 균일한 탑.
        const width = variant === 'blaze' ? 40 + i * 4 : 52 - i * 2;
        const shift = variant === 'bolt' ? (i % 2 === 0 ? -6 : 6) : 0;
        const rad = variant === 'bolt' ? 3 : 5;
        return (
          <View key={f} style={{
            width, height: 15, borderRadius: rad, marginBottom: 3, marginLeft: shift,
            backgroundColor: isTop ? color + '55' : color, opacity: isTop ? 0.9 : 1,
            borderWidth: isTop ? 1 : 0, borderColor: color, borderStyle: 'dashed',
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}>
            {!isTop && [0, 1, 2].map((w) => <View key={w} style={{ width: 5, height: 5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)' }} />)}
          </View>
        );
      })}
      <View style={{ width: variant === 'blaze' ? 64 : 60, height: 5, borderRadius: 2, backgroundColor: base }} />
    </View>
  );
}

/** 함께 짓는 안전 빌딩 — 매월 초기화되며 커뮤니티 누적 학습이 빌딩을 층층이 올린다. */
export function CommunityBuildCard() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { data } = useCommunity();
  const factionId = useFactionStore((s) => s.faction);
  const myFaction = getFaction(factionId);
  const [showHistory, setShowHistory] = useState(false);
  // 탭해서 펼친 진영(안전 빌딩 기여 상세를 보여준다).
  const [openFaction, setOpenFaction] = useState<FactionId | null>(null);
  if (!data) return null;

  const { current, floorSize, history } = data.building;
  const floors = current.floors;
  const within = current.problems % floorSize;
  const progress = Math.round((within / floorSize) * 100);
  const next = MILESTONES.find((m) => m.floor > floors);
  const bestFloors = Math.max(floors, ...history.map((h) => h.floors), 0);

  // 진영 색·형태 — 진영을 골랐으면 그 색/실루엣으로, 아니면 기본 테마색·탑 형태로.
  const buildColor = myFaction?.color ?? c.primary;
  const buildVariant = myFaction?.building ?? 'tower';

  // 진영 대항전 — 이번 달 커뮤니티 누적 문제를 세 진영으로 분배해 순위를 만든다.
  const standings = factionStandings(current.problems, floorSize, monthToSeed(current.month));
  // 진영 상세(탭하면 그 진영이 안전 빌딩을 얼마나 지었는지 펼쳐 본다).
  const contestTotal = standings.reduce((a, s) => a + s.problems, 0) || 1;
  const leadFloors = standings[0]?.floors ?? 0;

  const toggleHistory = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowHistory((s) => !s);
  };

  const toggleFaction = (id: FactionId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenFaction((prev) => (prev === id ? null : id));
  };

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <Ionicons name="business" size={16} color={buildColor} />
        <Text style={{ color: c.textPrimary, fontSize: 15, fontFamily: fontDisplay }}>함께 짓는 안전 빌딩</Text>
        <View style={{ backgroundColor: buildColor + '18', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 4 }}>
          <Text style={{ color: buildColor, fontSize: 10.5, fontFamily: fontDisplay }}>{current.label}</Text>
        </View>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 12, marginBottom: 14, fontFamily: fontBody }}>
        {myFaction
          ? `${myFaction.emoji} ${myFaction.name} 진영이 함께 올리는 층수 🏢`
          : '매달 새로 지어요 · 이번 달 점검자들이 함께 올린 층수 🏢'}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <BuildingArt color={buildColor} base={c.border} variant={buildVariant} />

        <View style={{ flex: 1 }}>
          <Text style={{ color: c.textPrimary, fontSize: 26, fontFamily: fontMono, fontWeight: '900' }}>
            {floors}<Text style={{ fontSize: 15, color: c.textSecondary, fontFamily: fontBody }}>층 완성</Text>
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontMono, marginTop: 2 }}>
            이번 달 {current.problems.toLocaleString()}문제
          </Text>

          {/* 다음 층 진행 */}
          <View style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody }}>{floors + 1}층까지</Text>
              <Text style={{ color: buildColor, fontSize: 11, fontFamily: fontMono }}>{progress}%</Text>
            </View>
            <View style={{ height: 7, backgroundColor: c.surfaceAlt, borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ width: `${progress}%`, height: '100%', backgroundColor: buildColor, borderRadius: 4 }} />
            </View>
          </View>
        </View>
      </View>

      {/* 진영 대항전 — 세 진영이 이번 달 올린 층수 비교 */}
      <View style={[styles.versus, { borderTopColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Ionicons name="flag" size={14} color={c.textSecondary} />
          <Text style={{ color: c.textPrimary, fontSize: 13, fontFamily: fontDisplay, flex: 1 }}>진영 대항전 · 이번 달</Text>
          {!myFaction && (
            <Pressable onPress={() => router.push(ROUTES.factionSelect as never)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={{ color: c.primary, fontSize: 11.5, fontFamily: fontDisplay }}>진영 선택</Text>
              <Ionicons name="chevron-forward" size={13} color={c.primary} />
            </Pressable>
          )}
        </View>

        {standings.map((s, rank) => {
          const f = FACTIONS[s.id];
          const isMine = s.id === factionId;
          const topFloors = standings[0].floors || 1;
          const pct = Math.max(6, Math.round((s.floors / topFloors) * 100));
          const isOpen = openFaction === s.id;
          // 이 진영이 안전 빌딩을 얼마나 지었는지(상세).
          const within = s.problems % floorSize;
          const floorProgress = Math.round((within / floorSize) * 100);
          const share = Math.round((s.problems / contestTotal) * 100);
          const gap = leadFloors - s.floors;
          return (
            <View key={s.id}>
              <Pressable
                onPress={() => toggleFaction(s.id)}
                style={[styles.vsRow, isMine && { backgroundColor: f.color + '12', borderRadius: 10 }]}
              >
                <Text style={{ width: 16, color: c.textSecondary, fontSize: 12, fontFamily: fontMono, textAlign: 'center' }}>{rank + 1}</Text>
                <Text style={{ fontSize: 15, width: 22, textAlign: 'center' }}>{f.emoji}</Text>
                <View style={{ width: 54 }}>
                  <Text style={{ color: isMine ? f.color : c.textPrimary, fontSize: 12.5, fontFamily: fontDisplay }} numberOfLines={1}>
                    {f.name}{isMine ? ' (나)' : ''}
                  </Text>
                </View>
                <View style={{ flex: 1, height: 8, backgroundColor: c.surfaceAlt, borderRadius: 4, overflow: 'hidden', marginHorizontal: 8 }}>
                  <View style={{ width: `${pct}%`, height: '100%', backgroundColor: f.color, borderRadius: 4 }} />
                </View>
                <Text style={{ color: c.textPrimary, fontSize: 12.5, fontFamily: fontMono, fontWeight: '800', width: 34, textAlign: 'right' }}>{s.floors}층</Text>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={c.textSecondary} style={{ marginLeft: 4, width: 16 }} />
              </Pressable>

              {/* 탭하면 펼쳐지는 상세 — 이 진영이 안전 빌딩을 얼마나 지었는지 */}
              {isOpen && (
                <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, marginTop: 4, marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <Ionicons name="business" size={14} color={f.color} />
                    <Text style={{ color: c.textPrimary, fontSize: 12.5, fontFamily: fontDisplay, flex: 1 }}>
                      {f.emoji} {f.name} 진영의 안전 빌딩
                    </Text>
                    <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontBody }}>{rank === 0 ? '🏆 선두' : `선두와 ${gap}층 차`}</Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                    <FactionStat color={f.color} value={`${s.floors}층`} label="지은 층수" c={c} />
                    <FactionStat color={f.color} value={s.problems.toLocaleString()} label="기여 문제" c={c} />
                    <FactionStat color={f.color} value={`${share}%`} label="전체 비중" c={c} />
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody }}>{s.floors + 1}층까지</Text>
                    <Text style={{ color: f.color, fontSize: 11, fontFamily: fontMono }}>{floorProgress}% · {within.toLocaleString()}/{floorSize.toLocaleString()}문제</Text>
                  </View>
                  <View style={{ height: 7, backgroundColor: c.bg, borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.max(3, floorProgress)}%`, height: '100%', backgroundColor: f.color, borderRadius: 4 }} />
                  </View>

                  {isMine ? (
                    <Text style={{ color: f.color, fontSize: 11, fontFamily: fontBody, marginTop: 8 }}>
                      {f.emoji} 내 진영이에요 · 학습 한 장이 곧 한 벽돌이 돼요
                    </Text>
                  ) : (
                    <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody, marginTop: 8 }}>
                      {f.tagline}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
        <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontBody, marginTop: 8, textAlign: 'center' }}>
          진영을 눌러 안전 빌딩 기여를 확인해요 · 한 층 = {floorSize.toLocaleString()}문제
        </Text>
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

      {/* 지난 기록(히스토리) */}
      {history.length > 0 && (
        <>
          <Pressable onPress={toggleHistory} style={[styles.historyToggle, { borderTopColor: c.border }]}>
            <Ionicons name="time-outline" size={15} color={c.textSecondary} />
            <Text style={{ color: c.textSecondary, fontSize: 12.5, fontFamily: fontDisplay, flex: 1 }}>지난 달 기록</Text>
            {bestFloors > 0 && (
              <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontMono, marginRight: 4 }}>최고 {bestFloors}층</Text>
            )}
            <Ionicons name={showHistory ? 'chevron-up' : 'chevron-down'} size={16} color={c.textSecondary} />
          </Pressable>

          {showHistory && (
            <View style={{ marginTop: 4 }}>
              {history.map((h) => {
                const pct = bestFloors > 0 ? Math.round((h.floors / bestFloors) * 100) : 0;
                // 지난 달 기록은 그 달 '우승 진영' 색으로 표시(달마다 색이 다르다).
                const wf = FACTIONS[h.winner as FactionId] ?? myFaction;
                const barColor = wf?.color ?? buildColor;
                return (
                  <View key={h.month} style={styles.histRow}>
                    <Text style={{ width: 58, color: c.textSecondary, fontSize: 12, fontFamily: fontDisplay }}>{h.label}</Text>
                    <Text style={{ width: 20, textAlign: 'center', fontSize: 13 }}>{wf?.emoji ?? '🏗️'}</Text>
                    <View style={{ flex: 1, height: 8, backgroundColor: c.surfaceAlt, borderRadius: 4, overflow: 'hidden', marginRight: 10 }}>
                      <View style={{ width: `${Math.max(6, pct)}%`, height: '100%', backgroundColor: barColor + 'CC', borderRadius: 4 }} />
                    </View>
                    <Text style={{ color: c.textPrimary, fontSize: 12.5, fontFamily: fontMono, fontWeight: '800' }}>{h.floors}층</Text>
                  </View>
                );
              })}
              <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontBody, marginTop: 6, textAlign: 'center' }}>
                한 층 = {floorSize.toLocaleString()}문제 · 색은 그 달 우승 진영 · 매월 1일 0층부터 다시 시작해요
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, padding: 16, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  versus: { borderTopWidth: 1, marginTop: 14, paddingTop: 12 },
  vsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 4 },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 10, marginTop: 14 },
  rewardIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  historyToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, marginTop: 14, paddingTop: 12 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
});
