import { ref, onMounted, onUnmounted, readonly, type Ref } from 'vue';

/**
 * 째깍이는 '현재 시각'.
 *
 * 상대 시각("3분 전")을 한 번 계산해 두면 화면에 그대로 굳는다. 5분이 지나도
 * 계속 "3분 전"이라고 적혀 있으면 관리자는 그 정보를 신뢰할 수 없게 된다.
 * 데이터가 아니라 **시간이 흘러서** 바뀌는 표시는 시계가 함께 움직여야 한다.
 *
 * 1분 간격으로만 갱신한다 — 분 단위 표시에 초 단위 타이머는 낭비다.
 * 탭이 백그라운드일 때는 멈추고, 돌아오면 즉시 한 번 맞춘다(뒤처진 값 방지).
 */

const TICK_MS = 60_000;

export function useNow(): Readonly<Ref<Date>> {
  const now = ref(new Date());
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = () => {
    now.value = new Date();
  };

  function start(): void {
    if (timer) return;
    timer = setInterval(tick, TICK_MS);
  }
  function stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function onVisibility(): void {
    if (document.hidden) {
      stop();
    } else {
      tick(); // 돌아오자마자 맞춘다
      start();
    }
  }

  onMounted(() => {
    start();
    document.addEventListener('visibilitychange', onVisibility);
  });

  onUnmounted(() => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return readonly(now) as Readonly<Ref<Date>>;
}
