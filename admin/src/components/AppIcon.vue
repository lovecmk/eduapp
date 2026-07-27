<script setup lang="ts">
import { ICON_PATHS, type IconName } from './icons';

/** 선 아이콘 한 개. 색은 currentColor 를 따라가므로 부모의 색만 정하면 된다. */
withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 16 });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    class="icon"
  >
    <path :d="ICON_PATHS[name]" />
  </svg>
</template>

<style scoped>
.icon {
  flex-shrink: 0;
  display: block;
}
</style>
