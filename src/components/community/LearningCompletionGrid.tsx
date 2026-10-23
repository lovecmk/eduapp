import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeProvider';
import { fontMono } from '../../theme/tokens';
import { calendarDate } from '../../domain/learningCalendar';
import { learningDay, koreanDate, type LearningDay } from '../../utils/workday';
import type { LearningCompletion } from '../../domain/learningCompletion';

export const LEARNING_COMPLETE_COLOR = '#15803D';
export const LEARNING_STREAK_COLORS = {
  light: { fill: LEARNING_COMPLETE_COLOR + 'AA', border: '#A7CDB4' },
  dark: { fill: LEARNING_COMPLETE_COLOR + 'AA', border: '#477858' },
} as const;
const SIZE = 30;
const ROW_HEIGHT = 52;

/** Connections travel below resting dates; resting dates never get a filled cell. */
export function completionPaths(year: number, month: number, connections: [string, string][], width: number) {
  const start = koreanDate(year, month, 1).getTime();
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const rows = Math.ceil((first + count) / 7), cell = width / 7;
  const position = (key: string) => {
    const day = Math.round((calendarDate(key)!.getTime() - start) / 86_400_000);
    const index = first + day;
    return { day, row: Math.floor(index / 7), x: (((index % 7) + 7) % 7 + 0.5) * cell };
  };
  const paths: string[] = [];
  const bands: string[] = [];
  for (const [from, to] of connections) {
    const a = position(from), b = position(to);
    const aVisible = a.day >= 0 && a.day < count, bVisible = b.day >= 0 && b.day < count;
    if (!aVisible && !bVisible) continue;
    const ay = a.row * ROW_HEIGHT + 16, by = b.row * ROW_HEIGHT + 16;
    if (a.row === b.row && aVisible && bVisible) {
      if (b.day - a.day === 1) bands.push(`M ${a.x} ${ay} H ${b.x}`);
      else paths.push(`M ${a.x} ${ay} H ${a.x + SIZE / 2} V ${ay + 23} H ${b.x - SIZE / 2} V ${by} H ${b.x}`);
    } else {
      // At a week/month wrap, matching continuation marks retain chronological direction.
      if (aVisible) paths.push(`M ${a.x} ${ay} H ${a.x + SIZE / 2} V ${ay + 23} H ${width - 7} V ${ay + 29} m -4 -4 l 4 4 l 4 -4`);
      if (bVisible) paths.push(`M 7 ${by + 21} H ${b.x - SIZE / 2} V ${by} H ${b.x} M 3 ${by + 17} l 4 4 l 4 -4`);
    }
  }
  return { paths, bands, rows };
}

export function LearningCompletionGrid({ year, month, todayKey, completion, learningDays, historyCounts, dueCounts, onSelect }: {
  year: number; month: number; todayKey: string; completion: LearningCompletion;
  learningDays: Record<string, LearningDay>; historyCounts: Record<string, number>; dueCounts: Record<string, number>;
  onSelect: (key: string) => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const streak = LEARNING_STREAK_COLORS[theme.mode === 'light' ? 'light' : 'dark'];
  const [width, setWidth] = useState(0);
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const { paths, bands, rows } = completionPaths(year, month, completion.connections, width);
  return <View testID="learning-completion-grid" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height: rows * ROW_HEIGHT }}>
    {width > 0 && <Svg pointerEvents="none" accessible={false} width={width} height={rows * ROW_HEIGHT} style={StyleSheet.absoluteFill}>
      {paths.map((d, index) => <Path testID="learning-streak-connection" key={`bridge-${index}`} d={d} stroke={streak.border} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}
      {bands.map((d, index) => <G key={`band-${index}`}>
        <Path testID="learning-streak-connection" d={d} stroke={streak.border} strokeWidth={SIZE} strokeLinecap="round" fill="none" />
        <Path testID="learning-streak-band" d={d} stroke={streak.fill} strokeWidth={SIZE - 2} strokeLinecap="round" fill="none" />
      </G>)}
    </Svg>}
    {Array.from({ length: rows }, (_, row) => <View key={row} style={{ flexDirection: 'row', height: ROW_HEIGHT }}>
      {Array.from({ length: 7 }, (_, column) => {
        const day = row * 7 + column - first + 1;
        if (day < 1 || day > count) return <View key={column} style={{ flex: 1 }} />;
        const key = `${year}-${month}-${day}`;
        const local = learningDay(koreanDate(year, month, day));
        const actual = learningDays[key] ?? local;
        const rest = !actual.can_learn_new || !local.can_learn_new;
        const complete = !rest && completion.completedSet.has(key);
        const progress = completion.days[key];
        const partial = !rest && !complete && !!progress && progress.target > 0 && progress.done > 0;
        const isToday = todayKey === key;
        const name = actual.holiday_name || (local.reason === 'WEEKEND' ? '주말' : '휴무일');
        return <Pressable key={column} testID={`learning-calendar-day-${key}`} accessibilityRole="button"
          accessibilityLabel={`${month + 1}월 ${day}일${rest ? ` ${name} 신규 학습 쉬는 날, 복습 가능` : ' 신규 학습 가능'}${complete ? ', 학습완료' : partial ? `, 일부완료 ${progress.done}/${progress.target}` : ''}${isToday ? ', 오늘' : ''}, 학습·복습 기록 ${historyCounts[key] ?? 0}장, 복습 일정 ${dueCounts[key] ?? 0}장`}
          accessibilityState={{ selected: isToday }} onPress={() => onSelect(key)} style={{ flex: 1, alignItems: 'center', paddingTop: 1 }}>
          <View testID={complete ? 'learning-completed-day' : partial ? 'learning-partial-day' : undefined} style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: complete ? LEARNING_COMPLETE_COLOR : 'transparent', borderWidth: partial ? 2 : 0, borderColor: c.warning }}>
            {isToday && <View pointerEvents="none" style={{ position: 'absolute', width: SIZE + 4, height: SIZE + 4, left: partial ? -4 : -2, top: partial ? -4 : -2, borderRadius: (SIZE + 4) / 2, borderWidth: 1.5, borderColor: c.primary }} />}
            <Text style={{ fontSize: 13, fontWeight: '700', fontFamily: fontMono, color: complete ? '#FFFFFF' : isToday ? c.primary : rest ? c.textSecondary : c.textPrimary, opacity: rest && !isToday ? 0.55 : 1 }}>{day}</Text>
          </View>
          {(dueCounts[key] ?? 0) > 0 && <View testID="learning-review-dot" style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.warning, marginTop: 4 }} />}
        </Pressable>;
      })}
    </View>)}
  </View>;
}
