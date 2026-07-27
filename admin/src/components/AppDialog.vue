<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue';

/**
 * 확인·경고 대화상자.
 *
 * 직접 만든 이유는 접근성 때문이다. div 로 대충 만든 모달은 다음이 전부 깨진다.
 *  · Tab 이 뒤 화면으로 새어 나가 보이지 않는 버튼에 포커스가 간다
 *  · Esc 로 닫을 수 없다
 *  · 뒤 화면이 같이 스크롤된다
 *  · 닫은 뒤 포커스가 body 로 날아가 키보드 사용자가 위치를 잃는다
 *
 * 여기서 네 가지를 모두 처리하고, 화면들은 내용만 넣는다.
 */

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    /** 위험한 동작이면 확인 버튼을 빨갛게. */
    danger?: boolean;
    confirmText?: string;
    cancelText?: string;
    busy?: boolean;
  }>(),
  { danger: false, confirmText: '확인', cancelText: '취소', busy: false },
);

const emit = defineEmits<{ close: []; confirm: [] }>();

const panel = ref<HTMLElement | null>(null);
const confirmBtn = ref<HTMLButtonElement | null>(null);
/** 열기 직전에 포커스가 있던 곳 — 닫을 때 여기로 돌려보낸다. */
let restoreTo: HTMLElement | null = null;

watch(
  () => props.open,
  async (open) => {
    if (open) {
      restoreTo = document.activeElement as HTMLElement | null;
      // 뒤 화면이 함께 스크롤되지 않게 잠근다.
      document.body.style.overflow = 'hidden';
      await nextTick();
      // 파괴적 동작은 '취소'가 아니라 '확인'에 자동 포커스하지 않는 편이 안전하지만,
      // 여기선 확인 버튼에 두되 danger 일 때는 취소를 먼저 잡는다.
      if (props.danger) panel.value?.querySelector<HTMLElement>('[data-cancel]')?.focus();
      else confirmBtn.value?.focus();
    } else {
      document.body.style.overflow = '';
      restoreTo?.focus?.();
      restoreTo = null;
    }
  },
);

// 열린 채로 화면을 떠나면 스크롤 잠금이 남는다 — 반드시 되돌린다.
onUnmounted(() => {
  document.body.style.overflow = '';
});

/** Tab 이 대화상자 밖으로 새어 나가지 않게 가둔다. */
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.stopPropagation();
    if (!props.busy) emit('close');
    return;
  }
  if (e.key !== 'Tab' || !panel.value) return;

  const focusable = panel.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="scrim" @mousedown.self="!busy && emit('close')" @keydown="onKeydown">
      <div
        ref="panel"
        class="modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`dlg-${title}`"
      >
        <div class="modal-head">
          <h2 :id="`dlg-${title}`" class="modal-title">{{ title }}</h2>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div class="modal-foot">
          <button class="btn" type="button" data-cancel :disabled="busy" @click="emit('close')">
            {{ cancelText }}
          </button>
          <button
            ref="confirmBtn"
            class="btn"
            :class="danger ? 'btn-danger' : 'btn-primary'"
            type="button"
            :disabled="busy"
            @click="emit('confirm')"
          >
            <span v-if="busy" class="spinner" aria-hidden="true" />
            {{ busy ? '처리 중…' : confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
