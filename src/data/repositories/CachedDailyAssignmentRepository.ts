import AsyncStorage from '@react-native-async-storage/async-storage';
import { DailyAssignmentRepository, type TodayPlanDTO } from './DailyAssignmentRepository';
import type { IDailyAssignmentRepository } from '../../domain/repositories/IDailyAssignmentRepository';
import { secureStorage, StorageKeys } from '../storage/secureStorage';
import { env } from '../network/env';
import { ApiError } from '../network/errors';
import { getSessionEpoch, assertSessionEpoch } from '../network/sessionEpoch';
import { useSrsStore } from '../../store/srsStore';

const CACHE_KEY = 'live-daily-assignment';
export function serverDayKey(now = Date.now()): string {
  const at = new Date(now + 9 * 3600000);
  return `${at.getUTCFullYear()}-${at.getUTCMonth()}-${at.getUTCDate()}`;
}
async function cacheOwner(): Promise<string | null> {
  try {
    const raw = await secureStorage.getItem(StorageKeys.cachedUser);
    const id = raw ? JSON.parse(raw).id : null;
    return (typeof id === 'string' && id.length > 0) || (typeof id === 'number' && Number.isFinite(id)) ? String(id) : null;
  } catch { return null; }
}
export class LiveDailyAssignmentRepository extends DailyAssignmentRepository {
  constructor() {
    super(async dto => {
      const epoch = getSessionEpoch();
      const owner = await cacheOwner();
      assertSessionEpoch(epoch);
      if (owner) await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ owner, server: env.apiBaseUrl, dto }));
    });
  }
}
/** Only today's validated server deck can be studied during a live outage. */
export class CachedDailyAssignmentRepository implements IDailyAssignmentRepository {
  async get() {
    const epoch = getSessionEpoch();
    let cached: { owner?: string; server?: string; dto?: TodayPlanDTO } | null = null;
    try { cached = JSON.parse(await AsyncStorage.getItem(CACHE_KEY) ?? 'null'); } catch { /* invalid cache */ }
    const owner = await cacheOwner();
    assertSessionEpoch(epoch);
    if (!owner || cached?.owner !== owner || cached.server !== env.apiBaseUrl || cached.dto?.day !== serverDayKey()) {
      throw new ApiError(0, '오늘 서버에서 받은 학습카드가 없습니다. 연결 후 다시 시도해주세요.', 'offline');
    }
    const result = new DailyAssignmentRepository().parse(cached.dto);
    const studied = new Set(useSrsStore.getState().history[result.day] ?? []);
    result.cards = result.cards.map(item => ({ ...item, done: item.done || studied.has(item.card.id) }));
    result.doneCount = result.cards.filter(item => item.done).length;
    return result;
  }
}
