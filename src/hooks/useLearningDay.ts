import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { learningDay } from '../utils/workday';

/** Refresh across Korean midnight, including an app returning from background. */
export function useLearningDay() {
  const [day, setDay] = useState(() => learningDay());
  useEffect(() => {
    const refresh = () => setDay(learningDay());
    const timer = setInterval(refresh, 30_000);
    const listener = AppState.addEventListener('change', refresh);
    return () => { clearInterval(timer); listener.remove(); };
  }, []);
  return day;
}
