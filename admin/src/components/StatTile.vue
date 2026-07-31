<script setup lang="ts">
import Sparkline from './Sparkline.vue';

/**
 * 지표 타일.
 *
 * 라벨을 위, 값을 아래에 두고 값만 크게 키운다 — 훑을 때 눈이 값의 줄만 따라가면
 * 되도록. 색은 '주의가 필요할 때'만 입힌다(정상 지표까지 색을 칠하면
 * 정작 빨간 값이 눈에 안 들어온다).
 *
 * ── 추세선(trend) ─────────────────────────────────────────────────────
 * 값 오른쪽에 작은 추세선을 둘 수 있다. 숫자 하나로는 '2.1% 로 30분째 평온'과
 * '방금 0.2% 에서 치솟은 2.1%' 를 구분할 수 없기 때문이다. 값과 같은 줄에
 * 나란히 둬서, 눈을 옮기지 않고 숫자와 방향을 함께 읽게 한다.
 *
 * 추세를 줄 수 없는 지표에는 넣지 않는다. 빈 자리를 채우려고 아무 계열이나
 * 그려 넣으면, 그 선이 무엇을 뜻하는지 아무도 설명할 수 없게 된다.
 */
withDefaults(
  defineProps<{
    label: string;
    value: string;
    /** 값 아래 한 줄 — 비교값·구성 등 맥락. */
    sub?: string;
    /** 값에 입힐 색. 기본은 색 없음. */
    tone?: 'default' | 'ok' | 'warn' | 'danger' | 'accent';
    /** 값 옆 추세선의 계열. 비면 그리지 않는다. */
    trend?: number[];
  }>(),
  { tone: 'default', sub: '', trend: () => [] },
);
</script>

<template>
  <div class="tile">
    <div class="tile-label">{{ label }}</div>
    <div class="tile-main">
      <div class="tile-value num" :class="`t-${tone}`">{{ value }}</div>
      <!-- 추세선도 값과 같은 색을 쓴다(currentColor) — 둘이 같은 것을 말한다는
           신호다. 오류율이 빨개지면 선도 함께 빨개진다. -->
      <Sparkline v-if="trend.length > 1" :values="trend" :class="`t-${tone}`" />
    </div>
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
/* 값과 추세선을 한 줄에. 추세선은 오른쪽 끝으로 밀어 값의 자릿수가 달라져도
   선의 위치가 흔들리지 않게 한다 — 타일이 여러 개 늘어서면 선들이 세로로
   맞아떨어져야 훑기 좋다. */
.tile-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 3px;
}

.tile-value {
  font-size: 21px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.02em;
  min-width: 0;
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
