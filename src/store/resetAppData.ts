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

/**
 * 데이터 초기화 — 모든 학습·진행·개인 데이터를 '메모리에서 즉시' 비운다.
 *
 * AsyncStorage.clear() 는 디스크의 영속 데이터만 지우므로, 앱을 다시 켜기 전까지는
 * 각 zustand 스토어의 메모리 상태가 그대로 남아 '초기화했는데 학습완료로 남아있는'
 * 문제가 생겼다. 이 함수가 그 메모리 상태까지 한 번에 초기화한다.
 * (persist 스토어는 setState 시 다시 저장되지만, 이 호출은 AsyncStorage.clear() '이전'에
 *  실행하는 것을 전제로 한다 — 아래 settings 의 doReset 참고.)
 */
export function resetLearningStores(): void {
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
  useMomentStore.setState({ firstOpenAt: null, totalOpens: 0, lastOpenAt: null, celebrated: [] });
}
