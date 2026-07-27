import { ref } from 'vue';

/**
 * 화면 구석 알림.
 *
 * 관리 작업(권한 변경·문제 삭제)은 결과가 즉시 눈에 보이지 않는 경우가 많다.
 * 성공했는지 실패했는지 알려주지 않으면 관리자는 같은 작업을 반복하게 된다.
 *
 * 상한을 두는 이유: 실패가 연달아 나면(서버 장애 중 여러 요청) 알림이 화면을
 * 가득 덮어 정작 화면을 못 쓰게 된다.
 */

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 4000;

export const toasts = ref<Toast[]>([]);

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function push(message: string, tone: ToastTone): void {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, message, tone }].slice(-MAX_VISIBLE);

  // 오류는 조금 더 오래 남긴다 — 읽기도 전에 사라지면 알림이 없는 것과 같다.
  const ttl = tone === 'error' ? AUTO_DISMISS_MS * 2 : AUTO_DISMISS_MS;
  timers.set(
    id,
    setTimeout(() => dismissToast(id), ttl),
  );
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

export const toast = {
  success: (message: string) => push(message, 'success'),
  error: (message: string) => push(message, 'error'),
  info: (message: string) => push(message, 'info'),
};

/** 테스트용 — 모듈 상태를 초기화한다. */
export function __resetToasts(): void {
  timers.forEach(clearTimeout);
  timers.clear();
  toasts.value = [];
  nextId = 1;
}
