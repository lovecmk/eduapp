<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { api } from '../api/client';
import type { LearnerToday } from '../api/types';
import { useAsync } from '../composables/useAsync';
import { difficultyLabel } from '../lib/format';
import AsyncSection from './AsyncSection.vue';
import StatusBadge from './StatusBadge.vue';

/**
 * 이 사람이 오늘 받은 문제.
 *
 * 편성이 사람마다 다르기 때문에 필요한 화면이다. "왜 이 사람에게 이 문제가
 * 나갔나"는 교육 담당자가 가장 자주 받는 질문인데, 콘솔에서 그 사람의 화면을
 * 그대로 볼 수 없으면 답할 방법이 없다.
 *
 * ── 조회가 편성을 만들지 않는다 ────────────────────────────────────────
 * 서버는 아직 편성이 없으면 '아직 시작 안 함'으로 답한다. 관리자가 목록을
 * 열어 봤다는 이유로 그 사람의 오늘 문제가 확정되면, 아직 앱을 열지도 않은
 * 사람의 편성이 관리자의 조회 시각과 그때의 후보로 굳어 버린다.
 */
const props = defineProps<{ userId: string }>();

const today = useAsync<LearnerToday>(() => api.learnerToday(props.userId));

onMounted(() => void today.run());
watch(() => props.userId, () => void today.run());

const plan = computed(() => today.data.value?.plan ?? null);
const started = computed(() => today.data.value?.started === true);
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2 class="panel-title">오늘의 학습</h2>
      <StatusBadge v-if="plan" tone="accent" dotless>
        {{ difficultyLabel(plan.difficulty_cd) }} · {{ plan.cards.length }}문제
      </StatusBadge>
    </div>

    <AsyncSection
      :loading="today.loading.value"
      :error="today.error.value"
      :empty="!started"
      empty-text="오늘 아직 앱을 열지 않았습니다. 학습을 시작하면 그때 문제가 편성됩니다."
      :on-retry="today.run"
    >
      <div v-if="plan" class="body">
        <p class="line">
          <span class="num">{{ plan.done_count }}</span> / {{ plan.cards.length }}문제 완료
          <span class="muted">· 목표 {{ plan.target_count }}문제</span>
        </p>

        <ol class="cards">
          <li v-for="c in plan.cards" :key="c.id" class="card-row" :class="{ done: c.done }">
            <span class="kind" :class="c.kind === 'REVIEW' ? 'kind-review' : 'kind-new'">
              {{ c.kind === 'REVIEW' ? '복습' : '신규' }}
            </span>
            <RouterLink :to="`/cards/${c.id}/edit`" class="title truncate">
              {{ c.title_txt || c.question_txt || '(제목 없음)' }}
            </RouterLink>
            <span class="diff">{{ difficultyLabel(c.difficulty_cd) }}</span>
            <span v-if="c.done" class="done-mark" aria-label="완료">✓</span>
          </li>
        </ol>

        <!-- 후보가 모자라 목표를 못 채운 경우는 콘텐츠 문제다. 조용히 넘기면
             "왜 3문제만 나왔지?"를 아무도 설명하지 못한다. -->
        <p v-if="plan.cards.length < plan.target_count" class="callout callout-warn short">
          목표 {{ plan.target_count }}문제 중 {{ plan.cards.length }}문제만 편성됐습니다 —
          이 직원에게 낼 수 있는 문제가 부족합니다.
        </p>
      </div>
    </AsyncSection>
  </section>
</template>

<style scoped>
.body {
  padding: 12px 14px 14px;
}
.line {
  margin: 0 0 10px;
  font-size: 12.5px;
  color: var(--ink-2);
}
.line .num {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}
.muted {
  color: var(--ink-4);
}

.cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--line);
}
.card-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: var(--surface);
  font-size: 12.5px;
  min-width: 0;
}
/* 이미 푼 문제는 한 단계 물러난다 — 남은 것이 먼저 읽혀야 한다. */
.card-row.done .title {
  color: var(--ink-3);
}

/* 신규와 복습은 목적이 다르다. 색만으로 말하지 않도록 글자를 함께 둔다. */
.kind {
  flex-shrink: 0;
  height: 18px;
  padding: 0 6px;
  border-radius: var(--r-1);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 18px;
}
.kind-new {
  background: var(--accent-bg);
  color: var(--accent-ink);
}
.kind-review {
  background: var(--surface-3);
  color: var(--ink-3);
}

.title {
  flex: 1;
  min-width: 0;
}
.diff,
.done-mark {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--ink-4);
}
.done-mark {
  color: var(--ok);
  font-weight: 700;
}

.short {
  margin: 10px 0 0;
  font-size: 11.5px;
}
</style>
