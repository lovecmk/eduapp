import { dateKey } from '../utils/dateKey';
import { useSrsStore } from './srsStore';
import { useCardStore } from './cardStore';
import { useCardProgressStore } from './cardProgressStore';
import { useStatsStore } from './statsStore';
import { useFactionStore } from './factionStore';
import { useAttendanceStore } from './attendanceStore';
import { useCollectionStore } from './collectionStore';
import { useBookmarkStore } from './bookmarkStore';
import { useLikeStore } from './likeStore';
import { useReportStore } from './reportStore';
import { useDiffPollStore } from './diffPollStore';
import { useDailyLearningStore } from './dailyLearningStore';
import { useMomentStore } from './momentStore';
import { useAuthoredCardsStore } from './authoredCardsStore';
import { useNotificationStore } from './notificationStore';
import { resetQnaStore } from './qnaStore';
import { useShareFeedStore } from './shareFeedStore';
import { useTipStore } from './tipStore';

/**
 * 사용자에게 종속된 스토어의 '메모리' 상태를 비운다.
 *
 * 이 목록은 `sessionScope.USER_SCOPED_PERSIST_KEYS`(디스크에서 지울 키)와 **같은
 * 것의 다른 사본**이다. 둘이 어긋나면 한쪽만 지워지는데, 그게 조용히 나쁘다.
 * 디스크만 지우면 아직 메모리에 남은 스토어가 다음 setState 때 그대로 다시 써져
 * 되살아나고(persist), 메모리만 지우면 앱을 다시 켤 때 디스크에서 돌아온다.
 * ⚠️ 어느 한쪽에 스토어를 추가하면 반드시 다른 쪽에도 추가할 것.
 *
 * AsyncStorage.clear() 는 디스크의 영속 데이터만 지우므로, 앱을 다시 켜기 전까지는
 * 각 zustand 스토어의 메모리 상태가 그대로 남아 '초기화했는데 학습완료로 남아있는'
 * 문제가 생겼다. 이 함수가 그 메모리 상태까지 한 번에 초기화한다.
 * (persist 스토어는 setState 시 다시 저장되지만, 이 호출은 AsyncStorage.clear() '이전'에
 *  실행하는 것을 전제로 한다 — settings 의 doReset 참고.)
 */
export function resetUserScopedStores(): void {
  useCardProgressStore.getState().reset();
  useSrsStore.getState().reset();
  useCardStore.getState().reset();
  useStatsStore.getState().reset();
  useFactionStore.getState().reset();
  useCollectionStore.getState().reset();
  useAuthoredCardsStore.getState().clear();
  useNotificationStore.getState().clearAll();
  useAttendanceStore.setState({ stamps: {} });
  useBookmarkStore.setState({ ids: [] });
  useLikeStore.setState({ ids: [] });
  useReportStore.setState({ reports: [] });
  useDiffPollStore.setState({ myVotes: {} });
  useDailyLearningStore.setState({ dayKey: dateKey(new Date()), newLearnedToday: 0 });
  resetQnaStore();
  useShareFeedStore.setState({ posts: [] });
  useTipStore.setState({ tips: [] });
}

/**
 * 전체 초기화(설정 → 데이터 초기화) — 사용자 데이터 **+ 기기 단위 기록**까지 비운다.
 *
 * 사용자 전환(sessionScope)과 나누는 이유: 그쪽은 "다음 사람에게 앞사람 것이
 * 보이지 않게" 하는 일이라 기기 기록(첫 실행 시각·누적 실행 횟수)까지 지울 이유가
 * 없다. 반면 이쪽은 사용자가 "이 기기의 내 흔적을 전부 지운다"고 누른 것이므로
 * 남길 이유가 없다. 둘을 한 함수로 두면 한쪽 요구에 맞춰 고칠 때마다 다른 쪽이
 * 조용히 어긋난다 — 실제로 그렇게 어긋나 있었다(momentStore).
 */
export function resetAllLocalData(): void {
  resetUserScopedStores();
  useMomentStore.setState({ firstOpenAt: null, totalOpens: 0, lastOpenAt: null, celebrated: [] });
}
