/**
 * 오프라인 편성이 **운영값**을 따르는지.
 *
 * 이 앱은 지하·철골 구조물에서 쓰여 서버에 닿지 못한 채 도는 날이 흔하다. 그때
 * 편성이 컴파일된 상수만 본다면, 운영자가 "이번 주는 적게"라고 줄여도 현장 기기만
 * 옛 분량으로 돈다 — 같은 사람이 사무실에서 3장, 현장에서 5장을 받는다. 아무도
 * 오류를 보지 못하므로 이런 어긋남은 검사로만 잡힌다.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});

// 편성기는 '누구의 하루인가'만 알면 된다. 진짜 authStore 를 끌어오면 저장소 싱글턴 →
// env → expo-constants 까지 딸려 와, RN 없이 도는 로직 테스트에서 실행되지 않는다.
jest.mock('../../../store/authStore', () => ({
  useAuthStore: { getState: () => ({ user: null }) },
}));

import { MockDailyAssignmentRepository } from '../DailyAssignmentRepository.mock';
import { useServerPolicyStore } from '../../../store/serverPolicyStore';
import { DAILY_MIN_CARDS, DAILY_MAX_CARDS } from '../../../constants/learning';

const repo = new MockDailyAssignmentRepository();

afterEach(() => {
  useServerPolicyStore.setState({ dailyMinCards: DAILY_MIN_CARDS, dailyMaxCards: DAILY_MAX_CARDS });
});

describe('MockDailyAssignmentRepository — 출제 범위의 출처', () => {
  it('운영값을 확인한 적이 없으면 앱 기본 범위 안에서 낸다', async () => {
    const a = await repo.get();
    expect(a.targetCount).toBeGreaterThanOrEqual(DAILY_MIN_CARDS);
    expect(a.targetCount).toBeLessThanOrEqual(DAILY_MAX_CARDS);
  });

  it('운영자가 범위를 줄이면 오프라인 편성도 줄어든다', async () => {
    useServerPolicyStore.setState({ dailyMinCards: 1, dailyMaxCards: 2 });
    const a = await repo.get();
    expect(a.targetCount).toBeLessThanOrEqual(2);
    expect(a.cards.length).toBeLessThanOrEqual(2);
  });
});
