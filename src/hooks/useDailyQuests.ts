import { useMemo } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { useSrsStore } from '../store/srsStore';
import { useSettingsStore } from '../store/settingsStore';
import { dateKey } from '../utils/dateKey';

export interface Quest {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  progress: number;
  target: number;
  done: boolean;
}

/**
 * 일일 미션 — 오늘의 학습 활동에서 파생되는 데일리 퀘스트(체류·복귀 유도 장치).
 * 복습 채점 시 srsStore 히스토리에 오늘 기록이 쌓이므로 진행도가 실시간 반영된다.
 *
 * 복습은 미션으로 두지 않는다. '복습 모두 마무리' 같은 항목을 넣으면 남은 복습이
 * 있는 날은 자동으로 미완이 되고, 사용자가 선택할 일이 갚아야 할 몫으로 바뀐다.
 */
export function useDailyQuests() {
  const history = useSrsStore((s) => s.history);
  const dailyTarget = useSettingsStore((s) => s.dailyTarget);

  const todayCount = history[dateKey(new Date())]?.length ?? 0;
  const goal = Math.max(3, Math.min(dailyTarget, 12));

  const quests = useMemo<Quest[]>(() => {
    const mk = (id: string, label: string, icon: Quest['icon'], progress: number, target: number): Quest => ({
      id, label, icon, progress: Math.min(progress, target), target, done: progress >= target,
    });
    return [
      mk('start', '3분 학습 시작하기', 'flame', todayCount >= 1 ? 1 : 0, 1),
      mk('goal', `오늘 ${goal}개 학습`, 'school', todayCount, goal),
    ];
  }, [todayCount, goal]);

  const completed = quests.filter((q) => q.done).length;
  return { quests, completed, total: quests.length, allDone: completed === quests.length };
}
