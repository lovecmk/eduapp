<script setup lang="ts">
import { computed } from 'vue';

import { divergingAxisMax, divergingBar } from '../../lib/chart';

/**
 * 분야별 또래 대비 격차 — 발산 막대(diverging bar).
 *
 * ── 왜 이 형태인가 ────────────────────────────────────────────────────────
 * 이 차트가 답하는 질문은 딱 하나다: **"어느 분야를 가르쳐야 하는가."**
 * 실패율을 그냥 막대로 세우면 어려운 분야가 늘 위로 온다 — 그건 이 사람의
 * 약점이 아니라 문제의 난이도다. 기준선(또래)에서 얼마나 벗어났는지를 그리면
 * '오른쪽으로 튀어나온 것'이 곧 가르칠 대상이 된다.
 *
 * 색은 방향만 말한다. 오른쪽=또래보다 많이 틀림, 왼쪽=덜 틀림. 초록/빨강을
 * 쓰지 않는 이유는 base.css 의 차트 토큰 주석에 적어 뒀다 — 2형 색각에서
 * 두 색이 사실상 같기 때문이다. 여기서는 **기준선의 어느 쪽인가**라는 위치가
 * 이미 좋고 나쁨을 말하므로, 색이 없어도 뜻이 남는다.
 */
export interface GapRow {
  label: string;
  /** 본인 − 또래(비율). 양수면 이 사람이 더 많이 틀린다. */
  gap: number;
  /** 판정 — weak 인 것만 강조한다. */
  verdict: 'weak' | 'shared' | 'ok';
  /** 이 분야에서 푼 문제 수(표본이 작으면 옅게 그린다). */
  cards: number;
}

const props = defineProps<{ rows: GapRow[]; minCards?: number }>();

/** 표본이 이보다 적으면 판단 근거로 삼지 않는다(서버의 분야 처방 기준과 같다). */
const MIN_CARDS = 3;

const axisMax = computed(() => divergingAxisMax(props.rows.map((r) => r.gap * 100)));

const bars = computed(() =>
  props.rows.map((r) => {
    const thin = r.cards < (props.minCards ?? MIN_CARDS);
    return {
      ...r,
      bar: divergingBar(r.gap * 100, axisMax.value),
      thin,
      text: `${r.gap > 0 ? '+' : ''}${Math.round(r.gap * 100)}%p`,
    };
  }),
);
</script>

<template>
  <div v-if="bars.length" class="gap">
    <div class="gap-axis">
      <span>또래보다 덜 틀림</span>
      <span class="gap-zero">또래와 같음</span>
      <span>더 틀림</span>
    </div>

    <div v-for="r in bars" :key="r.label" class="gap-row">
      <div class="gap-label truncate" :class="{ strong: r.verdict === 'weak' }">{{ r.label }}</div>

      <div
        class="gap-track"
        role="img"
        :aria-label="`${r.label} — 또래 대비 ${r.text}${r.verdict === 'weak' ? ', 이 분야를 가르칠 것' : ''}`"
      >
        <i class="gap-base" />
        <i
          v-if="r.bar.width > 0"
          class="gap-bar"
          :class="[r.bar.side === 'worse' ? 'is-worse' : 'is-better', { thin: r.thin }]"
          :style="{ left: `${r.bar.x}%`, width: `${r.bar.width}%` }"
          :title="`${r.label} · 또래 대비 ${r.text} · 푼 문제 ${r.cards}장`"
        />
      </div>

      <!-- 값은 모든 줄에 적는다. 줄이 서너 개뿐이라 어수선해지지 않고,
           표를 따로 펴지 않아도 정확한 수치가 남는다. -->
      <div class="gap-value num" :class="{ bad: r.bar.side === 'worse' && !r.thin }">
        {{ r.text }}
        <span v-if="r.thin" class="gap-note">표본 {{ r.cards }}장</span>
      </div>
    </div>

    <p class="gap-foot">
      막대가 오른쪽으로 갈수록 같은 문제에서 또래보다 많이 틀립니다. 축 끝 ±{{ axisMax }}%p.
      <template v-if="bars.some((b) => b.thin)">
        옅은 막대는 푼 문제가 {{ minCards ?? MIN_CARDS }}장 미만이라 판단 근거로 쓰지 않습니다.
      </template>
    </p>
  </div>
</template>

<style scoped>
.gap-axis {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 10.5px;
  color: var(--ink-4);
}

.gap-axis span:first-child {
  text-align: right;
  padding-right: 96px;
}

.gap-axis span:last-child {
  padding-left: 96px;
}

.gap-zero {
  color: var(--ink-3);
}

.gap-row {
  display: grid;
  grid-template-columns: 96px 1fr 96px;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.gap-label {
  font-size: 12px;
  color: var(--ink-2);
}

.gap-label.strong {
  color: var(--ink);
  font-weight: 600;
}

.gap-track {
  position: relative;
  height: 20px;
}

/* 기준선(0) — 이 차트의 뜻이 전부 여기에 걸려 있으므로 유일하게 그리는 눈금이다. */
.gap-base {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--viz-grid);
}

.gap-bar {
  position: absolute;
  top: 4px;
  height: 12px;
  /* 기준선 쪽은 각지게, 바깥쪽 끝만 둥글게 — 막대가 어디서 자라는지 보인다. */
  border-radius: 0 3px 3px 0;
}

.gap-bar.is-better {
  border-radius: 3px 0 0 3px;
  background: var(--viz-better);
}

.gap-bar.is-worse {
  background: var(--viz-worse);
}

/* 표본이 모자란 줄은 옅게. 지우지는 않는다 — 없는 것과 '아직 모르는 것'은 다르다. */
.gap-bar.thin {
  opacity: 0.32;
}

.gap-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
  text-align: right;
}

.gap-value.bad {
  color: var(--viz-worse);
}

.gap-note {
  display: block;
  font-size: 10px;
  font-weight: 400;
  color: var(--ink-4);
}

.gap-foot {
  margin: 10px 0 0;
  font-size: 11px;
  color: var(--ink-4);
  line-height: 1.5;
}

@media (max-width: 640px) {
  .gap-axis span:first-child {
    padding-right: 0;
  }

  .gap-axis span:last-child {
    padding-left: 0;
  }

  .gap-row {
    grid-template-columns: 76px 1fr 62px;
    gap: 8px;
  }
}
</style>
