import { useLearningDay } from './useLearningDay';
import { useLearningCalendar } from './useLearningCalendar';

/** Use the same server/offline calendar for entry points and the calendar view. */
export function useCurrentLearningDay() {
  const local = useLearningDay();
  const [year, month, day] = local.date.split('-').map(Number);
  const calendar = useLearningCalendar(year, month - 1);
  return calendar[`${year}-${month - 1}-${day}`] ?? local;
}
