<script setup lang="ts">
import { themeMode, THEME_LABEL, type ThemeMode } from '../composables/useTheme';
import AppIcon from './AppIcon.vue';
import type { IconName } from './icons';

/**
 * 테마 선택 — 순환 버튼이 아니라 **세 상태를 모두 보여주는 스위치**.
 *
 * 순환 버튼(클릭할 때마다 라이트→다크→자동)을 먼저 만들었다가 갈아엎었다.
 * 3상태를 한 버튼으로 돌리면 반드시 '눌러도 화면이 그대로인 클릭'이 생긴다 —
 * OS 가 라이트인데 '자동'에서 '라이트'로 넘어가는 순간이 그렇다. 사용자는
 * 버튼이 고장 났다고 생각한다.
 *
 * 세 칸을 다 보여주면 지금 무엇이 선택돼 있는지, 무엇을 누르면 무엇이 되는지가
 * 화면에 그대로 있다. 공간은 조금 더 쓰지만 설명이 필요 없어진다.
 */
const OPTIONS: { value: ThemeMode; icon: IconName }[] = [
  { value: 'light', icon: 'sun' },
  { value: 'dark', icon: 'moon' },
  { value: 'auto', icon: 'monitor' },
];
</script>

<template>
  <div class="theme-switch" role="group" aria-label="화면 테마">
    <button
      v-for="o in OPTIONS"
      :key="o.value"
      type="button"
      :aria-pressed="themeMode === o.value"
      :aria-label="THEME_LABEL[o.value]"
      :title="THEME_LABEL[o.value]"
      @click="themeMode = o.value"
    >
      <AppIcon :name="o.icon" :size="13" />
    </button>
  </div>
</template>

<style scoped>
.theme-switch {
  display: inline-flex;
  padding: 2px;
  border-radius: var(--r-2);
  background: var(--surface-3);
  gap: 1px;
}
.theme-switch button {
  display: grid;
  place-items: center;
  width: 24px;
  height: 22px;
  border: none;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--ink-4);
  cursor: pointer;
  transition: background-color 0.1s, color 0.1s;
}
.theme-switch button:hover {
  color: var(--ink-2);
}
.theme-switch button[aria-pressed='true'] {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 2px rgba(16, 20, 28, 0.1);
}
:root[data-theme='dark'] .theme-switch button[aria-pressed='true'] {
  background: var(--n-200);
  box-shadow: none;
}
</style>
