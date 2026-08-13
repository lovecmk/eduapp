import { useQuery } from '@tanstack/react-query';
import { serviceConfigRepository } from '../data/repositories';
import { defaultServiceConfig } from '../domain/models/ServiceConfig';
import { DAILY_MIN_CARDS, DAILY_MAX_CARDS } from '../constants/learning';

/**
 * 서비스 운영 상태(점검 모드·공지 배너·하루 상한).
 *
 * ── 왜 5분인가 ────────────────────────────────────────────────────────
 * 관리자가 콘솔에서 배너를 올리면 '오늘 안에' 닿으면 되는 종류의 정보다.
 * 학습 데이터처럼 초 단위로 다투지 않는다. 반대로 너무 길게 잡으면 내린
 * 공지가 하루 종일 남아, 끝난 일정이 계속 떠 있게 된다.
 *
 * 실패는 조용히 삼킨다 — 이 값을 못 읽었다고 화면에 오류를 띄우면, 지하에서
 * 잠깐 끊긴 것만으로 앱이 고장난 것처럼 보인다. 진짜 점검 중이라면 다른
 * 모든 요청이 503 으로 막혀 사용자는 어차피 알게 된다.
 *
 * ── 점검 중에는 5분이 너무 길다 ───────────────────────────────────────
 * 점검이 걸리면 이 값이 화면 전체를 덮는다(MaintenanceGate). 그 상태에서 5분을
 * 기다리면, 점검이 실제로 끝난 뒤에도 최대 5분 동안 "점검 중입니다"가 남는다 —
 * 사용자는 앱을 지웠다 깔거나 문의를 넣는다. 덮여 있는 동안에는 짧게 다시 묻는다.
 */
const NORMAL_POLL_MS = 5 * 60_000;
const MAINTENANCE_POLL_MS = 30_000;

export function useServiceConfig() {
  const query = useQuery({
    queryKey: ['service-config'],
    queryFn: () => serviceConfigRepository.get(),
    staleTime: (q) => (q.state.data?.maintenance ? 0 : NORMAL_POLL_MS),
    refetchInterval: (q) => (q.state.data?.maintenance ? MAINTENANCE_POLL_MS : false),
    retry: 1,
  });

  // 화면이 `data?.` 를 반복하지 않도록 항상 값이 있는 형태로 준다.
  // 못 읽었을 때의 기본값은 '평상시'다 — 실패는 서비스가 열려 있는 쪽으로 기운다.
  return {
    ...query,
    config: query.data ?? defaultServiceConfig(DAILY_MIN_CARDS, DAILY_MAX_CARDS),
  };
}
