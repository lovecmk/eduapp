<script setup lang="ts">
import { ref } from 'vue';
import { useOverlay } from '../composables/useOverlay';

/**
 * 확인·경고 대화상자.
 *
 * 되돌릴 수 없는 일 앞에서 "지금 이것만 보라"고 붙잡는 자리다.
 * 맥락을 지키며 훑어보는 상세는 서랍(AppDrawer)이 맡는다.
 *
 * 접근성 처리(포커스 가둠·Esc·스크롤 잠금·포커스 복귀)는 useOverlay 에 있다 —
 * 서랍과 한 벌을 나눠 쓴다. 두 벌을 두면 한쪽만 고쳐지는 날이 온다.
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

const { onKeydown } = useOverlay({
  open: () => props.open,
  panel,
  // 처리 중에는 Esc 로 닫지 않는다 — 요청이 날아간 뒤 화면만 사라지면
  // 결과를 확인할 방법이 없어진다.
  onClose: () => {
    if (!props.busy) emit('close');
  },
  // 파괴적 동작에서는 '취소'를 먼저 잡는다. 습관적으로 누른 Enter 로
  // 되돌릴 수 없는 일이 일어나면 안 된다.
  initialFocus: () =>
    props.danger ? panel.value?.querySelector<HTMLElement>('[data-cancel]') : confirmBtn.value,
});
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
