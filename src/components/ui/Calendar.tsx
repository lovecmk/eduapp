import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { fontMono } from '../../theme/tokens';
import { Button } from './Button';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

function getMonthData(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  return days;
}

export function Calendar({ learnedDates }: { learnedDates?: Map<string, number> }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickYear, setPickYear] = useState(year);
  const [pickMonth, setPickMonth] = useState(month);

  const todayStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const days = getMonthData(year, month);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  const openPicker = () => {
    setPickYear(year); setPickMonth(month);
    setPickerOpen(true);
  };

  const applyPicker = () => {
    setYear(pickYear); setMonth(pickMonth);
    setPickerOpen(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <Pressable onPress={prevMonth} style={styles.arrow}>
          <Text style={{ color: c.primary, fontSize: 18 }}>◀</Text>
        </Pressable>
        <Pressable onPress={openPicker}>
          <Text style={{ color: c.textPrimary, fontSize: 16, fontWeight: '700' }}>
            {year}년 {month + 1}월
          </Text>
        </Pressable>
        <Pressable onPress={nextMonth} style={styles.arrow}>
          <Text style={{ color: c.primary, fontSize: 18 }}>▶</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {DAYS.map((d) => (
          <Text key={d} style={[styles.weekLabel, { color: d === '일' ? '#EF4444' : d === '토' ? '#3B82F6' : c.textSecondary }]}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((d, i) => {
          if (d === null) return <View key={`e${i}`} style={styles.cell} />;
          const dateStr = `${year}-${month}-${d}`;
          const isToday = dateStr === todayStr;
          const count = learnedDates?.get(dateStr);
          const dayOfWeek = i % 7;
          return (
            <View key={d} style={styles.cell}>
              <View style={[styles.dayCircle, isToday && { backgroundColor: c.primary }, !!count && !isToday && { backgroundColor: c.primary + '33' }]}>
                <Text style={[styles.dayText, { color: isToday ? c.textOnPrimary : dayOfWeek === 0 ? '#EF4444' : dayOfWeek === 6 ? '#3B82F6' : c.textPrimary }]}>
                  {d}
                </Text>
              </View>
              {!!count && <Text style={{ color: c.primary, fontSize: 8, fontWeight: '700', marginTop: 1 }}>{count}개</Text>}
            </View>
          );
        })}
      </View>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setPickerOpen(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: c.surface, borderRadius: 20, padding: 24, width: 300, borderWidth: 1, borderColor: c.border, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', elevation: 10 }}>
            <Text style={{ color: c.textPrimary, fontSize: 17, fontWeight: '800', marginBottom: 16, textAlign: 'center' }}>📅 날짜 선택</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>년도</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {Array.from({ length: 7 }, (_, i) => 2024 + i).map((y) => (
                    <Pressable key={y} onPress={() => setPickYear(y)}
                      style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: pickYear === y ? c.primary : c.surfaceAlt }}>
                      <Text style={{ color: pickYear === y ? c.textOnPrimary : c.textPrimary, fontWeight: '600', fontSize: 13 }}>{y}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>월</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {MONTHS.map((m, i) => (
                    <Pressable key={m} onPress={() => setPickMonth(i)}
                      style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: pickMonth === i ? c.primary : c.surfaceAlt }}>
                      <Text style={{ color: pickMonth === i ? c.textOnPrimary : c.textPrimary, fontWeight: '600', fontSize: 13 }}>{m}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            <Button label="적용" variant="filled" onPress={applyPicker} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  arrow: { padding: 8 },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', alignItems: 'center', paddingVertical: 6 },
  dayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 13, fontWeight: '600', fontFamily: fontMono },
});