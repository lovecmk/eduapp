import { describe, it, expect, afterEach } from 'vitest';
import { ref, nextTick, defineComponent, h, createApp } from 'vue';
import { useOverlay, __scrollLockDepth } from './useOverlay';

/**
 * 오버레이의 접근성 처리는 눈으로 확인하기 어렵다 — 포커스가 어디 있는지,
 * 스크롤 잠금이 남았는지는 화면만 봐서는 모른다. 그래서 검사로 못박는다.
 *
 * 특히 '서랍 위에 모달' 조합의 스크롤 잠금은 손으로 확인하기 번거롭고
 * 회귀하기 쉬운 자리다.
 */

/** 컴포넌트 밖에서 onUnmounted 를 쓸 수 없으므로 최소한의 껍데기에 담아 띄운다. */
function mount(setup: () => void): { unmount: () => void } {
  const app = document.createElement('div');
  document.body.appendChild(app);
  const Comp = defineComponent({
    setup() {
      setup();
      return () => h('div');
    },
  });
  const instance = createApp(Comp);
  instance.mount(app);
  return {
    unmount: () => {
      instance.unmount();
      app.remove();
    },
  };
}

afterEach(() => {
  document.body.style.overflow = '';
});

describe('useOverlay — 스크롤 잠금', () => {
  it('열면 잠그고 닫으면 되돌린다', async () => {
    const open = ref(false);
    const panel = ref<HTMLElement | null>(null);
    const app = mount(() => {
      useOverlay({ open, panel, onClose: () => {} });
    });

    expect(document.body.style.overflow).toBe('');

    open.value = true;
    await nextTick();
    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');

    open.value = false;
    await nextTick();
    expect(document.body.style.overflow).toBe('');
    expect(__scrollLockDepth()).toBe(0);

    app.unmount();
  });

  it('서랍 위에 모달이 겹쳤다 안쪽만 닫혀도 잠금이 풀리지 않는다', async () => {
    // 이것이 이 파일이 존재하는 진짜 이유다.
    // 각자 body.style.overflow 를 직접 넣고 빼던 시절에는, 모달이 닫히는 순간
    // 아직 열려 있는 서랍 뒤로 화면이 스크롤됐다.
    const drawer = ref(false);
    const modal = ref(false);
    const p1 = ref<HTMLElement | null>(null);
    const p2 = ref<HTMLElement | null>(null);

    const app = mount(() => {
      useOverlay({ open: drawer, panel: p1, onClose: () => {} });
      useOverlay({ open: modal, panel: p2, onClose: () => {} });
    });

    drawer.value = true;
    await nextTick();
    modal.value = true;
    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');

    // 안쪽 모달만 닫는다 — 서랍은 아직 열려 있다.
    modal.value = false;
    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');

    drawer.value = false;
    await nextTick();
    expect(document.body.style.overflow).toBe('');

    app.unmount();
  });

  it('열린 채로 화면을 떠나도 잠금이 남지 않는다', async () => {
    const open = ref(true);
    const panel = ref<HTMLElement | null>(null);
    const app = mount(() => {
      useOverlay({ open, panel, onClose: () => {} });
    });
    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');

    app.unmount();
    expect(document.body.style.overflow).toBe('');
    expect(__scrollLockDepth()).toBe(0);
  });
});

describe('useOverlay — 키보드', () => {
  function makePanel(): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = '<button id="a">a</button><button id="b">b</button><button id="c">c</button>';
    document.body.appendChild(el);
    return el;
  }

  it('Esc 로 닫기를 요청한다', async () => {
    const open = ref(true);
    const panel = ref<HTMLElement | null>(makePanel());
    let closed = 0;
    let api!: ReturnType<typeof useOverlay>;
    const app = mount(() => {
      api = useOverlay({ open, panel, onClose: () => (closed += 1) });
    });
    await nextTick();

    api.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(1);

    panel.value?.remove();
    app.unmount();
  });

  it('Tab 이 마지막에서 첫 요소로 돌아온다', async () => {
    const open = ref(true);
    const el = makePanel();
    const panel = ref<HTMLElement | null>(el);
    let api!: ReturnType<typeof useOverlay>;
    const app = mount(() => {
      api = useOverlay({ open, panel, onClose: () => {} });
    });
    await nextTick();

    const last = el.querySelector<HTMLElement>('#c')!;
    last.focus();
    const e = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    api.onKeydown(e);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('a');

    el.remove();
    app.unmount();
  });

  it('Shift+Tab 이 첫 요소에서 마지막으로 돌아간다', async () => {
    const open = ref(true);
    const el = makePanel();
    const panel = ref<HTMLElement | null>(el);
    let api!: ReturnType<typeof useOverlay>;
    const app = mount(() => {
      api = useOverlay({ open, panel, onClose: () => {} });
    });
    await nextTick();

    el.querySelector<HTMLElement>('#a')!.focus();
    const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    api.onKeydown(e);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('c');

    el.remove();
    app.unmount();
  });
});
