import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { resolveCardImage } from '../../data/cardImages';
import { Ionicons } from '@expo/vector-icons';
import { hapticSuccess } from '../../utils/haptics';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontMono, fontDisplay, fontBody, fontCute } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { AnimatedSheet } from '../ui/AnimatedSheet';
import { getCategoryIcon, getCategoryColor } from '../../constants/categories';
import { ROUTES } from '../../constants/routes';
import { dateKey } from '../../utils/dateKey';
import { buildLearningCalendar, calendarDate } from '../../domain/learningCalendar';
import { DAILY_MIN_CARDS } from '../../constants/learning';
import { useAllCards } from '../../hooks/useCards';
import { useSrsStore } from '../../store/srsStore';
import { useAttendanceStore } from '../../store/attendanceStore';
import { AttendanceStamp } from './AttendanceStamp';
import { CheckInSuccess } from './CheckInSuccess';
import type { LearningCard } from '../../domain/models/LearningCard';
import { isWorkday, koreanDate, learningDay, holidayName } from '../../utils/workday';
import { useLearningDay } from '../../hooks/useLearningDay';
import { useLearningCalendar } from '../../hooks/useLearningCalendar';

/** 날짜 동그라미의 지름 — 이어짐 띠의 높이·모서리도 여기서 따라간다. */
const DAY_SIZE = 30;
/** 날짜 칸의 위아래 여백 — 띠가 동그라미와 같은 높이에 놓이도록 맞춘다. */
const CELL_PAD_V = 1;

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

function getMonthCells(year: number, month: number): (number | null)[] {
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
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


/**
 * 학습 캘린더 — 실제 기록과 오늘 이후의 복습 일정을 구분한다.
 * 날짜를 탭하면 그날 학습한 카드(이미지 포함)를 상세로 보여준다.
 */
export function LearningCalendar() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const now = new Date();
  const today = useLearningDay();
  const [year, setYear] = useState(Number(today.date.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.date.slice(5, 7)) - 1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickYear, setPickYear] = useState(year);
  const [pickMonth, setPickMonth] = useState(month);
  const [selected, setSelected] = useState<string | null>(null);
  const calendarDays = useLearningCalendar(year, month);

  const { data: allCards = [], isLoading: cardsLoading, error: cardsError, refetch: refetchCards } = useAllCards();
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

  const { historyByDate, dueByDate } = useMemo(
    () => buildLearningCalendar(allCards, srsCards, history, now.getTime()),
    [allCards, srsCards, history, today.date],
  );

  const todayStr = dateKey(now);
  const cells = getMonthCells(year, month);
  const monthPrefix = `${year}-${month}-`;
  const learnedDays = useMemo(
    () => Object.keys(historyByDate).filter((k) => k.startsWith(monthPrefix) && historyByDate[k]!.length > 0).length,
    [historyByDate, monthPrefix],
  );
  const attendedDays = useMemo(
    () => Object.keys(stamps).filter((key) => {
      const date = calendarDate(key);
      return key.startsWith(monthPrefix) && date && date.getTime() <= now.getTime();
    }).length,
    [stamps, monthPrefix, today.date],
  );

  const firstMonth = year === 2025 && month === 0;
  const lastMonth = year === 2035 && month === 11;
  const prev = () => { if (firstMonth) return; if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1); };
  const next = () => { if (lastMonth) return; if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1); };

  // 오늘 출석 여부 · 캘린더에서 바로 도장 찍기(별도 카드 없이 통합).
  const checkedToday = !!stamps[todayStr];
  // 방금 찍은 날짜만 도장 애니메이션을 재생한다(지난 출석은 정적으로 그린다).
  const [justStamped, setJustStamped] = useState<string | null>(null);
  const onCheckIn = () => {
    if (!checkIn()) return;
    hapticSuccess();
    setJustStamped(dateKey(new Date()));
  };

  // Use the server's extra holidays for both the cell and its connecting band.
  const canLearnOn = (date: Date) => calendarDays[dateKey(date)]?.can_learn_new ?? isWorkday(date);

  /** 그 날에서 한 방향으로 걸어가 처음 만나는 **근무일**이 완료된 날인가. */
  const nearestWorkdayDone = (day: number, step: 1 | -1): boolean => {
    // 연휴가 길어야 열흘 남짓이다 — 그 안에서 근무일을 못 만나면 이어지지 않은 것으로 본다.
    for (let k = 1; k <= 10; k++) {
      const date = koreanDate(year, month, day + step * k);
      if (canLearnOn(date)) return (historyByDate[dateKey(date)]?.length ?? 0) >= DAILY_MIN_CARDS;
    }
    return false;
  };

  /**
   * 그 날이 '이어달리기 안'에 있는가 — 띠를 그릴지 정한다.
   *
   * 근무일은 완료했으면 안에 있다. **주말·공휴일은 앞뒤 근무일이 모두 완료면 다리를
   * 놓는다.** 쉬는 날은 학습일로 세지 않으므로(범례의 '토·일·공휴일 제외') 금요일까지
   * 하고 월요일에 이어 한 사람은 한 번도 거르지 않은 것이다. 그런데 주말에서 띠를
   * 끊으면 화면에는 매주 새로 시작하는 것처럼 보여, 실제보다 훨씬 자주 끊긴 것으로 읽힌다.
   * 다리는 더 옅게 칠해 '그날 학습했다'와는 구분한다.
   */
  const inStreak = (day: number): boolean => {
    const date = koreanDate(year, month, day);
    if (canLearnOn(date)) return (historyByDate[dateKey(date)]?.length ?? 0) >= DAILY_MIN_CARDS;
    return nearestWorkdayDone(day, -1) && nearestWorkdayDone(day, 1);
  };

  const selectedCards = useMemo(() => {
    const ids = selected ? historyByDate[selected] ?? [] : [];
    const reviewed = ids.map((id) => cardById.get(id)).filter((card): card is LearningCard => !!card);
    return { reviewed, recordedCount: ids.length, due: selected ? dueByDate[selected] ?? [] : [] };
  }, [selected, historyByDate, cardById, dueByDate]);

  const thisYear = Number(today.date.slice(0, 4));
  const thisMonth = Number(today.date.slice(5, 7)) - 1;
  const isCurrentMonth = year === thisYear && month === thisMonth;

  return (
    <View style={[styles.container, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* 월 네비게이션 */}
      <View style={styles.header}>
        <Pressable onPress={prev} disabled={firstMonth} accessibilityState={{ disabled: firstMonth }} hitSlop={8} accessibilityRole="button" accessibilityLabel="이전 달" style={styles.arrow}><Ionicons name="chevron-back" size={20} color={c.primary} /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setPickYear(year); setPickMonth(month); setPickerOpen(true); }}>
          <Text style={{ color: c.textPrimary, fontSize: 16 * fs, fontFamily: fontDisplay }}>{year}년 {month + 1}월</Text>
        </Pressable>
        <Pressable onPress={next} disabled={lastMonth} accessibilityState={{ disabled: lastMonth }} hitSlop={8} accessibilityRole="button" accessibilityLabel="다음 달" style={styles.arrow}><Ionicons name="chevron-forward" size={20} color={c.primary} /></Pressable>
      </View>

      {!isCurrentMonth && <Pressable accessibilityRole="button" onPress={() => { setYear(thisYear); setMonth(thisMonth); }} style={{ alignSelf: 'center', padding: 6 }}>
        <Text style={{ color: c.primary, fontSize: 12 * fs, fontFamily: fontDisplay }}>이번 달로 돌아가기</Text>
      </Pressable>}

      {/* 월간 요약 — 학습일 / 출석일 / 연속 */}
      <View style={styles.summaryRow}>
        <SummaryPill icon="school" color={c.primary} value={`${learnedDays}일`} label="기록" />
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
              // 어제/내일이 이어달리기 안인지 — **띠**와 **마개**는 판정 범위가 다르다.
              //  · 띠(band)는 한 줄(주) 안에서만 이어진다. 토요일에서 일요일로 넘어가는
              //    자리는 화면에서 줄이 바뀌므로 거기서 한 번 끊고 둥글게 닫는다.
              //  · 마개(cap, 진한 동그라미)는 **이어달리기 전체의 시작과 끝**에만 찍는다.
              //    주가 바뀌었다고 마개를 찍으면 한 번 달린 것이 두 번 달린 것처럼 보인다.
              const onStreak = inStreak(d);
              const contLeft = inStreak(d - 1);
              const contRight = inStreak(d + 1);
              const linkLeft = dow > 0 && contLeft;
              const linkRight = dow < 6 && contRight;
              // 그날 학습한(신규+복습) 카드 수. 근무일 기준으로 완료/일부완료를 판정하고,
              // 미수행(0장)은 아무 표시도 하지 않는다.
              const learned = historyByDate[key]?.length ?? 0;
              const dueCount = dueByDate[key]?.length ?? 0;
              const calendarDay = calendarDays[key];
              const name = calendarDay?.holiday_name || holidayName(year, month, d);
              const holiday = !!name;
              // 근무일(월~금 중 공휴일 제외)만 완료/일부완료 판정 대상.
              // 주말·공휴일은 '학습일'로 세지 않으므로, 기록이 있어도 완료 표시를 하지 않는다.
              const workday = calendarDay?.can_learn_new ?? (dow !== 0 && dow !== 6 && !holiday);
              // 완료 기준은 **최소 출제량**이다.
              //
              // 하루 분량은 이제 그날 난이도에 따라 3~5문제로 달라지는데, 지난
              // 날짜에 몇 문제가 배정됐었는지는 앱이 알지 못한다(서버에만 남는다).
              // 그때그때 다른 기준으로 칠하면 달력이 스스로 모순되므로, 어느 날이든
              // "그날의 리추얼을 지켰는가"를 최소치로 판정한다 — 5문제 중 4문제를
              // 푼 날을 미완료로 칠하는 것보다, 최소를 채운 날을 완료로 보는 편이
              // 습관을 보여 주는 달력의 목적에 맞는다.
              const done = workday && learned >= DAILY_MIN_CARDS;
              const partial = workday && learned > 0 && !done;      // 1~2문제 → 일부완료
              const attended = !!stamps[key];
              // 이어달리기의 시작·끝(과 하루짜리)에만 진한 동그라미를 찍는다.
              // 사이의 날들은 띠 위에 숫자만 얹혀, 며칠이 하나로 이어진 하나의 덩어리로 읽힌다.
              const isCap = done && (!contLeft || !contRight);
              return (
                <Pressable accessibilityRole="button" accessibilityLabel={`${month + 1}월 ${d}일${workday ? ' 신규 학습 가능' : ` ${name || (dow === 0 || dow === 6 ? '주말' : '휴무일')} 신규 학습 쉬는 날, 복습 가능`}, 학습·복습 기록 ${learned}장, 복습 일정 ${dueCount}장`} key={`${w}-${dow}`} style={styles.cell} onPress={() => setSelected(key)}>
                  {/* 이어짐 띠 — 칸 **폭 전체**를 옅게 채워 옆 칸과 빈틈 없이 붙는다.
                      줄이 이어지는 쪽은 각지게, 끊기는 쪽은 둥글게 닫아 알약 모양이 된다.
                      날짜 동그라미 뒤에 깔리므로 시작/끝의 진한 마개가 띠 위에 얹혀 보인다. */}
                  {onStreak && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.band,
                        // 학습한 날은 또렷하게, 주말·공휴일 다리는 더 옅게.
                        { backgroundColor: c.success + (done ? '2E' : '14') },
                        linkLeft && { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
                        linkRight && { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
                      ]}
                    />
                  )}
                  <View style={[
                    styles.dayCell,
                    isCap && { backgroundColor: c.success },
                    partial && { backgroundColor: c.warning + '26', borderWidth: 1.5, borderColor: c.warning },
                    isToday && { borderWidth: 2, borderColor: c.primary },
                  ]}>
                    <Text style={[styles.dayText, {
                      color: isCap ? '#fff'
                        : done ? c.textPrimary
                        : (dow === 0 || holiday) ? '#EF4444'
                        : dow === 6 ? '#3B82F6'
                        : c.textPrimary,
                    }]}>{d}</Text>
                    {/* 출석 도장 — 우상단 미니 체크(방금 찍은 날은 찍히는 연출 재생) */}
                    {attended && <AttendanceStamp animate={key === justStamped} />}
                  </View>
                  {/* 완료/일부완료 날에만 학습한 카드 수를 작게 표기(미수행은 빈칸). */}
                  <View style={styles.dotRow}>
                    {done || partial ? (
                      <Text style={{ color: done ? c.success : c.warning, fontSize: 9, fontFamily: fontMono, fontWeight: '800' }}>{learned}</Text>
                    ) : !workday ? <>
                      <Text style={{ color: c.textSecondary, fontSize: 9 }}>쉼</Text>
                      {learned > 0 && <Text style={{ color: c.success, fontSize: 9, fontFamily: fontMono }}>{learned}</Text>}
                    </> : null}
                  </View>
                  <View style={styles.dotRow}>
                    {dueCount > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <View style={[styles.dueDot, { backgroundColor: c.warning }]} />
                      <Text style={{ color: c.warning, fontSize: 9, fontFamily: fontMono }}>{dueCount}</Text>
                    </View>}
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
        <View style={[styles.legendBox, { backgroundColor: c.success + '2E' }]} />
        {/* 위 요약 칩의 '연속'(출석 연속일)과 헷갈리지 않게 다른 말을 쓴다. */}
        <Text style={[styles.legendText, { color: c.textSecondary }]}>이어짐</Text>
        <View style={[styles.legendBox, { backgroundColor: c.warning + '26', borderWidth: 1.5, borderColor: c.warning }]} />
        <Text style={[styles.legendText, { color: c.textSecondary }]}>일부완료</Text>
        <View style={[styles.dueDot, { backgroundColor: c.warning }]} />
        <Text style={[styles.legendText, { color: c.textSecondary }]}>복습 일정</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.legendText, { color: c.textSecondary }]}>쉼: 신규 휴무</Text>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 11 * fs, marginTop: 6 }}>한국 시간 기준 · 주말·공휴일에도 복습은 가능해요</Text>
      <Text style={{ color: c.textSecondary, fontSize: 10 * fs, marginTop: 4 }}>기록: 학습·복습한 날 · 완료: {DAILY_MIN_CARDS}장 이상 · 연속: 현재 출석 기준</Text>

      {/* 오늘 출석 — 캘린더에 자연스럽게 통합(별도 카드 없이 바로 도장 찍기) */}
      {checkedToday ? (
        <CheckInSuccess animate={justStamped !== null} style={[styles.checkIn, { backgroundColor: c.success + '18' }]}>
          <Ionicons name="checkmark-circle" size={18} color={c.success} />
          <Text style={{ color: c.success, fontSize: 14 * fs, fontFamily: fontCute, fontWeight: '800' }}>오늘 출석 완료!</Text>
        </CheckInSuccess>
      ) : (
        <Pressable accessibilityRole="button" onPress={onCheckIn} style={[styles.checkIn, { backgroundColor: c.primary }]}>
          <Ionicons name="hand-left" size={17} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 14 * fs, fontFamily: fontCute, fontWeight: '800' }}>오늘 출석 도장 찍기</Text>
        </Pressable>
      )}

      {/* 월 선택 */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        {/* 배경은 '탭하면 닫히는 판'이지만 내용을 품지 않는다 — 품으면 웹에서 <button> 안에
            <button>(년도·월 선택, 적용)이 되어 유효하지 않은 DOM 이고, 스크린 리더가 중첩된
            컨트롤을 제대로 읽지 못한다. 화면을 덮는 형제로 깔고 그 위에 내용을 얹는다.
            가운데 정렬 층은 pointerEvents="box-none" 이라 빈 곳을 누르면 아래 배경이 받는다.
            내용은 그냥 View 면 된다. 형제인 배경은 내용 탭을 받지 못하므로,
            예전에 탭을 삼키려고 두었던 빈 Pressable(onPress={() => {}})은 필요 없다. */}
        <View style={{ flex: 1 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={[StyleSheet.absoluteFill, styles.modalScrim]} onPress={() => setPickerOpen(false)} />
          <View pointerEvents="box-none" style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={{ color: c.textPrimary, fontSize: 16 * fs, marginBottom: 16, textAlign: 'center', fontFamily: fontDisplay }}>날짜 선택</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickLbl, { color: c.textSecondary }]}>년도</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {Array.from({ length: 11 }, (_, i) => 2025 + i).map((y) => (
                      <Pressable accessibilityRole="button" key={y} onPress={() => setPickYear(y)} style={{ paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, backgroundColor: pickYear === y ? c.primary : c.surfaceAlt }}>
                        <Text style={{ color: pickYear === y ? c.textOnPrimary : c.textPrimary, fontSize: 13 * fs, fontFamily: fontBody }}>{y}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={{ flex: 1.4 }}>
                  <Text style={[styles.pickLbl, { color: c.textSecondary }]}>월</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {MONTHS.map((m, i) => (
                      <Pressable accessibilityRole="button" key={m} onPress={() => setPickMonth(i)} style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: pickMonth === i ? c.primary : c.surfaceAlt }}>
                        <Text style={{ color: pickMonth === i ? c.textOnPrimary : c.textPrimary, fontSize: 13 * fs, fontFamily: fontBody }}>{m}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
              <Button label="적용" onPress={() => { setYear(pickYear); setMonth(pickMonth); setPickerOpen(false); }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* 날짜 상세 */}
      <DayDetailSheet
        visible={selected !== null}
        dateKey={selected}
        learningDay={selected ? calendarDays[selected] : undefined}
        reviewed={selectedCards.reviewed}
        recordedCount={selectedCards.recordedCount}
        due={selectedCards.due}
        todayKey={todayStr}
        cardsLoading={cardsLoading}
        cardsError={!!cardsError}
        onRetry={() => { void refetchCards(); }}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

function SummaryPill({ icon, color, value, label }: { icon: keyof typeof Ionicons.glyphMap; color: string; value: string; label: string }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.summaryPill, { backgroundColor: c.surfaceAlt }]}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontMono, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 10.5 * fs, fontFamily: fontBody }}>{label}</Text>
    </View>
  );
}

function DayDetailSheet({
  visible, dateKey: key, reviewed, recordedCount, due, todayKey, cardsLoading, cardsError, onRetry, onClose, learningDay: calendarDay,
}: { visible: boolean; dateKey: string | null; reviewed: LearningCard[]; recordedCount: number; due: LearningCard[]; todayKey: string; cardsLoading: boolean; cardsError: boolean; onRetry: () => void; onClose: () => void; learningDay?: import('../../utils/workday').LearningDay }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const [year, mo, d] = (key ?? '0-0-0').split('-').map(Number);
  const title = `${year}년 ${mo + 1}월 ${d}일`;
  const day = calendarDay ?? (key ? learningDay(koreanDate(year, mo, d)) : null);
  const selectedDate = key ? calendarDate(key) : null;
  const todayDate = calendarDate(todayKey);
  const isFuture = !!selectedDate && !!todayDate && selectedDate > todayDate;
  const isPast = !!selectedDate && !!todayDate && selectedDate < todayDate;

  // 카드를 누르면 시트를 닫고 '컨텐츠 상세'(앞·뒷면 모두 보기)로 이동한다.
  const openDetail = (id: string) => {
    onClose();
    router.push(ROUTES.content(id) as never);
  };

  return (
    <AnimatedSheet visible={visible} onClose={onClose}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
          <View style={styles.sheetHeader}>
            <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontFamily: fontDisplay }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기" style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={17} color={c.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {day && !day.can_learn_new && <Text style={[styles.empty, { color: c.textSecondary }]}>{day.holiday_name || (day.reason === 'WEEKEND' ? '주말' : '휴무일')} · 신규 학습 쉬는 날 · 복습 가능</Text>}
            {!isFuture && <>
              <SectionTitle icon="checkmark-done" color={c.success} text={`학습·복습한 카드 ${recordedCount}`} />
              {recordedCount === 0 ? (
                <Text style={[styles.empty, { color: c.textSecondary }]}>이 날은 학습·복습 기록이 없어요</Text>
              ) : reviewed.map((card) => <CardRow key={`r${card.id}`} card={card} onPress={() => openDetail(card.id)} />)}
              {recordedCount > reviewed.length && !cardsLoading && !cardsError && <Text style={[styles.empty, { color: c.textSecondary }]}>현재 볼 수 없는 카드 {recordedCount - reviewed.length}장의 기록이 포함되어 있어요</Text>}
            </>}

            {cardsLoading && <Text style={[styles.empty, { color: c.textSecondary }]}>카드 목록을 불러오는 중이에요</Text>}
            {cardsError && <Pressable accessibilityRole="button" onPress={onRetry} style={{ paddingVertical: 10 }}><Text style={{ color: c.primary, fontSize: 12 * fs }}>카드 목록 다시 불러오기</Text></Pressable>}
            {!isPast && !cardsLoading && (!cardsError || due.length > 0) && (
              <>
                <View style={{ height: 12 }} />
                <SectionTitle icon="alarm" color={c.warning} text={`${isFuture ? '복습 예정' : '오늘 복습 일정'} ${due.length}`} />
                {due.length === 0 && <Text style={[styles.empty, { color: c.textSecondary }]}>예정된 복습 카드가 없어요</Text>}
                {due.map((card) => <CardRow key={`d${card.id}`} card={card} onPress={() => openDetail(card.id)} />)}
                <Text style={[styles.empty, { color: c.textSecondary }]}>복습 일정은 학습 결과에 따라 바뀔 수 있어요</Text>
              </>
            )}
          </ScrollView>
        </View>
    </AnimatedSheet>
  );
}

function SectionTitle({ icon, color, text }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={{ color: c.textPrimary, fontSize: 13 * fs, fontFamily: fontDisplay }}>{text}</Text>
    </View>
  );
}

function CardRow({ card, onPress }: { card: LearningCard; onPress?: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const accent = getCategoryColor(card.category) ?? c.primary;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.cardRow, { backgroundColor: c.surfaceAlt }]}>
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
          <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontFamily: fontBody }}>{card.category} · {card.subCategory}</Text>
        </View>
        <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 13 * fs, lineHeight: 18 * fs, fontFamily: fontBody }}>{card.question}</Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={15} color={c.textSecondary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 홈 첫 화면에서 캘린더가 차지하는 세로를 줄인다 — 여백·칸을 조금씩 깎아
  // 아래 카드들이 스크롤 없이 더 많이 보이게 한다(정보량은 그대로).
  container: { borderRadius: radius.card, borderWidth: 1, padding: 12, marginBottom: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  arrow: { padding: 4 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  summaryPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, paddingVertical: 5 },
  // 작은 스크린(스마트폰)에서 아래 숫자가 잘리지 않도록 넉넉한 높이를 준다.
  dotRow: { flexDirection: 'row', gap: 3, minHeight: 10, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: '600' },
  grid: {},
  weekCells: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', paddingVertical: CELL_PAD_V },
  dayCell: { width: DAY_SIZE, height: DAY_SIZE, borderRadius: DAY_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 13, fontWeight: '700', fontFamily: fontMono },
  dueDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  /** 이어짐 띠 — 칸 폭을 꽉 채우고 날짜 동그라미와 같은 높이·세로 위치를 갖는다.
      옆 칸의 띠와 맞닿아 끊김 없는 하나의 알약이 된다. */
  band: {
    position: 'absolute', top: CELL_PAD_V, left: 0, right: 0,
    height: DAY_SIZE, borderRadius: DAY_SIZE / 2,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 8 },
  checkIn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 10, marginTop: 8 },
  legendText: { fontSize: 10, fontFamily: fontBody },
  legendBox: { width: 12, height: 12, borderRadius: 3 },
  /** 가운데 정렬만 맡는 층 — 어둡게 까는 일은 아래 modalScrim(형제 배경)이 한다. */
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalScrim: { backgroundColor: 'rgba(0,0,0,0.4)' },
  modalCard: { borderRadius: 20, padding: 24, width: '100%', maxWidth: 320, borderWidth: 1 },
  pickLbl: { fontSize: 12, marginBottom: 8, fontFamily: fontBody },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 34 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  empty: { fontSize: 12, paddingVertical: 8, fontFamily: fontBody },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: 12, marginBottom: 8 },
  thumb: { width: 44, height: 44, borderRadius: 10 },
});
