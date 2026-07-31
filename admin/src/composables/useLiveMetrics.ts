import { ref, shallowRef, onMounted, onUnmounted } from 'vue';
import { api } from '../api/client';
import type { MetricsSnapshot } from '../api/types';

/**
 * 실시간 지표 구독 — 화면 몇 개가 보든 **연결은 하나**.
 *
 * 서버가 SSE 로 2초마다 스냅샷을 밀어 준다. 여기서는 그것을 받아 반응형 값으로
 * 노출하고, 연결이 살아 있는지(live)를 함께 알린다 — 화면이 멈췄는데 사용자가
 * 그걸 모르면 옛 숫자를 현재로 착각한다. 끊기면 반드시 눈에 보여야 한다.
 *
 * ── 왜 모듈 하나가 상태를 갖는가 ──────────────────────────────────────
 * 처음에는 호출할 때마다 스트림을 새로 열었다. 화면 하나가 쓸 때는 문제가 없었지만,
 * 상단 바가 연결 상태를 상시 표시하게 되면서 **대시보드에서 연결이 두 개**가 됐다.
 * 같은 데이터를 두 번 받으려고 서버 자원을 두 배로 쓸 이유가 없다.
 *
 * 그래서 연결과 최신 스냅샷을 모듈 수준에 한 벌 두고, 구독자 수를 센다.
 * 0 → 1 에서 열고, 1 → 0 에서 닫는다. 로그아웃하면 상단 바가 사라지므로
 * 구독자가 0이 되어 연결도 함께 정리된다.
 *
 * 덤으로 화면을 옮길 때 표시등이 깜빡이지 않는다 — 상단 바가 구독을 놓지 않으므로
 * 연결이 끊겼다 다시 붙지 않는다.
 */

const snapshot = shallowRef<MetricsSnapshot | null>(null);
const live = ref(false);
const lastUpdate = ref<Date | null>(null);

let subscribers = 0;
let close: (() => void) | null = null;

function open(): void {
  if (close) return;
  close = api.openStream(
    (s) => {
      snapshot.value = s;
      lastUpdate.value = new Date();
    },
    (isLive) => {
      live.value = isLive;
    },
  );
}

function shutdown(): void {
  close?.();
  close = null;
  live.value = false;
  /*
   * 스냅샷도 버린다. 남겨 두면 다음 로그인 때 **이전 세션의 숫자**가 잠깐 보인다.
   * 옛 값을 현재로 착각하게 만드는 것이 이 콘솔에서 가장 피해야 할 일이다.
   */
  snapshot.value = null;
  lastUpdate.value = null;
}

export function useLiveMetrics() {
  onMounted(() => {
    subscribers += 1;
    if (subscribers === 1) open();
  });

  onUnmounted(() => {
    subscribers -= 1;
    if (subscribers <= 0) {
      subscribers = 0;
      shutdown();
    }
  });

  return { snapshot, live, lastUpdate };
}

/** 테스트용 — 구독자 수가 새는지 확인한다. */
export function __subscriberCount(): number {
  return subscribers;
}
