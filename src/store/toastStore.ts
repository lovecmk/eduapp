import { create } from 'zustand';

/**
 * 짧은 안내 메시지(토스트).
 *
 * Alert 을 쓰지 않는 이유 — Alert 은 화면을 가리고 사용자의 손을 멈춰 세운다.
 * "저장했어요", "한 번 더 누르면 종료" 같은 안내는 흐름을 끊을 만한 내용이 아니다.
 * 확인 버튼을 눌러야 사라지는 창은 그 자체가 방해다.
 */
export type ToastKind = 'info' | 'success' | 'warn';

interface ToastState {
  message: string | null;
  kind: ToastKind;
  /** 같은 문구가 연달아 떠도 애니메이션을 다시 시작시키기 위한 일련번호. */
  seq: number;
  durationMs: number;
  show: (message: string, kind?: ToastKind, durationMs?: number) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  kind: 'info',
  seq: 0,
  durationMs: 1800,
  show: (message, kind = 'info', durationMs = 1800) =>
    set((s) => ({ message, kind, durationMs, seq: s.seq + 1 })),
  hide: () => set({ message: null }),
}));

/** 화면 밖(훅이 아닌 곳)에서도 부를 수 있는 단축 호출. */
export function toast(message: string, kind: ToastKind = 'info', durationMs = 1800): void {
  useToastStore.getState().show(message, kind, durationMs);
}
