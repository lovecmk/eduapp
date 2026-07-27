import { ref, shallowRef, onMounted, onUnmounted } from 'vue';
import { api } from '../api/client';
import type { MetricsSnapshot } from '../api/types';

/**
 * 실시간 지표 구독.
 *
 * 서버가 SSE 로 2초마다 스냅샷을 밀어 준다. 여기서는 그것을 받아 반응형 값으로
 * 노출하고, 연결이 살아 있는지(live)를 함께 알린다 — 화면이 멈췄는데 사용자가
 * 그걸 모르면 옛 숫자를 현재로 착각한다. 끊기면 반드시 눈에 보여야 한다.
 *
 * 컴포넌트가 사라지면 스트림도 반드시 닫는다. 닫지 않으면 화면을 옮길 때마다
 * 연결이 하나씩 쌓여 서버에 죽은 연결이 누적된다.
 */
export function useLiveMetrics(initial: MetricsSnapshot | null = null) {
  const snapshot = shallowRef<MetricsSnapshot | null>(initial);
  const live = ref(false);
  const lastUpdate = ref<Date | null>(null);

  let close: (() => void) | null = null;

  onMounted(() => {
    close = api.openStream(
      (s) => {
        snapshot.value = s;
        lastUpdate.value = new Date();
      },
      (isLive) => {
        live.value = isLive;
      },
    );
  });

  onUnmounted(() => {
    close?.();
    close = null;
  });

  return { snapshot, live, lastUpdate };
}
