import AsyncStorage from '@react-native-async-storage/async-storage';
import { DAILY_QUOTES, dailyQuote } from '../constants/dailyQuotes';

export const dailyWelcomeKey = (userId: string) => `daily-learning-welcome:v1:${encodeURIComponent(userId)}`;
export interface DailyWelcome { day: string; quoteIndex: number; streak: number; category: string; text: string }
let queue: Promise<unknown> = Promise.resolve();

/** Persist before showing: reopening the app and switching accounts cannot repeat today's popup. */
export function claimDailyWelcome(userId: string, day: string, streak: number, canShow = () => true, random = Math.random): Promise<DailyWelcome | null> {
  const task = queue.catch(() => {}).then(async () => {
    if (!userId || !canShow()) return null;
    const key = dailyWelcomeKey(userId);
    const raw = await AsyncStorage.getItem(key);
    let previous: { day?: string; days?: string[]; quoteIndex?: number } = {};
    try { previous = raw ? JSON.parse(raw) : {}; } catch { /* Ignore an invalid legacy record. */ }
    const shownDays = Array.isArray(previous?.days) ? previous.days.filter(value => typeof value === 'string') : previous?.day ? [previous.day] : [];
    if (shownDays.includes(day) || !canShow()) return null;
    const last = Number.isInteger(previous?.quoteIndex) && previous.quoteIndex! >= 0 && previous.quoteIndex! < DAILY_QUOTES.length ? previous.quoteIndex! : -1;
    const poolSize = DAILY_QUOTES.length - (last >= 0 ? 1 : 0);
    const value = random();
    const picked = Math.min(poolSize - 1, Math.max(0, Math.floor((Number.isFinite(value) ? value : 0) * poolSize)));
    const quoteIndex = last >= 0 && picked >= last ? picked + 1 : picked;
    const result = { day, quoteIndex, streak: Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0, ...dailyQuote(quoteIndex) };
    if (!canShow()) return null;
    await AsyncStorage.setItem(key, JSON.stringify({ day, days: [...shownDays, day].slice(-31), quoteIndex }));
    return result;
  });
  queue = task.catch(() => {});
  return task;
}
