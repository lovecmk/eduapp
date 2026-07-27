<script setup lang="ts">
import { toasts, dismissToast } from '../lib/toast';
import AppIcon from './AppIcon.vue';
import type { IconName } from './icons';

/**
 * 화면 구석 알림.
 *
 * 색 띠(border-left) 대신 **아이콘 색**으로만 종류를 구분한다.
 * 알림 상자 자체는 중립색을 유지해, 여러 개가 쌓여도 화면이 알록달록해지지 않는다.
 */
const ICON: Record<string, IconName> = {
  success: 'check',
  error: 'alert',
  info: 'pulse',
};
</script>

<template>
  <!-- aria-live 로 스크린리더가 알림을 읽게 한다(시각 표시만으로는 전달되지 않는다). -->
  <div class="toasts" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast">
        <AppIcon :name="ICON[t.tone] ?? 'pulse'" :size="14" :class="`toast-icon tone-${t.tone}`" />
        <span class="toast-text">{{ t.message }}</span>
        <button class="toast-x" type="button" aria-label="알림 닫기" @click="dismissToast(t.id)">
          <AppIcon name="x" :size="12" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 14px;
  bottom: 14px;
  z-index: 80;
  display: flex;
  flex-direction: column;
  gap: 7px;
  /* 호스트 자체는 클릭을 가로막지 않는다 — 알림이 없을 때 아래 UI 를 덮으면 안 된다. */
  pointer-events: none;
  max-width: min(360px, calc(100vw - 28px));
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 10px;
  border-radius: var(--r-2);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  box-shadow: var(--pop);
  font-size: 12.5px;
  line-height: 1.5;
}

.toast-icon {
  margin-top: 2px;
}
.tone-success {
  color: var(--ok);
}
.tone-error {
  color: var(--danger);
}
.tone-info {
  color: var(--info);
}

.toast-text {
  flex: 1;
  min-width: 0;
}

.toast-x {
  border: none;
  background: none;
  color: var(--ink-4);
  cursor: pointer;
  padding: 2px;
  margin: -2px -2px 0 0;
  border-radius: var(--r-1);
  display: flex;
}
.toast-x:hover {
  color: var(--ink);
  background: var(--surface-3);
}

/* 알림은 오른쪽에서 짧게 들어오고 나간다. 길면 그 자체가 방해가 된다. */
.toast-enter-active,
.toast-leave-active {
  transition: transform 0.16s ease, opacity 0.16s ease;
}
.toast-enter-from,
.toast-leave-to {
  transform: translateX(12px);
  opacity: 0;
}
.toast-leave-active {
  position: absolute;
}
</style>
