import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { resolveCardImage } from '../../data/cardImages';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontMono, fontDisplay, fontBody } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { AnimatedSheet } from '../ui/AnimatedSheet';
import { getCategoryIcon, getCategoryColor } from '../../constants/categories';
import { ROUTES } from '../../constants/routes';
import { dateKey } from '../../utils/dateKey';
import { buildLearningCalendar, calendarDate } from '../../domain/learningCalendar';
import { useAllCards } from '../../hooks/useCards';
import { useSrsStore } from '../../store/srsStore';
import type { LearningCard } from '../../domain/models/LearningCard';
import { koreanDate, learningDay } from '../../utils/workday';
import { useLearningDay } from '../../hooks/useLearningDay';
import { useLearningCalendar } from '../../hooks/useLearningCalendar';
import { useLearningCompletion } from '../../hooks/useLearningCompletion';
import { LearningCompletionGrid, LEARNING_COMPLETE_COLOR } from './LearningCompletionGrid';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

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
  const completion = useLearningCompletion();

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
  const monthPrefix = `${year}-${month}-`;
  const completedDays = completion.completed.filter(key => key.startsWith(monthPrefix)).length;

  const firstMonth = year === 2025 && month === 0;
  const lastMonth = year === 2035 && month === 11;
  const prev = () => { if (firstMonth) return; if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1); };
  const next = () => { if (lastMonth) return; if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1); };

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

      <View testID="calendar-learning-summary" style={styles.summaryRow}>
        <SummaryPill icon="checkmark-done" color={LEARNING_COMPLETE_COLOR} value={`${completedDays}일`} label="학습완료" />
        <SummaryPill icon="flame" color={LEARNING_COMPLETE_COLOR} value={`${completion.streak}일`} label="연속 학습" />
      </View>
      <View style={styles.weekRow}>
        {DAYS.map(day => <Text key={day} style={[styles.weekLabel, { color: c.textSecondary }]}>{day}</Text>)}
      </View>
      <LearningCompletionGrid year={year} month={month} todayKey={todayStr} completion={completion} learningDays={calendarDays}
        historyCounts={Object.fromEntries(Object.entries(historyByDate).map(([key, ids]) => [key, ids.length]))}
        dueCounts={Object.fromEntries(Object.entries(dueByDate).map(([key, cards]) => [key, cards.length]))}
        onSelect={setSelected} />
      <View style={styles.legend}>
        <View style={[styles.legendCircle, { backgroundColor: LEARNING_COMPLETE_COLOR }]} />
        <Text style={[styles.legendText, { color: c.textSecondary }]}>학습완료</Text>
        <View style={{ width: 16, height: 6, borderRadius: 3, backgroundColor: LEARNING_COMPLETE_COLOR, marginLeft: 5 }} />
        <Text style={[styles.legendText, { color: c.textSecondary }]}>이어짐</Text>
        <View style={[styles.legendCircle, { borderWidth: 2, borderColor: c.warning, marginLeft: 5 }]} />
        <Text style={[styles.legendText, { color: c.textSecondary }]}>일부완료</Text>
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.warning, marginLeft: 5 }} />
        <Text style={[styles.legendText, { color: c.textSecondary }]}>복습일정</Text>
      </View>

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
        goal={selected ? completion.days[selected] : undefined}
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
  visible, dateKey: key, reviewed, recordedCount, due, goal, todayKey, cardsLoading, cardsError, onRetry, onClose, learningDay: calendarDay,
}: { visible: boolean; dateKey: string | null; reviewed: LearningCard[]; recordedCount: number; due: LearningCard[]; goal?: { target: number; done: number; complete: boolean }; todayKey: string; cardsLoading: boolean; cardsError: boolean; onRetry: () => void; onClose: () => void; learningDay?: import('../../utils/workday').LearningDay }) {
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
            {goal && goal.target > 0 && <Text style={[styles.empty, { color: goal.complete ? LEARNING_COMPLETE_COLOR : c.textSecondary }]}>{goal.complete ? '학습완료' : '하루 학습 목표'} · {goal.done}/{goal.target}</Text>}
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
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: '600' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 8 },
  legendText: { fontSize: 10, fontFamily: fontBody },
  legendCircle: { width: 12, height: 12, borderRadius: 6 },
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
