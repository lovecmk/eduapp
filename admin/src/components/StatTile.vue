<script setup lang="ts">
/**
 * 지표 타일.
 *
 * 라벨을 위, 값을 아래에 두고 값만 크게 키운다 — 훑을 때 눈이 값의 줄만 따라가면
 * 되도록. 색은 '주의가 필요할 때'만 입힌다(정상 지표까지 색을 칠하면
 * 정작 빨간 값이 눈에 안 들어온다).
 */
withDefaults(
  defineProps<{
    label: string;
    value: string;
    /** 값 아래 한 줄 — 비교값·구성 등 맥락. */
    sub?: string;
    /** 값에 입힐 색. 기본은 색 없음. */
    tone?: 'default' | 'ok' | 'warn' | 'danger' | 'accent';
  }>(),
  { tone: 'default', sub: '' },
);
</script>

<template>
  <div class="tile">
    <div class="tile-label">{{ label }}</div>
    <div class="tile-value num" :class="`t-${tone}`">{{ value }}</div>
    <div v-if="sub" class="tile-sub">{{ sub }}</div>
  </div>
</template>

<style scoped>
/*
 * 타일은 개별 상자가 아니라 하나의 띠로 묶인다(부모가 .tiles 로 감싼다).
 * 상자를 다섯 개 나열하면 테두리만 열 줄이 그어져 화면이 시끄러워진다.
 */
.tile {
  padding: 11px 14px;
  min-width: 0;
}
.tile-label {
  font-size: 11.5px;
  color: var(--ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tile-value {
  font-size: 21px;
  font-weight: 600;
  line-height: 1.25;
  margin-top: 3px;
  letter-spacing: -0.02em;
}
.tile-sub {
  font-size: 11px;
  color: var(--ink-4);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.t-default {
  color: var(--ink);
}
.t-ok {
  color: var(--ok);
}
.t-warn {
  color: var(--warn);
}
.t-danger {
  color: var(--danger);
}
.t-accent {
  color: var(--accent);
}
</style>
