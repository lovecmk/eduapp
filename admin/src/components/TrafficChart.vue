<script setup lang="ts">
import { computed } from 'vue';
import type { TrafficPoint } from '../api/types';

/**
 * 분당 요청량 막대 그래프.
 *
 * 차트 라이브러리를 쓰지 않은 이유: 필요한 건 막대 60개와 눈금 몇 개뿐이다.
 * 이걸 위해 수백 KB 라이브러리를 넣으면 관리 콘솔의 첫 로딩만 느려진다.
 * SVG 로 직접 그리면 의존성 0, 크기 0, 접근성도 직접 챙길 수 있다.
 *
 * 색 규칙: 정상은 파랑, 서버 오류(5xx)가 있는 분은 빨강으로 덮어 그린다 —
 * 문제가 난 시각을 눈으로 바로 짚을 수 있어야 한다.
 */
const props = defineProps<{ points: TrafficPoint[] }>();

const W = 100; // viewBox 좌표계(실제 크기는 CSS 가 정한다)
const H = 34;

const maxRequests = computed(() => Math.max(1, ...props.points.map((p) => p.requests)));

const bars = computed(() => {
  const n = props.points.length;
  if (n === 0) return [];
  // 막대 사이 간격을 폭의 20%로 두어 개수가 적을 때도 막대가 과하게 굵어지지 않게 한다.
  const slot = W / n;
  const barW = Math.max(0.4, slot * 0.8);
  return props.points.map((p, i) => {
    const h = (p.requests / maxRequests.value) * H;
    return {
      key: `${p.minute}-${i}`,
      x: i * slot + (slot - barW) / 2,
      y: H - h,
      w: barW,
      h: Math.max(p.requests > 0 ? 0.6 : 0, h), // 1건이라도 보이게 최소 높이 확보
      failing: p.errors > 0,
      title: `${p.minute} · 요청 ${p.requests}건 · 오류 ${p.errors}건 · 평균 ${p.avg_ms}ms`,
    };
  });
});

const firstLabel = computed(() => props.points[0]?.minute ?? '');
const lastLabel = computed(() => props.points[props.points.length - 1]?.minute ?? '');
const totalRequests = computed(() => props.points.reduce((sum, p) => sum + p.requests, 0));
</script>

<template>
  <div>
    <div v-if="bars.length === 0" class="empty">아직 기록된 요청이 없어요</div>
    <template v-else>
      <svg
        class="chart"
        :viewBox="`0 0 ${W} ${H}`"
        preserveAspectRatio="none"
        role="img"
        :aria-label="`최근 ${bars.length}분 요청량 그래프. 합계 ${totalRequests}건, 분당 최대 ${maxRequests}건`"
      >
        <rect
          v-for="b in bars"
          :key="b.key"
          :x="b.x"
          :y="b.y"
          :width="b.w"
          :height="b.h"
          :class="b.failing ? 'bar bar-fail' : 'bar'"
        >
          <title>{{ b.title }}</title>
        </rect>
      </svg>
      <div class="axis">
        <span class="num">{{ firstLabel }}</span>
        <span>최대 {{ maxRequests }}건/분</span>
        <span class="num">{{ lastLabel }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chart {
  width: 100%;
  height: 92px;
  display: block;
}
.bar {
  fill: var(--blue);
  opacity: 0.85;
}
.bar-fail {
  fill: var(--red);
  opacity: 1;
}
.axis {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
  color: var(--text-faint);
  margin-top: 6px;
}
</style>
