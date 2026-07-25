// RN 모듈(AsyncStorage)에 의존하므로 components 프로젝트(jest-expo)에서 돌린다.
import { useDailyLearningStore } from '../dailyLearningStore';
import { dateKey } from '../../utils/dateKey';

const today = () => dateKey(new Date());

describe('dailyLearningStore 하루 할당량', () => {
  beforeEach(() => {
    useDailyLearningStore.setState({ dayKey: today(), newLearnedToday: 0 });
  });

  it('학습을 기록하면 오늘 카운트가 올라간다', () => {
    useDailyLearningStore.getState().recordNewLearned();
    useDailyLearningStore.getState().recordNewLearned(2);
    expect(useDailyLearningStore.getState().usedToday()).toBe(3);
  });

  it('어제 기록이 남아 있으면 오늘 사용량은 0으로 읽힌다', () => {
    useDailyLearningStore.setState({ dayKey: '2000-1-1', newLearnedToday: 3 });
    expect(useDailyLearningStore.getState().usedToday()).toBe(0);
  });

  it('날짜가 바뀐 뒤 기록하면 이어 세지 않고 새로 센다', () => {
    useDailyLearningStore.setState({ dayKey: '2000-1-1', newLearnedToday: 3 });
    useDailyLearningStore.getState().recordNewLearned();
    expect(useDailyLearningStore.getState().newLearnedToday).toBe(1);
    expect(useDailyLearningStore.getState().dayKey).toBe(today());
  });

  describe('rolloverIfNeeded (자정 넘김 반영)', () => {
    it('날짜가 지났으면 상태를 오늘 기준으로 초기화한다', () => {
      useDailyLearningStore.setState({ dayKey: '2000-1-1', newLearnedToday: 3 });
      useDailyLearningStore.getState().rolloverIfNeeded();
      expect(useDailyLearningStore.getState().dayKey).toBe(today());
      expect(useDailyLearningStore.getState().newLearnedToday).toBe(0);
    });

    it('같은 날이면 상태를 건드리지 않는다(불필요한 리렌더 방지)', () => {
      useDailyLearningStore.setState({ dayKey: today(), newLearnedToday: 2 });
      const before = useDailyLearningStore.getState();
      useDailyLearningStore.getState().rolloverIfNeeded();
      const after = useDailyLearningStore.getState();
      expect(after.newLearnedToday).toBe(2);
      expect(after.dayKey).toBe(before.dayKey);
    });

    it('구독자가 자정 넘김을 감지할 수 있게 상태 변경을 알린다', () => {
      useDailyLearningStore.setState({ dayKey: '2000-1-1', newLearnedToday: 3 });
      const seen: number[] = [];
      const unsub = useDailyLearningStore.subscribe((s) => seen.push(s.newLearnedToday));
      useDailyLearningStore.getState().rolloverIfNeeded();
      unsub();
      expect(seen).toContain(0); // 리렌더를 유발하는 실제 상태 변경이 일어났다
    });
  });
});
