import { onMounted, onUnmounted } from 'vue';

/**
 * 전역 키보드 단축키.
 *
 * 관리 콘솔은 같은 동작을 하루에도 수십 번 반복하는 도구다. 마우스로만 쓰게
 * 만들면 익숙해질수록 오히려 느려진다. 그래서 이동·검색·닫기를 키로 처리한다.
 *
 * 반드시 지키는 것:
 *  · 입력 중에는 단축키가 발동하지 않는다. 검색어에 'g' 를 치는 순간 화면이
 *    바뀌어 버리면 그 도구는 못 쓴다.
 *  · 브라우저·OS 예약 조합(⌘R, ⌘T 등)은 건드리지 않는다.
 *  · Esc 는 입력 중에도 동작한다(빠져나오는 길은 항상 열려 있어야 한다).
 */

/** 지금 포커스가 텍스트를 입력하는 곳에 있는가. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable === true
  );
}

export interface ShortcutHandlers {
  /** '/' — 검색창으로 이동 */
  onSearch?: () => void;
  /** ⌘K / Ctrl+K — 명령 팔레트 */
  onPalette?: () => void;
  /** Esc — 열린 것 닫기(입력 중에도 동작) */
  onEscape?: () => void;
  /** g 를 누른 뒤 이어 누른 키 — 화면 이동(g d, g u, g c …) */
  onGoto?: (key: string) => void;
  /** ? — 단축키 도움말 */
  onHelp?: () => void;
}

/** 'g' 를 누르고 다음 키를 기다리는 시간. 넘기면 그냥 'g' 였던 것으로 친다. */
const CHORD_MS = 1200;

export function useShortcuts(handlers: ShortcutHandlers): void {
  let chordTimer: ReturnType<typeof setTimeout> | null = null;
  let awaitingGoto = false;

  function clearChord(): void {
    if (chordTimer) clearTimeout(chordTimer);
    chordTimer = null;
    awaitingGoto = false;
  }

  function onKeyDown(e: KeyboardEvent): void {
    // Esc 는 어떤 상황에서도 먼저 처리한다.
    if (e.key === 'Escape') {
      clearChord();
      handlers.onEscape?.();
      return;
    }

    // 팔레트는 입력 중에도 열 수 있어야 한다(검색어를 치다가 다른 곳으로 가고 싶을 때).
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      clearChord();
      handlers.onPalette?.();
      return;
    }

    // 여기서부터는 입력 중이면 절대 발동하지 않는다.
    if (isTypingTarget(e.target)) return;
    // 수식키 조합은 브라우저·OS 몫으로 남긴다.
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (awaitingGoto) {
      e.preventDefault();
      const key = e.key.toLowerCase();
      clearChord();
      handlers.onGoto?.(key);
      return;
    }

    switch (e.key) {
      case '/':
        e.preventDefault();
        handlers.onSearch?.();
        break;
      case '?':
        e.preventDefault();
        handlers.onHelp?.();
        break;
      case 'g':
      case 'G':
        e.preventDefault();
        awaitingGoto = true;
        chordTimer = setTimeout(clearChord, CHORD_MS);
        break;
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown));
  onUnmounted(() => {
    clearChord();
    window.removeEventListener('keydown', onKeyDown);
  });
}
