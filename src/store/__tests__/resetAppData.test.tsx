/**
 * 지울 목록이 두 곳(메모리/디스크)에서 어긋나지 않는지 지킨다.
 *
 * 사용자 데이터의 사본은 두 군데 산다 — zustand 의 메모리 상태와 AsyncStorage 의
 * persist 키. 어느 한쪽만 지우면 조용히 되살아난다. 디스크만 지우면 메모리에 남은
 * 스토어가 다음 setState 때 그대로 다시 써지고, 메모리만 지우면 앱을 다시 켤 때
 * 디스크에서 돌아온다. 그래서 두 목록은 늘 같은 것을 가리켜야 한다.
 */
import { resetUserScopedStores, resetAllLocalData } from '../resetAppData';
import { USER_SCOPED_PERSIST_KEYS } from '../sessionScope';
import { useAttendanceStore } from '../attendanceStore';
import { useBookmarkStore } from '../bookmarkStore';
import { useLikeStore } from '../likeStore';
import { useReportStore } from '../reportStore';
import { useDiffPollStore } from '../diffPollStore';
import { useQnaStore } from '../qnaStore';
import { useShareFeedStore } from '../shareFeedStore';
import { useTipStore } from '../tipStore';
import { useMomentStore } from '../momentStore';
import { useAuthoredCardsStore } from '../authoredCardsStore';
import { useCardProgressStore } from '../cardProgressStore';
import { useCollectionStore } from '../collectionStore';
import { useDailyLearningStore } from '../dailyLearningStore';
import { useFactionStore } from '../factionStore';
import { useNotificationStore } from '../notificationStore';
import { useSrsStore } from '../srsStore';

/**
 * persist 키 → (앞사람 흔적을 심는다, 아직 남아 있는가).
 *
 * USER_SCOPED_PERSIST_KEYS 와 **정확히 같은 키 집합**이어야 한다. 그 검사가
 * 이 파일의 본체다 — 사용자 데이터를 담는 스토어가 새로 생겼는데 한쪽 목록에만
 * 들어가면, 그 스토어만 사람이 바뀌어도 살아남는다.
 */
const SCOPED: Record<string, { fill: () => void; occupied: () => boolean }> = {
  attendance: {
    fill: () => useAttendanceStore.setState({ stamps: { '2026-7-1': true } as never }),
    occupied: () => Object.keys(useAttendanceStore.getState().stamps).length > 0,
  },
  'authored-cards': {
    fill: () => useAuthoredCardsStore.setState({ cards: [{ id: 'c1' }] as never }),
    occupied: () => useAuthoredCardsStore.getState().cards.length > 0,
  },
  bookmarks: {
    fill: () => useBookmarkStore.setState({ ids: ['c1'] }),
    occupied: () => useBookmarkStore.getState().ids.length > 0,
  },
  'card-progress': {
    fill: () => useCardProgressStore.setState({ status: { c1: 'mastered' } as never }),
    occupied: () => Object.keys(useCardProgressStore.getState().status).length > 0,
  },
  'card-likes': {
    fill: () => useLikeStore.setState({ ids: ['c1'] }),
    occupied: () => useLikeStore.getState().ids.length > 0,
  },
  'card-reports': {
    fill: () => useReportStore.setState({ reports: [{ cardId: 'c1', reason: '오탈자' }] as never }),
    occupied: () => useReportStore.getState().reports.length > 0,
  },
  'card-tips': {
    fill: () => useTipStore.setState({ tips: [{ id: 't1' }] as never }),
    occupied: () => useTipStore.getState().tips.length > 0,
  },
  collection: {
    fill: () => useCollectionStore.setState({ owned: { c1: 2 }, newIds: ['c1'] } as never),
    occupied: () => Object.keys(useCollectionStore.getState().owned).length > 0,
  },
  'daily-learning': {
    fill: () => useDailyLearningStore.setState({ newLearnedToday: 3 } as never),
    occupied: () => useDailyLearningStore.getState().newLearnedToday > 0,
  },
  'diff-poll': {
    fill: () => useDiffPollStore.setState({ myVotes: { c1: 'easy' } as never }),
    occupied: () => Object.keys(useDiffPollStore.getState().myVotes).length > 0,
  },
  faction: {
    fill: () => useFactionStore.setState({ faction: 'flame' } as never),
    occupied: () => useFactionStore.getState().faction !== null,
  },
  notifications: {
    fill: () => useNotificationStore.setState({ items: [{ id: 'n1' }] as never }),
    occupied: () => useNotificationStore.getState().items.length > 0,
  },
  qna: {
    fill: () => useQnaStore.setState({ questions: [{ id: 'q1' }] as never }),
    occupied: () => useQnaStore.getState().questions.length > 0,
  },
  'share-feed': {
    fill: () => useShareFeedStore.setState({ posts: [{ id: 'p1' }] as never }),
    occupied: () => useShareFeedStore.getState().posts.length > 0,
  },
  'srs-scheduler': {
    fill: () => useSrsStore.setState({ cards: { c1: { box: 2 } }, history: { '2026-7-1': ['c1'] } } as never),
    occupied: () => Object.keys(useSrsStore.getState().cards).length > 0,
  },
};

/** 모든 사용자 종속 스토어에 앞사람 흔적을 심는다. */
function fillUserData(): void {
  for (const k of Object.keys(SCOPED)) SCOPED[k].fill();
}

it('디스크에서 지우는 키마다 메모리를 비우는 짝이 있다', () => {
  // 목록이 늘었는데 이 표가 안 늘었다면 여기서 먼저 걸린다.
  expect(Object.keys(SCOPED).sort()).toEqual([...USER_SCOPED_PERSIST_KEYS].sort());

  fillUserData();
  // 심은 흔적이 실제로 남았는지 먼저 확인한다 — 안 심겼으면 아래 검사가 공회전한다.
  for (const key of USER_SCOPED_PERSIST_KEYS) {
    expect([key, SCOPED[key].occupied()]).toEqual([key, true]);
  }

  resetUserScopedStores();

  for (const key of USER_SCOPED_PERSIST_KEYS) {
    expect([key, SCOPED[key].occupied()]).toEqual([key, false]);
  }
});

it('사용자 전환은 기기 단위 기록(app-moments)을 건드리지 않는다', () => {
  // 사람이 바뀌어도 그 기기의 첫 실행 시각·누적 실행 횟수는 그대로다.
  useMomentStore.setState({ firstOpenAt: '2026-01-01T00:00:00.000Z', totalOpens: 7, lastOpenAt: '2026-08-01T00:00:00.000Z', celebrated: ['first'] });
  resetUserScopedStores();
  expect(useMomentStore.getState().totalOpens).toBe(7);
  expect(useMomentStore.getState().firstOpenAt).toBe('2026-01-01T00:00:00.000Z');
});

it('전체 초기화는 기기 단위 기록까지 비운다', () => {
  useMomentStore.setState({ firstOpenAt: '2026-01-01T00:00:00.000Z', totalOpens: 7, lastOpenAt: '2026-08-01T00:00:00.000Z', celebrated: ['first'] });
  resetAllLocalData();
  expect(useMomentStore.getState().totalOpens).toBe(0);
  expect(useMomentStore.getState().firstOpenAt).toBeNull();
});

it('전체 초기화도 Q&A·자랑 피드·현장 팁을 메모리에서 비운다', () => {
  fillUserData();
  resetAllLocalData();
  expect(useQnaStore.getState().questions).toEqual([]);
  expect(useShareFeedStore.getState().posts).toEqual([]);
  expect(useTipStore.getState().tips).toEqual([]);
});
