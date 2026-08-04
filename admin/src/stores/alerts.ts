import { ref } from 'vue';
import { api } from '../api/client';
import type { Dashboard } from '../api/types';

/**
 * 상단 바가 상시 지고 있는 알림.
 *
 *  · 처리되지 않은 신고 건수
 *  · 저장소가 죽었는지
 *  · 지금 점검 모드인지
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

/** 아직 처리되지 않은 신고 건수(OPEN+DOING). 처리하면 줄어든다. */
export const pendingReports = ref(0);
/** 저장소 연결 상태. 아직 확인 전이면 true 로 둔다 — 확인도 안 하고 빨간불을 켜지 않는다. */
export const storeHealthy = ref(true);
/**
 * 점검 모드가 켜져 있는가.
 *
 * 이것이야말로 "어느 화면에 있든 항상 참"인 사실이다. 설정 화면에서 켜고
 * 사용자 목록으로 넘어간 뒤 잊어버리면, 서비스가 몇 시간씩 닫혀 있어도
 * 아무도 알아채지 못한다. 실제로 그렇게 잠기는 것이 이 종류 사고의 전형이다.
 */
export const maintenanceOn = ref(false);
/** 한 번이라도 받아 봤는지. 받기 전에는 '0건'조차 말하지 않는다. */
export const alertsLoaded = ref(false);

const REFRESH_MS = 120_000;

/**
 * 첫 확인을 조금 미룬다.
 *
 * 대시보드로 들어오면 그 화면도 같은 응답(api.dashboard)을 받아 온다. 상단 바가
 * 마운트 즉시 따로 요청하면 **첫 화면에서 같은 질의가 두 번** 나간다.
 * 잠깐 기다렸다가, 그 사이 대시보드가 넘겨준 것(adopt)이 있으면 요청을 접는다.
 * 목록 화면으로 바로 들어온 경우에만 실제로 요청이 나간다.
 */
const FIRST_CHECK_MS = 1_500;

/** 이 시간 안에 받은 값이면 다시 받지 않는다. */
const FRESH_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;
let firstCheck: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let loadedAt = 0;

/** 서버에서 최신 상태를 받아 온다. 겹쳐 부르거나 값이 아직 싱싱하면 건너뛴다. */
export async function refreshAlerts(force = false): Promise<void> {
  if (inFlight) return;
  if (!force && loadedAt !== 0 && Date.now() - loadedAt < FRESH_MS) return;
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
  // 예전 서버는 ops 를 주지 않는다 — 없으면 '점검 아님'으로 둔다(없는 경고를 켜지 않는다).
  maintenanceOn.value = d.ops?.maintenance_yn ?? false;
  alertsLoaded.value = true;
  loadedAt = Date.now();
}

/**
 * 설정 화면이 점검 모드를 켜고 끈 직후 상단 바를 바로 맞춘다.
 *
 * 폴링(2분)을 기다리면 방금 켠 점검이 한동안 상단 바에 안 뜬다 — 그 사이
 * "정말 켜졌나?" 를 확인할 방법이 없어 관리자가 한 번 더 누르게 된다.
 */
export function setMaintenance(on: boolean): void {
  maintenanceOn.value = on;
}

/** 상단 바가 붙어 있는 동안만 돈다. */
export function startAlertPolling(): void {
  if (timer) return;
  // 첫 확인은 미룬다 — 대시보드가 먼저 넘겨주면 요청 자체가 필요 없다.
  firstCheck = setTimeout(() => void refreshAlerts(), FIRST_CHECK_MS);
  // 주기 확인은 '싱싱함'과 무관하게 돌아야 한다. 2분이면 어차피 낡았다.
  timer = setInterval(() => void refreshAlerts(true), REFRESH_MS);
}

export function stopAlertPolling(): void {
  if (timer) clearInterval(timer);
  if (firstCheck) clearTimeout(firstCheck);
  timer = null;
  firstCheck = null;
  loadedAt = 0;
  // 로그아웃 뒤 다음 사람의 화면에 이전 세션의 건수가 남지 않게 되돌린다.
  pendingReports.value = 0;
  storeHealthy.value = true;
  maintenanceOn.value = false;
  alertsLoaded.value = false;
}
