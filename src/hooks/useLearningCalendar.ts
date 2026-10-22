import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSrsStore } from '../store/srsStore';
import { apiClient } from '../data/network/ApiClient';
import { koreanDate, learningDay, type LearningDay } from '../utils/workday';

export function useLearningCalendar(year: number, month0: number) {
  const { data } = useQuery({
    queryKey: ['learning-calendar', year, month0],
    queryFn: () => apiClient.get<{ timezone: string; year: number; month: number; days: LearningDay[] }>(`/inner/api/v1/learning/calendar?year=${year}&month=${month0 + 1}`),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  useEffect(() => {
    if (data?.timezone !== 'Asia/Seoul' || data.year !== year || data.month !== month0 + 1 || !Array.isArray(data.days)) return;
    const rest: Record<string, string> = {};
    for (const day of data.days) {
      if (day?.can_learn_new !== false || typeof day.date !== 'string') continue;
      const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.date);
      if (!parts || Number(parts[1]) !== year || Number(parts[2]) !== month0 + 1) continue;
      const date = koreanDate(year, month0, Number(parts[3]));
      if (learningDay(date).date !== day.date) continue;
      rest[`${year}-${month0}-${Number(parts[3])}`] = day.holiday_name || '휴무일';
    }
    useSrsStore.getState().applyCalendar(year, month0, rest);
  }, [data, year, month0]);
  const result: Record<string, LearningDay> = {};
  const count = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  for (let day = 1; day <= count; day++) {
    const local = learningDay(koreanDate(year, month0, day));
    const remote = data?.timezone === 'Asia/Seoul' && data.year === year && data.month === month0 + 1 && Array.isArray(data.days) ? data.days.find(day => day?.date === local.date) : undefined;
    result[`${year}-${month0}-${day}`] = remote && typeof remote.can_learn_new === 'boolean' && typeof remote.holiday_name === 'string'
      ? { ...local, can_learn_new: local.can_learn_new && remote.can_learn_new, holiday_name: remote.holiday_name || local.holiday_name,
        reason: local.reason || (remote.can_learn_new ? '' : 'HOLIDAY') }
      : local;
  }
  return result;
}
