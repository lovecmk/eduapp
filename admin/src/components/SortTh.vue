<script setup lang="ts">
/**
 * 정렬 가능한 표 머리 셀.
 *
 * `aria-sort` 를 제대로 붙인다 — 스크린리더 사용자에게 "지금 이 열로 정렬됨,
 * 오름차순" 이 전달되어야 정렬이 기능으로서 의미가 있다.
 * 정렬 자체는 서버가 한다(화면에서 현재 페이지만 정렬하면 관리자가
 * '전체가 정렬된 것'으로 오해한다).
 */
const props = defineProps<{
  column: string;
  active: string;
  desc: boolean;
  align?: 'left' | 'right';
}>();

const emit = defineEmits<{ sort: [column: string] }>();

const isActive = () => props.active === props.column;
</script>

<template>
  <th
    class="th-sort"
    :class="align === 'right' ? 'right' : ''"
    :aria-sort="isActive() ? (desc ? 'descending' : 'ascending') : undefined"
    tabindex="0"
    role="columnheader"
    @click="emit('sort', column)"
    @keydown.enter.prevent="emit('sort', column)"
    @keydown.space.prevent="emit('sort', column)"
  >
    <span class="th-sort-inner">
      <slot />
      <span class="th-arrow" aria-hidden="true">{{ isActive() && desc ? '▼' : '▲' }}</span>
    </span>
  </th>
</template>
