<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TrafficPoint } from '../api/types';

/**
 * 분당 요청량 그래프.
 *
 * 차트 라이브러리를 넣지 않은 이유: 여기 필요한 건 막대 60개와 눈금 몇 개뿐이다.
 * 그걸 위해 수백 KB 를 받고 그 취약점·업그레이드까지 떠안을 이유가 없다.
 *
 * 색 규칙: 정상은 중립 회색, 서버 오류(5xx)가 있던 분만 빨강.
 * 모든 막대를 파랗게 칠하면 '문제가 난 시각'이 묻힌다 — 이 그래프의 유일한 목적이
 * 그 시각을 찾는 것인데.
 */
const props = defineProps<{ points: TrafficPoint[] }>();

const W = 300;
const H = 56;

const hover = ref<number | null>(null);

const max = computed(() => Math.max(1, ...props.points.map((p) => p.requests)));

const bars = computed(() => {
  const n = props.points.length;
  if (n === 0) return [];
  const slot = W / n;
  // 막대 사이를 좁게 — 촘촘해야 추세가 보인다.
  const w = Math.max(1, slot - Math.min(1.5, slot * 0.25));
  return props.points.map((p, i) => {
    const h = (p.requests / max.value) * H;
    return {
      key: `${p.minute}-${i}`,
      x: i * slot,
      y: H - h,
      w,
      // 1건이라도 있으면 보이도록 최소 높이를 준다.
      h: p.requests > 0 ? Math.max(1.5, h) : 0,
      failing: p.errors > 0,
      point: p,
    };
  });
});

const hovered = computed(() => (hover.value === null ? null : (bars.value[hover.value] ?? null)));

const total = computed(() => props.points.reduce((s, p) => s + p.requests, 0));
const errors = computed(() => props.points.reduce((s, p) => s + p.errors, 0));
</script>

<template>
  <div class="chart-wrap">
    <div v-if="bars.length === 0" class="empty">아직 기록된 요청이 없습니다</div>

    <template v-else>
      <div class="chart-top">
        <!-- 마우스를 올린 순간의 값을 여기 고정 표시한다.
             막대에 붙는 툴팁은 좁은 막대에서 가리기 쉽고 위치가 튄다. -->
        <span v-if="hovered" class="readout num">
          {{ hovered.point.minute }} · 요청 {{ hovered.point.requests }}
          <template v-if="hovered.point.errors > 0">
            · <span class="readout-bad">오류 {{ hovered.point.errors }}</span>
          </template>
          · 평균 {{ hovered.point.avg_ms }}ms
        </span>
        <span v-else class="readout muted num">
          {{ bars.length }}분 · 요청 {{ total }}<template v-if="errors > 0"> · 오류 {{ errors }}</template>
        </span>
        <span class="peak num muted">최대 {{ max }}/분</span>
      </div>

      <svg
        class="chart"
        :viewBox="`0 0 ${W} ${H}`"
        preserveAspectRatio="none"
        role="img"
        :aria-label="`최근 ${bars.length}분 요청량. 합계 ${total}건, 오류 ${errors}건, 분당 최대 ${max}건`"
        @mouseleave="hover = null"
      >
        <rect
          v-for="(b, i) in bars"
          :key="b.key"
          :x="b.x"
          :y="b.y"
          :width="b.w"
          :height="b.h"
          :class="['bar', b.failing && 'bar-bad', hover === i && 'bar-on']"
          @mouseenter="hover = i"
        />
        <!-- 마우스 판정용 투명 띠. 막대가 얇아도 세로 전체에서 잡히게 한다. -->
        <rect
          v-for="(b, i) in bars"
          :key="`hit-${b.key}`"
          :x="b.x"
          y="0"
          :width="W / bars.length"
          :height="H"
          fill="transparent"
          @mouseenter="hover = i"
        />
      </svg>

      <div class="axis num">
        <span>{{ points[0]?.minute }}</span>
        <span>{{ points[points.length - 1]?.minute }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chart-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 11.5px;
  margin-bottom: 7px;
  min-height: 17px;
}
.readout {
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.readout-bad {
  color: var(--danger);
  font-weight: 600;
}
.peak {
  flex-shrink: 0;
  font-size: 11px;
}

.chart {
  width: 100%;
  height: 76px;
  display: block;
  overflow: visible;
}
.bar {
  fill: var(--n-300);
  transition: fill 0.08s;
}
.bar-bad {
  fill: var(--danger);
}
.bar-on {
  fill: var(--accent);
}
.bar-bad.bar-on {
  fill: var(--danger);
}

.axis {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--ink-4);
  margin-top: 5px;
}
</style>
