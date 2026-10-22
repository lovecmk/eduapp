import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { learningDay } from '../utils/workday';

/** Refresh across Korean midnight, including an app returning from background. */
export function useLearningDay() {
  const [day, setDay] = useState(() => learningDay());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = Date.now();
      const untilMidnight = 86_400_000 - (now + 9 * 3_600_000) % 86_400_000;
      timer = setTimeout(refresh, Math.min(30_000, untilMidnight));
    };
    const refresh = () => { clearTimeout(timer); setDay(learningDay()); schedule(); };
    schedule();
    const listener = AppState.addEventListener('change', refresh);
    return () => { clearTimeout(timer); listener.remove(); };
  }, []);
  return day;
}
