import { watch, onUnmounted, nextTick, type Ref } from 'vue';

/**
 * 겹쳐 뜨는 것(모달·서랍)의 공통 동작.
 *
 * 모달과 서랍은 생김새와 쓰임이 다르지만, **접근성 처리는 완전히 같다.**
 * 그런데 이 처리는 하나하나가 틀리기 쉽다.
 *
 *  · Tab 이 뒤 화면으로 새어 나가 보이지 않는 버튼에 포커스가 간다
 *  · Esc 로 닫을 수 없다
 *  · 뒤 화면이 같이 스크롤된다
 *  · 닫은 뒤 포커스가 body 로 날아가 키보드 사용자가 위치를 잃는다
 *
 * 두 컴포넌트에 같은 코드를 두 벌 두면 한쪽만 고쳐지는 날이 반드시 온다.
 * 그래서 여기 한 벌만 둔다.
 *
 * ── 스크롤 잠금을 세는 이유 ────────────────────────────────────────────
 * 서랍 위에 확인 모달이 뜨는 조합은 실제로 생긴다(사용자 상세 서랍에서 계정 정지).
 * 각자 `body.style.overflow` 를 직접 넣고 빼면, **안쪽 모달이 닫힐 때 잠금이
 * 풀려** 아직 열려 있는 서랍 뒤로 화면이 스크롤된다. 열린 개수를 세서
 * 마지막 하나가 닫힐 때만 되돌린다.
 */

/** 지금 열려 있는 오버레이 수. 0 이 될 때만 body 스크롤을 되돌린다. */
let openCount = 0;
/** 잠그기 직전의 overflow 값 — 우리가 넣은 값이 아니라 원래 값으로 되돌린다. */
let savedOverflow = '';

function lockScroll(): void {
  if (openCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openCount += 1;
}

function unlockScroll(): void {
  if (openCount === 0) return; // 짝이 맞지 않는 해제 — 남의 잠금을 풀지 않는다
  openCount -= 1;
  if (openCount === 0) document.body.style.overflow = savedOverflow;
}

/** 포커스를 받을 수 있는 요소들. 순서는 DOM 순서 그대로다. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface OverlayOptions {
  /** 열림 상태. */
  open: Ref<boolean> | (() => boolean);
  /** 오버레이의 바깥 요소(포커스를 이 안에 가둔다). */
  panel: Ref<HTMLElement | null>;
  /** Esc 로 닫으려 할 때. 처리 중이라 닫으면 안 되면 아무것도 하지 않으면 된다. */
  onClose: () => void;
  /**
   * 열릴 때 포커스를 둘 곳. 못 찾으면 패널 안 첫 요소로 간다.
   * 파괴적 동작을 담은 오버레이는 '확인'이 아니라 '취소' 쪽을 가리켜야 한다 —
   * Enter 를 습관적으로 눌러 되돌릴 수 없는 일이 일어나면 안 된다.
   */
  initialFocus?: () => HTMLElement | null | undefined;
}

export function useOverlay(opts: OverlayOptions) {
  // 지역 변수로 받아야 타입이 좁혀진다(속성 접근은 클로저 안에서 좁혀지지 않는다).
  const openSrc = opts.open;
  const isOpen = typeof openSrc === 'function' ? openSrc : () => openSrc.value;

  /** 열기 직전에 포커스가 있던 곳 — 닫을 때 여기로 돌려보낸다. */
  let restoreTo: HTMLElement | null = null;
  /** 우리가 잠금을 걸어 둔 상태인지. 중복 잠금·중복 해제를 막는다. */
  let locked = false;

  function release(): void {
    if (!locked) return;
    locked = false;
    unlockScroll();
  }

  watch(
    isOpen,
    async (open) => {
      if (open) {
        if (locked) return;
        locked = true;
        restoreTo = document.activeElement as HTMLElement | null;
        lockScroll();
        await nextTick();
        const target = opts.initialFocus?.() ?? panelFocusables()[0];
        target?.focus();
      } else {
        release();
        // 열려 있던 동안 그 요소가 화면에서 사라졌을 수 있다 — 없으면 그냥 넘어간다.
        if (restoreTo?.isConnected) restoreTo.focus();
        restoreTo = null;
      }
    },
    { immediate: true },
  );

  // 열린 채로 화면을 떠나면 잠금이 남는다 — 반드시 되돌린다.
  onUnmounted(release);

  function panelFocusables(): HTMLElement[] {
    const root = opts.panel.value;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  }

  /** 오버레이 루트에 @keydown 으로 물린다. */
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      // 뒤에 또 다른 오버레이가 있으면 그것까지 닫히면 안 된다 — 여기서 멈춘다.
      e.stopPropagation();
      opts.onClose();
      return;
    }
    if (e.key !== 'Tab') return;

    const items = panelFocusables();
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;

    // 포커스가 어쩌다 패널 밖에 있으면(예: 방금 요소가 사라짐) 안으로 데려온다.
    if (!opts.panel.value?.contains(document.activeElement)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
      return;
    }
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return { onKeydown };
}

/** 테스트용 — 잠금 카운터가 새는지 확인한다. */
export function __scrollLockDepth(): number {
  return openCount;
}
