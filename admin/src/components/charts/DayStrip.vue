<script setup lang="ts">
import { computed } from 'vue';

import type { ActivityPoint } from '../../api/types';
import { dayStrip, longestStreak } from '../../lib/chart';

/**
 * 최근 30일 학습 리듬 — 칸 띠.
 *
 * ── 왜 이 형태인가 ────────────────────────────────────────────────────────
 * 값이 0 아니면 1 이라 선그래프로 그리면 사각파가 되고, '얼마나 했는가'를
 * 읽는 것처럼 보인다. 실제로 읽어야 하는 것은 **띄엄띄엄한가, 이어지는가**다.
 * 학습한 날이 같은 8일이어도 8일 연속과 한 달에 흩뿌린 8일은 전혀 다른 상태이고,
 * 그 차이가 처방을 가른다(복귀 유도인가, 복습 주기 교정인가).
 *
 * 이 데이터는 서버가 계속 내려보내고 있었는데 화면에 그려진 적이 없었다.
 * 표로 만들면 30줄이 되어 아무도 안 읽으므로, 애초에 표가 아니라 그림이어야 했다.
 */
const props = defineProps<{ points: ActivityPoint[] }>();

const cells = computed(() => dayStrip(props.points));
const activeDays = computed(() => cells.value.filter((c) => c.active).length);
const streak = computed(() => longestStreak(cells.value));

/** 마지막 칸이 오늘이다 — 축 라벨은 양 끝만 적는다(30개를 다 적으면 못 읽는다). */
const firstDay = computed(() => cells.value[0]?.day ?? '');
</script>

<template>
  <div v-if="cells.length" class="strip">
    <div
      class="strip-cells"
      role="img"
      :aria-label="`최근 ${cells.length}일 중 ${activeDays}일 학습, 최장 연속 ${streak}일`"
    >
      <i
        v-for="c in cells"
        :key="c.day"
        class="cell"
        :class="{ on: c.active, week: c.weekStart }"
        :title="`${c.day} · ${c.active ? '학습함' : '학습 없음'}`"
      />
    </div>

    <div class="strip-foot">
      <span class="strip-scale">{{ firstDay }}</span>
      <span class="strip-stat">
        {{ cells.length }}일 중 <b class="num">{{ activeDays }}일</b> 학습 ·
        최장 연속 <b class="num">{{ streak }}일</b>
      </span>
      <span class="strip-scale">오늘</span>
    </div>
  </div>
</template>

<style scoped>
.strip-cells {
  display: flex;
  gap: 2px;
  align-items: stretch;
  height: 26px;
}

.cell {
  flex: 1 1 0;
  min-width: 0;
  border-radius: 2px;
  background: var(--viz-track);
}

.cell.on {
  background: var(--viz-better);
}

/* 주가 바뀌는 자리에만 틈을 준다 — 요일 눈금을 30개 적는 것보다 조용하다. */
.cell.week {
  margin-left: 5px;
}

.strip-foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: 7px;
  font-size: 11px;
  color: var(--ink-4);
}

.strip-stat {
  color: var(--ink-2);
}

.strip-stat b {
  font-weight: 600;
  color: var(--ink);
}

.strip-scale {
  flex: 0 0 auto;
}

@media (max-width: 640px) {
  /* 좁은 화면에서는 양 끝 날짜를 지운다 — 가운데 요약만 남으면 충분하다. */
  .strip-scale {
    display: none;
  }

  .strip-foot {
    justify-content: center;
  }
}
</style>
