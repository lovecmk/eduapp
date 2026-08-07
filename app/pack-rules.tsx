import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { hapticSuccess } from '../src/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { fontCute, fontBody, fontMono, fontDisplay } from '../src/theme/tokens';
import { useAllCards } from '../src/hooks/useCards';
import { useSrsStore } from '../src/store/srsStore';
import { useAttendanceStore } from '../src/store/attendanceStore';
import { useCollectionStore, selectPacks, selectShards } from '../src/store/collectionStore';
import { evaluatePackRules, type PackRuleContext, type PackRuleProgress } from '../src/data/packRules';
import { dateKey } from '../src/utils/dateKey';
import { contentColumn } from '../src/theme/layout';

export default function PackRulesScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const { data: allCards = [] } = useAllCards();
  const history = useSrsStore((s) => s.history);
  const attStreak = useAttendanceStore((s) => s.currentStreak)();
  const attTotal = useAttendanceStore((s) => s.totalDays)();
  const packs = useCollectionStore(selectPacks);
  const shards = useCollectionStore(selectShards);
  const owned = useCollectionStore((s) => s.owned);
  const claimedRules = useCollectionStore((s) => s.claimedRules);
  const claimRule = useCollectionStore((s) => s.claimRule);
  const srsCards = useSrsStore((s) => s.cards);

  const ctx: PackRuleContext = useMemo(() => {
    const studyTotal = Object.values(history).reduce((sum, ids) => sum + ids.length, 0);
    const masteredCount = allCards.filter((k) => k.status === 'mastered').length;
    // 최근 7일 학습량이 20장 이상이면 이번 주 챌린지 완료로 간주.
    const weekKeys = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return dateKey(d); });
    const weekReviews = weekKeys.reduce((sum, k) => sum + (history[k]?.length ?? 0), 0);

    // 정확도 — SRS 상태의 누적 복습(reps)과 망각(lapses)에서 직접 뽑는다.
    // '많이 했다'가 아니라 '제대로 했다'를 보는 조건이라 표본이 적으면 잠긴다.
    let reps = 0;
    let lapses = 0;
    for (const c of Object.values(srsCards)) { reps += c.reps; lapses += c.lapses; }
    const accuracyPct = reps > 0 ? Math.round(((reps - lapses) / reps) * 100) : 0;

    // 분야별 마스터 — 한 분야를 깊게 판 사람을 인정하는 조건.
    const perCategory = new Map<string, number>();
    for (const c of allCards) {
      if (c.status !== 'mastered') continue;
      perCategory.set(c.category, (perCategory.get(c.category) ?? 0) + 1);
    }

    return {
      studyTotal,
      attendanceStreak: attStreak,
      attendanceTotal: attTotal,
      masteredCount,
      weeklyCleared: weekReviews >= 20,
      accuracyPct,
      accuracyReps: reps,
      collectedCount: Object.keys(owned).length,
      bestCategoryMastered: Math.max(0, ...perCategory.values()),
    };
  }, [history, allCards, attStreak, attTotal, srsCards, owned]);

  const progress = useMemo(() => evaluatePackRules(ctx, claimedRules), [ctx, claimedRules]);
  const totalClaimable = progress.reduce((s, p) => s + p.claimable, 0);

  // 얼마를 받을지는 스토어가 현재 상태로 다시 계산한다 — 화면은 '이 규칙을
  // 받겠다'고만 말한다. 화면이 들고 있던 값이 낡았어도 과지급되지 않는다.
  const onClaim = (ruleId: string) => {
    if (claimRule(ruleId, ctx) > 0) hapticSuccess();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="카드팩 획득 조건" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, ...contentColumn }} showsVerticalScrollIndicator={false}>
        {/* 요약 배너 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.primary, borderRadius: 18, padding: 16, marginBottom: 16, boxShadow: '0 8px 20px rgba(37,99,235,0.25)' }}>
          <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="gift" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 16 * fs, fontFamily: fontCute, fontWeight: '800' }}>보유 카드팩 {packs}개 · 조각 {shards}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 * fs, fontFamily: fontBody, marginTop: 2 }}>
              {totalClaimable > 0 ? `지금 받을 수 있는 팩 ${totalClaimable}개!` : '조건을 달성하면 카드팩을 드려요'}
            </Text>
          </View>
        </View>

        {progress.map((p) => {
          const done = p.exhausted && p.claimable === 0;
          return (
            <View key={p.rule.id} style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: p.claimable > 0 ? p.rule.color : c.border, borderRadius: 16, padding: 16, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: p.rule.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={p.rule.icon} size={20} color={p.rule.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: c.textPrimary, fontSize: 14.5 * fs, fontFamily: fontDisplay }}>{p.rule.title}</Text>
                    {p.rule.repeatable && (
                      <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                        <Text style={{ color: c.textSecondary, fontSize: 9.5, fontFamily: fontBody }}>
                          {p.rule.maxTimes ? `반복 ${p.claimedTimes}/${p.rule.maxTimes}` : '반복'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontBody, marginTop: 1 }}>{p.rule.desc}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="albums" size={13} color={p.rule.color} />
                  <Text style={{ color: p.rule.color, fontSize: 13, fontFamily: fontMono, fontWeight: '800' }}>{p.rule.reward}</Text>
                </View>
              </View>

              {/* 진행바 */}
              <View style={{ height: 8, backgroundColor: c.surfaceAlt, borderRadius: 4, overflow: 'hidden', marginTop: 12 }}>
                <View style={{ width: `${Math.round(p.pct * 100)}%`, height: '100%', backgroundColor: p.rule.color, borderRadius: 4 }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontMono }}>
                  {progressLabel(p)}
                  {p.claimedTimes > 0 ? ` · ${p.claimedTimes}회 수령` : ''}
                </Text>
                {p.claimable > 0 ? (
                  <Pressable accessibilityRole="button" onPress={() => onClaim(p.rule.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: p.rule.color, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
                    <Ionicons name="gift" size={13} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 12.5, fontFamily: fontCute, fontWeight: '800' }}>팩 {p.claimable}개 받기</Text>
                  </Pressable>
                ) : done ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons name="checkmark-circle" size={14} color={c.success} />
                    <Text style={{ color: c.success, fontSize: 12, fontFamily: fontCute, fontWeight: '700' }}>완료</Text>
                  </View>
                ) : p.lockedReason ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons name="lock-closed" size={13} color={c.textSecondary} />
                    <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontBody }}>{p.lockedReason}</Text>
                  </View>
                ) : (
                  <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontBody }}>진행 중</Text>
                )}
              </View>
            </View>
          );
        })}

        <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontBody, textAlign: 'center', marginTop: 8, lineHeight: 17 }}>
          중복으로 나온 카드는 안전 조각이 돼요.{'\n'}조각은 도감에서 원하는 카드와 바로 교환할 수 있어요.
        </Text>
      </ScrollView>
    </View>
  );
}

/**
 * 진행도 표시 — 규칙 유형마다 단위가 다르다.
 * 정답률은 "87% / 목표 80%", 나머지는 "12/50" 형태로 보여준다.
 */
function progressLabel(p: PackRuleProgress): string {
  if (p.rule.type === 'accuracy') return `${p.current}% / 목표 ${p.target}%`;
  const goal = p.claimedTimes * p.target + p.target;
  return `${Math.min(p.current, goal)}/${goal}`;
}
