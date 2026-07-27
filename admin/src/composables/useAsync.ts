import { ref, shallowRef, onUnmounted, type Ref, type ShallowRef } from 'vue';
import { ApiError } from '../api/client';

/**
 * 비동기 조회의 세 가지 상태(로딩·데이터·오류)를 한 벌로 다룬다.
 *
 * 화면마다 loading/error/data 를 손으로 관리하면 반드시 어딘가에서
 * "오류인데 로딩 스피너가 계속 돈다" 같은 조합이 생긴다. 여기서 한 번만 맞춘다.
 *
 * 요청이 겹칠 때(빠른 검색 타이핑 등) **마지막 요청의 결과만** 반영한다.
 * 그러지 않으면 먼저 보낸 느린 응답이 나중에 도착해 화면을 옛 결과로 되돌린다.
 */
export function useAsync<T>(loader: () => Promise<T>) {
  const data = shallowRef<T | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(false);

  let requestSeq = 0;
  let disposed = false;

  async function run(): Promise<void> {
    const seq = ++requestSeq;
    loading.value = true;
    error.value = null;
    try {
      const result = await loader();
      if (disposed || seq !== requestSeq) return; // 더 최근 요청이 있다 — 이 결과는 버린다
      data.value = result;
    } catch (e) {
      if (disposed || seq !== requestSeq) return;
      error.value = e instanceof ApiError ? e.message : '데이터를 불러오지 못했습니다';
    } finally {
      if (!disposed && seq === requestSeq) loading.value = false;
    }
  }

  onUnmounted(() => {
    disposed = true;
  });

  return { data, error, loading, run } as {
    data: ShallowRef<T | null>;
    error: Ref<string | null>;
    loading: Ref<boolean>;
    run: () => Promise<void>;
  };
}

/**
 * 값이 잠잠해진 뒤에야 콜백을 부른다(검색어 입력 등).
 * 타이머는 언마운트 시 반드시 정리한다 — 사라진 화면의 상태를 건드리지 않기 위해.
 */
export function useDebounced(fn: () => void, delay = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function trigger(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, delay);
  }

  function cancel(): void {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  onUnmounted(cancel);

  return { trigger, cancel };
}
