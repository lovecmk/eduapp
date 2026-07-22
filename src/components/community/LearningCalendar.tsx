import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { resolveCardImage } from '../../data/cardImages';
import { Ionicons } from '@expo/vector-icons';
import { hapticSuccess } from '../../utils/haptics';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontMono, fontDisplay, fontBody, fontCute } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { AnimatedSheet } from '../ui/AnimatedSheet';
import { getCategoryIcon, getCategoryColor } from '../../constants/categories';
import { dateKey, dayDiff } from '../../utils/dateKey';
import { DAILY_NEW_LIMIT } from '../../constants/learning';
import { useAllCards } from '../../hooks/useCards';
import { useSrsStore } from '../../store/srsStore';
import { useAttendanceStore } from '../../store/attendanceStore';
import type { LearningCard } from '../../domain/models/LearningCard';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

function getMonthCells(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= count; d++) cells.push(d);
  // 마지막 주(토요일 열까지)를 채워 항상 7칸이 되도록 뒤를 null 로 패딩한다.
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** 7칸 단위(일~토)로 주 배열로 분할 — 퍼센트 폭 반올림으로 토요일 칸이 줄바꿈되는 문제를 방지. */
function chunkWeeks(cells: (number | null)[]): (number | null)[][] {
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// 대한민국 공휴일 — 양력 고정일 + 2025·2026 음력/대체공휴일 근사(데모용).
// 근무일(월~금 중 공휴일 제외)만 학습 '완료/일부완료'의 판정 대상이 된다.
const SOLAR_HOLIDAYS = new Set(['1-1', '3-1', '5-5', '6-6', '8-15', '10-3', '10-9', '12-25']);
const LUNAR_HOLIDAYS: Record<number, string[]> = {
  2025: ['1-27', '1-28', '1-29', '1-30', '5-5', '10-6', '10-7', '10-8', '10-9'],
  2026: ['2-16', '2-17', '2-18', '5-24', '5-25', '9-24', '9-25', '9-26'],
};
/** 해당 날짜가 공휴일인지. month0 은 0-based 월. */
function isHoliday(year: number, month0: number, day: number): boolean {
  const md = `${month0 + 1}-${day}`;
  return SOLAR_HOLIDAYS.has(md) || (LUNAR_HOLIDAYS[year] ?? []).includes(md);
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
  const stamps = useAttendanceStore((s) => s.stamps);
  const streak = useAttendanceStore((s) => s.currentStreak)();
  const checkIn = useAttendanceStore((s) => s.checkIn);

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
  const monthPrefix = `${year}-${month}-`;
  const learnedDays = useMemo(
    () => Object.keys(history).filter((k) => k.startsWith(monthPrefix) && (history[k]?.length ?? 0) > 0).length,
    [history, monthPrefix],
  );
  const attendedDays = useMemo(
    () => Object.keys(stamps).filter((k) => k.startsWith(monthPrefix)).length,
    [stamps, monthPrefix],
  );

  const prev = () => { if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1); };
  const next = () => { if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1); };

  // 오늘 출석 여부 · 캘린더에서 바로 도장 찍기(별도 카드 없이 통합).
  const checkedToday = !!stamps[todayStr];
  const onCheckIn = () => { if (checkIn()) hapticSuccess(); };

  const selectedCards = useMemo(() => {
    if (!selected) return { reviewed: [] as LearningCard[], due: [] as LearningCard[] };
    const reviewed = (history[selected] ?? []).map((id) => cardById.get(id)).filter(Boolean) as LearningCard[];
    const due = allCards.filter((card) => { const st = srsCards[card.id]; return st && dateKey(new Date(st.dueAt)) === selected; });
    return { reviewed, due };
  }, [selected, history, cardById, allCards, srsCards]);

  return (
    <View style={[styles.container, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* 월 네비게이션 */}
      <View style={styles.header}>
        <Pressable onPress={prev} hitSlop={8} style={styles.arrow}><Ionicons name="chevron-back" size={20} color={c.primary} /></Pressable>
        <Pressable onPress={() => { setPickYear(year); setPickMonth(month); setPickerOpen(true); }}>
          <Text style={{ color: c.textPrimary, fontSize: 16, fontFamily: fontDisplay }}>{year}년 {month + 1}월</Text>
        </Pressable>
        <Pressable onPress={next} hitSlop={8} style={styles.arrow}><Ionicons name="chevron-forward" size={20} color={c.primary} /></Pressable>
      </View>

      {/* 월간 요약 — 학습일 / 출석일 / 연속 */}
      <View style={styles.summaryRow}>
        <SummaryPill icon="school" color={c.primary} value={`${learnedDays}일`} label="학습" />
        <SummaryPill icon="ribbon" color={c.success} value={`${attendedDays}일`} label="출석" />
        <SummaryPill icon="flame" color="#FF6B35" value={`${streak}일`} label="연속" />
      </View>

      <View style={styles.weekRow}>
        {DAYS.map((d) => (
          <Text key={d} style={[styles.weekLabel, { color: d === '일' ? '#EF4444' : d === '토' ? '#3B82F6' : c.textSecondary }]}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {chunkWeeks(cells).map((week, w) => (
          <View key={`w${w}`} style={styles.weekCells}>
            {week.map((d, dow) => {
              if (d === null) return <View key={`e${w}-${dow}`} style={styles.cell} />;
              const key = `${year}-${month}-${d}`;
              const isToday = key === todayStr;
              // 그날 학습한(신규+복습) 카드 수. 근무일 기준으로 완료/일부완료를 판정하고,
              // 미수행(0장)은 아무 표시도 하지 않는다.
              const learned = history[key]?.length ?? 0;
              const holiday = isHoliday(year, month, d);
              const done = learned >= DAILY_NEW_LIMIT;       // 하루 신규 목표(3장) 달성 → 완료
              const partial = learned > 0 && !done;           // 1~2장 → 일부완료
              const attended = !!stamps[key];
              return (
                <Pressable key={`${w}-${dow}`} style={styles.cell} onPress={() => setSelected(key)}>
                  <View style={[
                    styles.dayCell,
                    done && { backgroundColor: c.success },
                    partial && { backgroundColor: c.warning + '26', borderWidth: 1.5, borderColor: c.warning },
                    isToday && { borderWidth: 2, borderColor: c.primary },
                  ]}>
                    <Text style={[styles.dayText, {
                      color: done ? '#fff'
                        : (dow === 0 || holiday) ? '#EF4444'
                        : dow === 6 ? '#3B82F6'
                        : c.textPrimary,
                    }]}>{d}</Text>
                    {/* 출석 도장 — 우상단 미니 체크 */}
                    {attended && (
                      <View style={styles.stampBadge}>
                        <Ionicons name="checkmark-sharp" size={8} color="#fff" />
                      </View>
                    )}
                  </View>
                  {/* 완료/일부완료 날에만 학습한 카드 수를 작게 표기(미수행은 빈칸). */}
                  <View style={styles.dotRow}>
                    {done || partial ? (
                      <Text style={{ color: done ? c.success : c.warning, fontSize: 9, fontFamily: fontMono, fontWeight: '800' }}>{learned}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* 범례 — 근무일 기준 완료/일부완료(미수행은 미표시) */}
      <View style={styles.legend}>
        <View style={[styles.legendBox, { backgroundColor: c.success }]} />
        <Text style={[styles.legendText, { color: c.textSecondary }]}>완료</Text>
        <View style={[styles.legendBox, { backgroundColor: c.warning + '26', borderWidth: 1.5, borderColor: c.warning }]} />
        <Text style={[styles.legendText, { color: c.textSecondary }]}>일부완료</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.legendText, { color: c.textSecondary }]}>토·일·공휴일 제외</Text>
      </View>

      {/* 오늘 출석 — 캘린더에 자연스럽게 통합(별도 카드 없이 바로 도장 찍기) */}
      {checkedToday ? (
        <View style={[styles.checkIn, { backgroundColor: c.success + '18' }]}>
          <Ionicons name="checkmark-circle" size={18} color={c.success} />
          <Text style={{ color: c.success, fontSize: 14, fontFamily: fontCute, fontWeight: '800' }}>오늘 출석 완료!</Text>
        </View>
      ) : (
        <Pressable onPress={onCheckIn} style={[styles.checkIn, { backgroundColor: c.primary }]}>
          <Ionicons name="hand-left" size={17} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 14, fontFamily: fontCute, fontWeight: '800' }}>오늘 출석 도장 찍기</Text>
        </Pressable>
      )}

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

function SummaryPill({ icon, color, value, label }: { icon: keyof typeof Ionicons.glyphMap; color: string; value: string; label: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.summaryPill, { backgroundColor: c.surfaceAlt }]}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={{ color: c.textPrimary, fontSize: 14, fontFamily: fontMono, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontBody }}>{label}</Text>
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
            <SectionTitle icon="checkmark-done" color={c.success} text={`학습한 카드 ${reviewed.length}`} />
            {reviewed.length === 0 ? (
              <Text style={[styles.empty, { color: c.textSecondary }]}>이 날은 학습 기록이 없어요</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  arrow: { padding: 4 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  summaryPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, paddingVertical: 8 },
  stampBadge: { position: 'absolute', top: -3, right: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' },
  dotRow: { flexDirection: 'row', gap: 3, height: 5, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  grid: {},
  weekCells: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3 },
  dayCell: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 13, fontWeight: '700', fontFamily: fontMono },
  dueDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14 },
  checkIn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13, marginTop: 14 },
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
