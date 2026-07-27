<script setup lang="ts">
import { toasts, dismissToast } from '../lib/toast';
</script>

<template>
  <!-- aria-live 로 스크린리더가 알림을 읽게 한다(시각 알림만으로는 전달되지 않는다). -->
  <div class="toast-host" role="status" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="`toast-${t.tone}`">
      <span class="toast-text">{{ t.message }}</span>
      <button class="toast-close" type="button" aria-label="알림 닫기" @click="dismissToast(t.id)">
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 호스트 자체는 클릭을 막지 않는다 — 알림이 없을 때 아래 UI 를 가리면 안 된다. */
  pointer-events: none;
  max-width: min(380px, calc(100vw - 32px));
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border-radius: var(--r);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow-lg);
  font-size: 13px;
}
.toast-success {
  border-left: 3px solid var(--green);
}
.toast-error {
  border-left: 3px solid var(--red);
}
.toast-info {
  border-left: 3px solid var(--blue);
}
.toast-text {
  flex: 1;
  min-width: 0;
}
.toast-close {
  border: none;
  background: none;
  color: var(--text-faint);
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;
  line-height: 1.4;
}
.toast-close:hover {
  color: var(--text);
}
</style>
