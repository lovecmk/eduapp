import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { resolveCardImage } from '../../data/cardImages';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontMono, fontDisplay, fontBody } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { AnimatedSheet } from '../ui/AnimatedSheet';
import { getCategoryIcon, getCategoryColor } from '../../constants/categories';
import { dateKey, dayDiff } from '../../utils/dateKey';
import { useAllCards } from '../../hooks/useCards';
import { useSrsStore } from '../../store/srsStore';
import type { LearningCard } from '../../domain/models/LearningCard';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

function getMonthCells(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= count; d++) cells.push(d);
  return cells;
}

/** 학습 강도(복습 카드 수)를 4단계 히트맵 색으로 변환. */
function heatColor(count: number, primary: string, base: string): string {
  if (count <= 0) return base;
  if (count <= 2) return primary + '4D';
  if (count <= 4) return primary + '99';
  return primary;
}

/**
 * 학습 히트맵 캘린더 — 날짜별 복습량을 강도로 시각화하고, 복습 예정일을 점으로 표시.
 * 날짜를 탭하면 그날 학습한 카드(이미지 포함)를 상세로 보여준다.
 */
export function LearningCalendar() {
  const { theme } = useTheme();
  const c = theme.colors;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickYear, setPickYear] = useState(year);
  const [pickMonth, setPickMonth] = useState(month);
  const [selected, setSelected] = useState<string | null>(null);

  const { data: allCards = [] } = useAllCards();
  const history = useSrsStore((s) => s.history);
  const srsCards = useSrsStore((s) => s.cards);

  const cardById = useMemo(() => {
    const m = new Map<string, LearningCard>();
    for (const card of allCards) m.set(card.id, card);
    return m;
  }, [allCards]);

  /** 미래 복습 예정 카드 수 (dateKey → count). */
  const dueByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const card of allCards) {
      const st = srsCards[card.id];
      if (!st) continue;
      const d = new Date(st.dueAt);
      if (dayDiff(d, now) >= 0) m.set(dateKey(d), (m.get(dateKey(d)) ?? 0) + 1);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCards, srsCards]);

  const todayStr = dateKey(now);
  const cells = getMonthCells(year, month);

  // 이번 달 요약 + 연속 학습(streak)
  const summary = useMemo(() => {
    let monthReviews = 0;
    let activeDays = 0;
    for (const [key, ids] of Object.entries(history)) {
      const [y, mo] = key.split('-').map(Number);
      if (y === year && mo === month) { monthReviews += ids.length; if (ids.length) activeDays++; }
    }
    let streak = 0;
    for (let i = 0; i < 400; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const ids = history[dateKey(d)];
      if (ids && ids.length > 0) streak++;
      else if (i > 0) break; // 오늘 미학습은 streak 유지(진행 중)
    }
    return { monthReviews, activeDays, streak };
  }, [history, year, month]);

  const prev = () => { if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1); };
  const next = () => { if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1); };

  const selectedCards = useMemo(() => {
    if (!selected) return { reviewed: [] as LearningCard[], due: [] as LearningCard[] };
    const reviewed = (history[selected] ?? []).map((id) => cardById.get(id)).filter(Boolean) as LearningCard[];
    const due = allCards.filter((card) => { const st = srsCards[card.id]; return st && dateKey(new Date(st.dueAt)) === selected; });
    return { reviewed, due };
  }, [selected, history, cardById, allCards, srsCards]);

  return (
    <View style={[styles.container, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* 요약 헤더 */}
      <View style={styles.summaryRow}>
        {[
          { icon: 'flame' as const, v: `${summary.streak}일`, l: '연속 학습', color: c.warning },
          { icon: 'calendar' as const, v: `${summary.activeDays}일`, l: '이번 달 학습', color: c.primary },
          { icon: 'albums' as const, v: `${summary.monthReviews}`, l: '이번 달 복습', color: c.success },
        ].map((s) => (
          <View key={s.l} style={[styles.summaryCell, { backgroundColor: c.surfaceAlt }]}>
            <Ionicons name={s.icon} size={14} color={s.color} />
            <Text style={[styles.summaryVal, { color: c.textPrimary }]}>{s.v}</Text>
            <Text style={[styles.summaryLbl, { color: c.textSecondary }]}>{s.l}</Text>
          </View>
        ))}
      </View>

      {/* 월 네비게이션 */}
      <View style={styles.header}>
        <Pressable onPress={prev} hitSlop={8} style={styles.arrow}><Ionicons name="chevron-back" size={20} color={c.primary} /></Pressable>
        <Pressable onPress={() => { setPickYear(year); setPickMonth(month); setPickerOpen(true); }}>
          <Text style={{ color: c.textPrimary, fontSize: 16, fontFamily: fontDisplay }}>{year}년 {month + 1}월</Text>
        </Pressable>
        <Pressable onPress={next} hitSlop={8} style={styles.arrow}><Ionicons name="chevron-forward" size={20} color={c.primary} /></Pressable>
      </View>

      <View style={styles.weekRow}>
        {DAYS.map((d) => (
          <Text key={d} style={[styles.weekLabel, { color: d === '일' ? '#EF4444' : d === '토' ? '#3B82F6' : c.textSecondary }]}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (d === null) return <View key={`e${i}`} style={styles.cell} />;
          const key = `${year}-${month}-${d}`;
          const isToday = key === todayStr;
          const reviewCount = history[key]?.length ?? 0;
          const dueCount = dueByDate.get(key) ?? 0;
          const dow = i % 7;
          const bg = heatColor(reviewCount, c.primary, c.surfaceAlt);
          const intense = reviewCount > 4;
          return (
            <Pressable key={d} style={styles.cell} onPress={() => setSelected(key)}>
              <View style={[
                styles.dayCell,
                { backgroundColor: bg },
                isToday && { borderWidth: 2, borderColor: c.primary },
              ]}>
                <Text style={[styles.dayText, {
                  color: intense ? '#fff' : dow === 0 ? '#EF4444' : dow === 6 ? '#3B82F6' : c.textPrimary,
                }]}>{d}</Text>
              </View>
              {dueCount > 0 && !isToday ? (
                <View style={[styles.dueDot, { backgroundColor: c.warning }]} />
              ) : (
                <View style={{ height: 5, marginTop: 2 }} />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* 범례 */}
      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: c.textSecondary }]}>적음</Text>
        {[c.surfaceAlt, c.primary + '33', c.primary + '77', c.primary].map((col, i) => (
          <View key={i} style={[styles.legendBox, { backgroundColor: col }]} />
        ))}
        <Text style={[styles.legendText, { color: c.textSecondary }]}>많음</Text>
        <View style={{ flex: 1 }} />
        <View style={[styles.dueDot, { backgroundColor: c.warning, marginTop: 0 }]} />
        <Text style={[styles.legendText, { color: c.textSecondary }]}>복습 예정</Text>
      </View>

      {/* 월 선택 */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPickerOpen(false)}>
          <Pressable onPress={() => {}} style={[styles.modalCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ color: c.textPrimary, fontSize: 16, marginBottom: 16, textAlign: 'center', fontFamily: fontDisplay }}>날짜 선택</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickLbl, { color: c.textSecondary }]}>년도</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {Array.from({ length: 4 }, (_, i) => 2024 + i).map((y) => (
                    <Pressable key={y} onPress={() => setPickYear(y)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: pickYear === y ? c.primary : c.surfaceAlt }}>
                      <Text style={{ color: pickYear === y ? c.textOnPrimary : c.textPrimary, fontSize: 13, fontFamily: fontBody }}>{y}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={{ flex: 1.4 }}>
                <Text style={[styles.pickLbl, { color: c.textSecondary }]}>월</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {MONTHS.map((m, i) => (
                    <Pressable key={m} onPress={() => setPickMonth(i)} style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: pickMonth === i ? c.primary : c.surfaceAlt }}>
                      <Text style={{ color: pickMonth === i ? c.textOnPrimary : c.textPrimary, fontSize: 13, fontFamily: fontBody }}>{m}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            <Button label="적용" onPress={() => { setYear(pickYear); setMonth(pickMonth); setPickerOpen(false); }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* 날짜 상세 */}
      <DayDetailSheet
        visible={selected !== null}
        dateKey={selected}
        reviewed={selectedCards.reviewed}
        due={selectedCards.due}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

function DayDetailSheet({
  visible, dateKey: key, reviewed, due, onClose,
}: { visible: boolean; dateKey: string | null; reviewed: LearningCard[]; due: LearningCard[]; onClose: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [ , mo, d] = (key ?? '0-0-0').split('-').map(Number);
  const title = `${mo + 1}월 ${d}일`;

  return (
    <AnimatedSheet visible={visible} onClose={onClose}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
          <View style={styles.sheetHeader}>
            <Text style={{ color: c.textPrimary, fontSize: 17, fontFamily: fontDisplay }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={17} color={c.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            <SectionTitle icon="checkmark-done" color={c.success} text={`복습한 카드 ${reviewed.length}`} />
            {reviewed.length === 0 ? (
              <Text style={[styles.empty, { color: c.textSecondary }]}>이 날은 복습 기록이 없어요</Text>
            ) : reviewed.map((card) => <CardRow key={`r${card.id}`} card={card} />)}

            {due.length > 0 && (
              <>
                <View style={{ height: 12 }} />
                <SectionTitle icon="alarm" color={c.warning} text={`복습 예정 ${due.length}`} />
                {due.map((card) => <CardRow key={`d${card.id}`} card={card} />)}
              </>
            )}
          </ScrollView>
        </View>
    </AnimatedSheet>
  );
}

function SectionTitle({ icon, color, text }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={{ color: c.textPrimary, fontSize: 13, fontFamily: fontDisplay }}>{text}</Text>
    </View>
  );
}

function CardRow({ card }: { card: LearningCard }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const accent = getCategoryColor(card.category) ?? c.primary;
  return (
    <View style={[styles.cardRow, { backgroundColor: c.surfaceAlt }]}>
      {resolveCardImage(card.imageUrl) ? (
        <Image source={resolveCardImage(card.imageUrl)!} style={styles.thumb} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.thumb, { backgroundColor: accent + '22', alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name={getCategoryIcon(card.category)} size={20} color={accent} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
          <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody }}>{card.category} · {card.subCategory}</Text>
        </View>
        <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 13, lineHeight: 18, fontFamily: fontBody }}>{card.question}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: radius.card, borderWidth: 1, padding: 16, marginBottom: 14 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryCell: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 3 },
  summaryVal: { fontSize: 16, fontFamily: fontMono, fontWeight: '900' },
  summaryLbl: { fontSize: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  arrow: { padding: 4 },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  dayCell: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 13, fontWeight: '700', fontFamily: fontMono },
  dueDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14 },
  legendText: { fontSize: 10, fontFamily: fontBody },
  legendBox: { width: 12, height: 12, borderRadius: 3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { borderRadius: 20, padding: 24, width: 320, borderWidth: 1 },
  pickLbl: { fontSize: 12, marginBottom: 8, fontFamily: fontBody },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 34 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  empty: { fontSize: 12, paddingVertical: 8, fontFamily: fontBody },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: 12, marginBottom: 8 },
  thumb: { width: 44, height: 44, borderRadius: 10 },
});
