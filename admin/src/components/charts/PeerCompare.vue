<script setup lang="ts">
import { computed } from 'vue';

import { pairMark } from '../../lib/chart';

/**
 * 이 사람 vs 또래 — 아령형(dumbbell).
 *
 * ── 왜 이 형태인가 ────────────────────────────────────────────────────────
 * 여기서 읽어야 하는 것은 각 값의 크기가 아니라 **둘 사이의 거리**다.
 * 막대 두 개를 나란히 세우면 길이를 비교하게 되지만, 아령형은 간격 자체가
 * 하나의 형태로 보인다. 표에 '75%'와 '17%'를 나란히 적어 두면 읽는 사람이
 * 매번 머릿속에서 빼야 하고, 그 수고 때문에 결국 안 읽는다.
 *
 * 또래 점은 회색이다. 또래는 맥락이지 주인공이 아니다 — 둘 다 색을 주면
 * 무엇을 보라는 것인지 사라진다.
 *
 * ── 두 채널을 섞지 않는다 ─────────────────────────────────────────────────
 * **점은 정체(누구), 잇는 선은 방향(어느 쪽이 나쁜가).**
 * 이 사람의 점 색을 상태에 따라 바꾸면 범례의 색과 실제 점의 색이 달라져,
 * 범례가 거짓말을 한다. 그래서 점은 늘 같은 색이고, 빨강/파랑은 격차를
 * 나타내는 선에만 쓴다.
 *
 * 방향은 지표마다 다르다 — 실패율은 클수록, 숙달률은 작을수록 나쁘다
 * (higherIsWorse). 한 규칙으로 칠하면 잘하는 쪽이 빨갛게 된다.
 */
export interface PeerRow {
  label: string;
  /** 이 사람의 값(0~1 비율). */
  self: number;
  /** 또래 값(0~1 비율). */
  peer: number;
  /** 값이 클수록 나쁜 지표인가. */
  higherIsWorse: boolean;
}

const props = withDefaults(
  defineProps<{
    rows: PeerRow[];
    /** 계열 이름 — 이 그림은 '기대 vs 실제'처럼 다른 비교에도 쓰인다. */
    selfLabel?: string;
    peerLabel?: string;
    /** 왼쪽 라벨 칸 너비. 지표명은 짧고 문제 제목은 길다. */
    labelWidth?: string;
  }>(),
  { selfLabel: '이 사람', peerLabel: '다른 직원 평균', labelWidth: '62px' },
);

const marks = computed(() =>
  props.rows.map((r) => ({
    ...r,
    // 비율(0~1)을 퍼센트 축에 올린다. 축은 항상 0~100% 로 고정한다 —
    // 데이터에 맞춰 축을 좁히면 3%p 차이가 절벽처럼 보인다.
    mark: pairMark(r.self * 100, r.peer * 100, 100, r.higherIsWorse),
    selfPct: `${Math.round(r.self * 100)}%`,
    peerPct: `${Math.round(r.peer * 100)}%`,
    /** 또래 값이 없으면(0) 비교 자체가 성립하지 않는다. */
    comparable: r.peer > 0,
  })),
);
</script>

<template>
  <div class="peer">
    <!-- 계열이 둘이면 범례는 항상 있어야 한다. 색만으로 정체를 알게 두면 안 된다. -->
    <div class="peer-legend">
      <span class="key"><i class="dot dot-self" />{{ selfLabel }}</span>
      <span class="key"><i class="dot dot-peer" />{{ peerLabel }}</span>
      <span class="key"><i class="swatch is-worse" />더 나쁨</span>
      <span class="key"><i class="swatch is-better" />더 나음</span>
      <span class="peer-how">두 점이 멀수록 차이가 큽니다</span>
    </div>

    <div
      v-for="r in marks"
      :key="r.label"
      class="peer-row"
      :style="{ gridTemplateColumns: `${labelWidth} 1fr 112px` }"
    >
      <!-- 라벨은 한 줄로 자른다. 문제 제목이 네 줄로 접히면 줄 높이가 제각각이 되고
           아령이 어디에 있는지 눈으로 좇을 수 없다. 전체 제목은 아래 표에 있다. -->
      <div class="peer-label truncate" :title="r.label">{{ r.label }}</div>

      <div
        class="peer-track"
        role="img"
        :aria-label="`${r.label} — ${selfLabel} ${r.selfPct}, ${peerLabel} ${r.peerPct}`"
      >
        <!-- 눈금은 0·50·100 만. 촘촘히 그으면 격자가 데이터보다 진해진다. -->
        <i class="tick" style="left: 50%" />

        <template v-if="r.comparable">
          <i
            class="link"
            :class="r.mark.worse ? 'is-worse' : 'is-better'"
            :style="{ left: `${r.mark.linkX}%`, width: `${r.mark.linkWidth}%` }"
          />
          <i
            class="dot dot-peer at"
            :style="{ left: `${r.mark.peerX}%` }"
            :title="`${peerLabel} ${r.peerPct}`"
          />
        </template>

        <i
          class="dot dot-self at"
          :style="{ left: `${r.mark.selfX}%` }"
          :title="`${selfLabel} ${r.selfPct}`"
        />
      </div>

      <!-- 직접 라벨은 이 사람 값에만. 모든 점에 숫자를 붙이면 아무도 안 읽는다.
           또래 값은 아래 표(진단 근거 자료)에 그대로 있다. -->
      <div class="peer-value num" :class="{ bad: r.comparable && r.mark.worse }">
        {{ r.selfPct }}
        <span class="peer-vs">/ {{ r.comparable ? r.peerPct : '—' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.peer-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-bottom: 10px;
  font-size: 11px;
  color: var(--ink-4);
}

/* 읽는 법을 범례 옆에 한 줄로 둔다. 아령형은 익숙한 그림이 아니므로
   "무슨 뜻이지"에서 멈추면 그 아래를 안 본다. */
.peer-how {
  margin-left: auto;
  color: var(--ink-4);
}

.key {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.peer-row {
  display: grid;
  align-items: center;
  gap: 12px;
  padding: 5px 0;
}

.peer-label {
  font-size: 12px;
  color: var(--ink-2);
}

.peer-track {
  position: relative;
  height: 18px;
}

/* 트랙은 선 하나로 충분하다. 통을 그리면 데이터보다 배경이 진해진다. */
.peer-track::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: var(--viz-track);
}

.tick {
  position: absolute;
  top: 3px;
  bottom: 3px;
  width: 1px;
  background: var(--viz-grid);
}

/* 두 점을 잇는 선이 곧 '격차'다 — 이 차트에서 실제로 읽는 값. */
.link {
  position: absolute;
  top: 50%;
  height: 3px;
  transform: translateY(-50%);
  border-radius: 2px;
}

.link.is-worse {
  background: var(--viz-worse);
}

.link.is-better {
  background: var(--viz-better);
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: 0 0 auto;
}

/* 점이 겹치는 자리에서도 읽히도록 배경색 링을 두른다(테두리가 아니라 여백). */
.dot.at {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 2px var(--surface);
}

.dot-peer {
  background: var(--viz-peer);
}

/* 정체는 늘 같은 색이어야 범례가 정직하다. 잉크색은 어느 계열 색과도
   충돌하지 않으면서 회색 또래 점과 확실히 갈린다. */
.dot-self {
  background: var(--ink);
}

/* 범례의 격차 표시 — 선과 같은 모양(짧은 막대)이어야 무엇의 색인지 안다. */
.swatch {
  width: 12px;
  height: 3px;
  border-radius: 2px;
}

.swatch.is-worse {
  background: var(--viz-worse);
}

.swatch.is-better {
  background: var(--viz-better);
}

.peer-value {
  font-size: 12.5px;
  font-weight: 600;
  text-align: right;
}

.peer-value.bad {
  color: var(--viz-worse);
}

.peer-vs {
  font-weight: 400;
  color: var(--ink-4);
  font-size: 11px;
}

@media (max-width: 640px) {
  /* 좁은 화면에서는 값을 아래로 내린다. 세 칸을 유지하면 트랙이 손가락만큼 좁아진다. */
  .peer-row {
    grid-template-columns: minmax(0, 96px) 1fr !important;
    grid-template-areas: 'label track' 'value value';
    row-gap: 2px;
  }

  .peer-label {
    grid-area: label;
  }

  .peer-track {
    grid-area: track;
  }

  .peer-value {
    grid-area: value;
    text-align: left;
  }
}
</style>
