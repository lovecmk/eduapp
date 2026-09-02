import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { dateKey } from '../utils/dateKey';
import { logger } from '../utils/logger';
import { useDailyLearningStore } from '../store/dailyLearningStore';
import { apiClient } from '../data/network/ApiClient';

/**
 * 백그라운드 → 복귀(포그라운드) 처리 정책.
 *
 * 이 앱의 화면은 대부분 "오늘"에 묶여 있다(오늘의 학습 n/3, 오늘 복습, 출석 달력, 연속 일수).
 * 그런데 사용자는 앱을 종료하지 않고 홈 버튼만 눌러 며칠씩 백그라운드에 두는 일이 흔하다.
 * 이때 아무 처리도 하지 않으면 다음 날 앱을 다시 열었을 때
 *  · '오늘의 학습'이 어제 진행도(3/3 완료)로 남아 오늘 학습을 시작할 수 없고,
 *  · 달력·연속 일수가 어제 기준으로 굳어 있어 사용자가 버그로 느낀다.
 *
 * 그래서 복귀 시점에 두 가지를 판단한다.
 *  1) 날짜가 바뀌었나(자정 넘김)  → '오늘' 기준 데이터를 전부 다시 불러온다.
 *  2) 얼마나 오래 나가 있었나     → 짧게 다녀왔으면(전화 확인 등) 굳이 새로고침하지 않는다.
 *     길게 나가 있었으면 실시간성 데이터(커뮤니티·통계)만 갱신한다.
 *
 * 임계값을 둔 이유: 복귀할 때마다 전부 리페치하면 앱 전환이 잦은 사용자에게
 * 불필요한 네트워크·로딩 깜빡임이 생긴다. "잠깐 나갔다 옴"과 "오래 비움"을 구분한다.
 */

/** 이 시간 이상 백그라운드에 있었으면 '오래 비움'으로 보고 데이터를 갱신한다. */
export const STALE_BACKGROUND_MS = 5 * 60_000; // 5분

// react-query 의 invalidateQueries 는 키 '접두사'로 매칭한다.
// ['cards'] 하나로 ['cards'], ['cards','today',...] 가 모두 포함된다.
/**
 * 날짜가 바뀌면 반드시 갱신해야 하는, '오늘'에 묶인 쿼리 키들.
 *
 * 하루 상한·오늘의 편성도 여기 든다. 둘 다 키에 날짜를 달고 있어 화면이 다시
 * 그려지면 저절로 갈리지만, 자정을 넘긴 뒤 **처음 앱을 다시 열었을 때** 어제
 * 응답이 화면에 한 프레임이라도 남지 않도록 여기서도 함께 지운다.
 */
const DAY_SCOPED_KEYS = [['cards'], ['stats'], ['learning-quota'], ['daily-assignment']];

/** 오래 비웠을 때만 갱신하면 되는, 실시간성 데이터. */
const LIVE_KEYS = [['community-live'], ['stats']];

export function useAppResume(): void {
  const queryClient = useQueryClient();
  // 마지막으로 백그라운드로 나간 시각과 그때의 날짜.
  const leftAtRef = useRef<number | null>(null);
  // Date.now() 기준으로 오늘을 구한다(테스트에서 시계를 고정할 수 있게).
  const lastDayRef = useRef<string>(dateKey(new Date(Date.now())));

  useEffect(() => {
    const handleChange = (status: AppStateStatus) => {
      if (status === 'background' || status === 'inactive') {
        // 'inactive'(iOS 알림센터·통화 오버레이 등)에서도 시각을 기록해두면,
        // 곧바로 background 로 이어질 때 시작점을 놓치지 않는다.
        if (leftAtRef.current === null) leftAtRef.current = Date.now();
        return;
      }
      if (status !== 'active') return;

      const awayMs = leftAtRef.current === null ? 0 : Date.now() - leftAtRef.current;
      leftAtRef.current = null;

      // 네트워크가 끊겼던 동안 쌓인 쓰기(출석·채점·신고)를 우선 흘려보낸다.
      // 사용자가 이미 '했다고 믿는' 행동이라 무엇보다 먼저 서버에 반영되어야 한다.
      void apiClient.flushPendingWrites();

      const today = dateKey(new Date(Date.now()));
      const dayChanged = today !== lastDayRef.current;
      lastDayRef.current = today;

      if (dayChanged) {
        // 자정을 넘겼다 → '오늘' 기준 데이터를 전부 다시 계산해야 한다.
        // 로컬 할당량 스토어도 새 날짜로 굴려준다. (usedToday() 는 읽을 때 날짜를 비교하지만,
        //  스토어 값 자체가 바뀌지 않으면 구독 중인 화면이 리렌더되지 않아 어제 진행도가 남는다.)
        useDailyLearningStore.getState().rolloverIfNeeded();
        DAY_SCOPED_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
        logger.info('app_resume_day_changed', { awayMs, today });
        return;
      }

      if (awayMs >= STALE_BACKGROUND_MS) {
        // 같은 날이지만 오래 비웠다 → 실시간성 데이터만 가볍게 갱신.
        LIVE_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
        logger.info('app_resume_stale', { awayMs });
      }
      // 잠깐 다녀온 경우: 아무것도 하지 않는다(불필요한 로딩 깜빡임 방지).
    };

    const sub = AppState.addEventListener('change', handleChange);
    return () => sub.remove();
  }, [queryClient]);
}
