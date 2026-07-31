import { ref } from 'vue';
import { api } from '../api/client';
import type { Dashboard } from '../api/types';

/**
 * 상단 바가 상시 지고 있는 두 가지 알림.
 *
 *  · 처리되지 않은 신고 건수
 *  · 저장소가 죽었는지
 *
 * 왜 전역이어야 하나 — 지금까지 이 둘은 대시보드에만 떠 있었다. 그런데 관리자가
 * 하루 종일 머무는 곳은 사용자·문제 목록이지 대시보드가 아니다. 신고가 쌓이거나
 * 저장소가 끊겨도, 대시보드로 돌아가기 전까지는 알 방법이 없었다.
 * 급한 소식은 **보고 있는 화면이 무엇이든** 보여야 한다.
 *
 * ── 왜 폴링이 2분인가 ────────────────────────────────────────────────
 * 신고는 초 단위로 다투는 일이 아니다. 반대로 지표(요청량·오류율)는 초 단위라
 * SSE 로 받는다. 성격이 다른 두 데이터를 같은 주기로 맞출 이유가 없다 —
 * 신고 건수를 2초마다 세려고 집계 질의를 30배 더 돌리는 건 낭비다.
 *
 * 대시보드에 있는 동안에는 아예 요청하지 않는다. 그 화면이 이미 같은 응답을
 * 받아 오므로, 받은 것을 여기에 넘겨(adopt) 쓴다.
 */

/** 접수된 신고 건수. */
export const pendingReports = ref(0);
/** 저장소 연결 상태. 아직 확인 전이면 true 로 둔다 — 확인도 안 하고 빨간불을 켜지 않는다. */
export const storeHealthy = ref(true);
/** 한 번이라도 받아 봤는지. 받기 전에는 '0건'조차 말하지 않는다. */
export const alertsLoaded = ref(false);

const REFRESH_MS = 120_000;

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

/** 서버에서 최신 상태를 받아 온다. 겹쳐 부르면 뒤엣것은 그냥 무시한다. */
export async function refreshAlerts(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    adoptDashboard(await api.dashboard());
  } catch {
    /*
     * 실패를 삼킨다 — 이건 배경에서 도는 보조 요청이다. 토스트를 띄우면
     * 잠깐의 네트워크 끊김마다 화면 구석에서 오류가 튀어나온다.
     * 정말 서버가 죽었다면 실시간 표시등이 '연결 끊김'으로 말해 준다.
     */
  } finally {
    inFlight = false;
  }
}

/** 대시보드가 이미 받아 온 응답을 넘겨받는다(중복 요청 방지). */
export function adoptDashboard(d: Dashboard): void {
  pendingReports.value = d.content.reports;
  storeHealthy.value = d.service.store_healthy;
  alertsLoaded.value = true;
}

/** 상단 바가 붙어 있는 동안만 돈다. */
export function startAlertPolling(): void {
  if (timer) return;
  void refreshAlerts();
  timer = setInterval(() => void refreshAlerts(), REFRESH_MS);
}

export function stopAlertPolling(): void {
  if (timer) clearInterval(timer);
  timer = null;
  // 로그아웃 뒤 다음 사람의 화면에 이전 세션의 건수가 남지 않게 되돌린다.
  pendingReports.value = 0;
  storeHealthy.value = true;
  alertsLoaded.value = false;
}
