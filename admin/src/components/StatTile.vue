<script setup lang="ts">
/** 큰 숫자 하나를 보여주는 타일. 대시보드의 기본 단위. */
withDefaults(
  defineProps<{
    label: string;
    value: string;
    /** 값 아래 한 줄 보조 설명(추이·비교 등). */
    hint?: string;
    tone?: 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'gray';
  }>(),
  { tone: 'gray', hint: '' },
);
</script>

<template>
  <div class="card tile">
    <div class="tile-label">{{ label }}</div>
    <div class="tile-value num" :class="`tone-${tone}`">{{ value }}</div>
    <div v-if="hint" class="tile-hint">{{ hint }}</div>
  </div>
</template>

<style scoped>
.tile {
  padding: 14px 16px;
  /* 힌트가 있는 타일과 없는 타일의 높이를 맞춰 그리드가 들쭉날쭉해지지 않게 한다. */
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 92px;
}
.tile-label {
  font-size: 12.5px;
  color: var(--text-muted);
  font-weight: 600;
}
.tile-value {
  font-size: 26px;
  font-weight: 800;
  line-height: 1.2;
  margin-top: 4px;
  letter-spacing: -0.02em;
}
.tile-hint {
  font-size: 12px;
  color: var(--text-faint);
  margin-top: 3px;
}
.tone-blue {
  color: var(--blue);
}
.tone-green {
  color: var(--green);
}
.tone-amber {
  color: var(--amber);
}
.tone-red {
  color: var(--red);
}
.tone-violet {
  color: var(--violet);
}
.tone-gray {
  color: var(--text);
}
</style>
