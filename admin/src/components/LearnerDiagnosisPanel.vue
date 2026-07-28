<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { api } from '../api/client';
import type { LearnerDiagnosis, MissSignal } from '../api/types';
import { useAsync } from '../composables/useAsync';
import { num } from '../lib/format';
import { pct, severityBadge, severityLabel } from '../lib/insight';
import AsyncSection from './AsyncSection.vue';
import AppIcon from './AppIcon.vue';

/**
 * 학습자 한 명의 코칭 진단.
 *
 * 이 화면이 답하려는 질문은 하나다: **"이 사람에게 무엇을 가르쳐야 하는가."**
 *
 * 그래서 오답 목록을 그냥 늘어놓지 않는다. 가장 중요한 구분을 먼저 한다 —
 * 다들 틀리는 문제를 이 사람도 틀린 것인지, 다들 맞히는데 이 사람만 틀리는 것인지.
 * 앞엣것은 문제를 고칠 일이고, 뒤엣것만 사람을 가르칠 일이다.
 * 구분 없이 어려운 순서대로 코칭하면 대부분 헛수고가 된다.
 *
 * 문제·정답·해설을 카드 안에 함께 편다. 제목만 있으면 관리자가 그 문제를 다시
 * 찾아 열어야 하고, 그 수고 때문에 결국 코칭을 안 하게 된다.
 */
const props = defineProps<{ userId: string }>();

const { data, error, loading, run } = useAsync<LearnerDiagnosis>(() =>
  api.learnerDiagnosis(props.userId),
);

/** 펼쳐 둔 오답(문제·정답·해설). 여러 개를 동시에 펼 수 있어야 비교하며 설명한다. */
const opened = ref<Set<string>>(new Set());

/** 신호별 보기 — 기본은 '이 사람 약점'만. 섞어 보여 주면 구분한 의미가 없다. */
const filter = ref<MissSignal | 'all'>('personal');

const missed = computed(() => {
  const list = data.value?.missed ?? [];
  return filter.value === 'all' ? list : list.filter((m) => m.signal === filter.value);
});

const counts = computed(() => {
  const list = data.value?.missed ?? [];
  return {
    all: list.length,
    personal: list.filter((m) => m.signal === 'personal').length,
    shared: list.filter((m) => m.signal === 'shared').length,
    unknown: list.filter((m) => m.signal === 'unknown').length,
  };
});

/** 또래보다 나쁘면 색을 준다. 정상까지 칠하면 나쁜 값이 눈에 안 들어온다. */
function worseThanPeers(mine: number, peer: number): boolean {
  return peer > 0 && mine - peer >= 0.1;
}

function toggle(id: string): void {
  const next = new Set(opened.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  opened.value = next;
}

function signalLabel(s: MissSignal): string {
  switch (s) {
    case 'personal':
      return '이 사람만 어려워함';
    case 'shared':
      return '모두 어려워함';
    default:
      return '비교 표본 부족';
  }
}

function signalBadge(s: MissSignal): string {
  switch (s) {
    case 'personal':
      return 'badge-danger';
    case 'shared':
      return 'badge-neutral';
    default:
      return 'badge-info';
  }
}

const awayLabel = computed(() => {
  const d = data.value?.summary.days_away ?? 0;
  if (!data.value?.summary.last_seen) return '기록 없음';
  return d === 0 ? '오늘' : `${num(d)}일 전`;
});

onMounted(() => void run());
watch(() => props.userId, () => void run());
</script>

<template>
  <section class="panel span-2">
    <div class="panel-head">
      <h2 class="panel-title">학습 진단 · 무엇을 가르칠까</h2>
      <span class="panel-note">또래와 비교해 이 사람만의 약점을 가려냅니다</span>
    </div>

    <AsyncSection
      :loading="loading"
      :error="error"
      :empty="!data"
      :skeleton-rows="5"
      :on-retry="run"
    >
      <div v-if="data" class="panel-body">
        <!-- 결론 먼저 -->
        <div class="verdicts">
          <article v-for="(v, i) in data.verdict" :key="i" class="verdict">
            <span class="badge" :class="severityBadge(v.severity)">{{ severityLabel(v.severity) }}</span>
            <div class="verdict-body">
              <h3 class="verdict-title">{{ v.title }}</h3>
              <p class="verdict-detail">{{ v.detail }}</p>
            </div>
            <div class="verdict-metric num">{{ v.metric }}</div>
          </article>
        </div>

        <!-- 요약: 모든 수치에 또래를 나란히 -->
        <div class="table-wrap">
          <table class="table compare">
            <thead>
              <tr>
                <th>지표</th>
                <th class="right">이 사람</th>
                <th class="right">또래 평균</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>실패율</td>
                <td
                  class="right num"
                  :class="{ bad: worseThanPeers(data.summary.lapse_rate, data.summary.peer_lapse_rate) }"
                >
                  {{ pct(data.summary.lapse_rate) }}
                </td>
                <td class="right num muted">{{ pct(data.summary.peer_lapse_rate) }}</td>
              </tr>
              <tr>
                <td>숙달률</td>
                <td
                  class="right num"
                  :class="{ bad: worseThanPeers(data.summary.peer_mastery_rate, data.summary.mastery_rate) }"
                >
                  {{ pct(data.summary.mastery_rate) }}
                </td>
                <td class="right num muted">{{ pct(data.summary.peer_mastery_rate) }}</td>
              </tr>
              <tr>
                <td>푼 문제</td>
                <td class="right num">{{ num(data.summary.cards) }}장</td>
                <td class="right num muted">—</td>
              </tr>
              <tr>
                <td>학습한 날</td>
                <td class="right num">{{ num(data.summary.active_days) }}일</td>
                <td class="right num muted">
                  {{ data.summary.habitual ? '습관 형성' : '아직 불규칙' }}
                </td>
              </tr>
              <tr>
                <td>마지막 학습</td>
                <td class="right num" :class="{ bad: data.summary.days_away >= 7 }">{{ awayLabel }}</td>
                <td class="right num muted">—</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 분야별 약점 -->
        <h3 class="section-title">분야별 · 또래 대비</h3>
        <div v-if="data.weakness.length" class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>분야</th>
                <th class="right">푼 문제</th>
                <th class="right">본인</th>
                <th class="right">또래</th>
                <th class="right">차이</th>
                <th>판정</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in data.weakness" :key="w.category">
                <td class="strong">{{ w.category }}</td>
                <td class="right num">{{ num(w.cards) }}</td>
                <td class="right num" :class="{ bad: w.verdict === 'weak' }">{{ pct(w.lapse_rate) }}</td>
                <td class="right num muted">{{ w.peer_rate ? pct(w.peer_rate) : '—' }}</td>
                <td class="right num" :class="{ bad: w.gap >= 0.25 }">
                  {{ w.peer_rate ? `${w.gap > 0 ? '+' : ''}${Math.round(w.gap * 100)}%p` : '—' }}
                </td>
                <td>
                  <span
                    v-if="w.verdict === 'weak'"
                    class="badge badge-danger"
                  >이 분야를 가르칠 것</span>
                  <span
                    v-else-if="w.verdict === 'shared'"
                    class="badge badge-neutral"
                  >모두 어려워함</span>
                  <span v-else class="muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty">아직 분야를 나눌 만큼 학습하지 않았습니다.</p>

        <!-- 오답 -->
        <h3 class="section-title">틀린 문제</h3>
        <div class="chips">
          <button
            class="chip"
            :class="{ on: filter === 'personal' }"
            type="button"
            @click="filter = 'personal'"
          >
            이 사람만 어려워함 {{ counts.personal }}
          </button>
          <button class="chip" :class="{ on: filter === 'shared' }" type="button" @click="filter = 'shared'">
            모두 어려워함 {{ counts.shared }}
          </button>
          <button class="chip" :class="{ on: filter === 'unknown' }" type="button" @click="filter = 'unknown'">
            표본 부족 {{ counts.unknown }}
          </button>
          <button class="chip" :class="{ on: filter === 'all' }" type="button" @click="filter = 'all'">
            전체 {{ counts.all }}
          </button>
        </div>

        <p v-if="filter === 'shared' && counts.shared > 0" class="hint">
          이 문제들은 다른 사람도 대부분 틀립니다. 개인 코칭보다 문제나 교육 자료를 손보는 편이 빠릅니다.
        </p>

        <ul v-if="missed.length" class="miss-list">
          <li v-for="m in missed" :key="m.card_id" class="miss">
            <button class="miss-head" type="button" :aria-expanded="opened.has(m.card_id)" @click="toggle(m.card_id)">
              <span class="badge" :class="signalBadge(m.signal)">{{ signalLabel(m.signal) }}</span>
              <span class="miss-title truncate">{{ m.title }}</span>
              <span class="miss-stat num">
                {{ num(m.lapses) }}/{{ num(m.reps) }}회 실패
                <span class="muted">
                  (본인 {{ pct(m.lapse_rate) }}<template v-if="m.peer_count >= 5"> · 또래 {{ pct(m.peer_rate) }}</template>)
                </span>
              </span>
              <AppIcon :name="opened.has(m.card_id) ? 'chevron-up' : 'chevron-down'" :size="14" />
            </button>

            <!-- 펼치면 여기서 바로 가르칠 수 있다 -->
            <div v-if="opened.has(m.card_id)" class="miss-body">
              <dl class="teach">
                <div>
                  <dt>문제</dt>
                  <dd>{{ m.question || '—' }}</dd>
                </div>
                <div>
                  <dt>정답</dt>
                  <dd class="strong">{{ m.answer || '—' }}</dd>
                </div>
                <div v-if="m.explain">
                  <dt>해설</dt>
                  <dd>{{ m.explain }}</dd>
                </div>
                <div>
                  <dt>분야 · 난이도</dt>
                  <dd class="muted">{{ m.category }} · {{ m.difficulty }}</dd>
                </div>
              </dl>
              <RouterLink :to="`/cards/${m.card_id}`" class="btn btn-sm">
                <AppIcon name="edit" :size="13" />
                문제 열기
              </RouterLink>
            </div>
          </li>
        </ul>
        <p v-else class="empty">
          {{ filter === 'personal' ? '이 사람만 어려워하는 문제는 없습니다.' : '해당하는 오답이 없습니다.' }}
        </p>
      </div>
    </AsyncSection>
  </section>
</template>

<style scoped>
.span-2 {
  grid-column: 1 / -1;
}

/* ── 결론 ────────────────────────────────────────────────────────────────── */
.verdicts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

.verdict {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.verdict-body {
  flex: 1 1 auto;
  min-width: 0;
}

.verdict-title {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
}

.verdict-detail {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--text-2);
  line-height: 1.5;
}

.verdict-metric {
  flex: 0 0 auto;
  font-size: 16px;
  font-weight: 700;
}

/* ── 비교표 ──────────────────────────────────────────────────────────────── */
.compare {
  margin-bottom: 6px;
}

/* 또래보다 나쁠 때만 색을 준다. */
.bad {
  color: var(--danger);
  font-weight: 600;
}

.section-title {
  margin: 22px 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

/* ── 오답 필터 ───────────────────────────────────────────────────────────── */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.chip {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-2);
  border-radius: 999px;
  padding: 4px 11px;
  font-size: 12.5px;
  cursor: pointer;
}

.chip:hover {
  border-color: var(--accent);
}

.chip.on {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* ── 오답 목록 ───────────────────────────────────────────────────────────── */
.miss-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.miss {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.miss-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.miss-head:hover {
  background: var(--surface-2, rgba(127, 127, 127, 0.08));
}

.miss-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
}

.miss-stat {
  flex: 0 0 auto;
  font-size: 11.5px;
}

.miss-body {
  padding: 4px 14px 14px;
  border-top: 1px solid var(--border);
}

/* 가르칠 재료 — 문제·정답·해설을 읽는 순서대로 세로로 편다. */
.teach {
  margin: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.teach dt {
  font-size: 11px;
  color: var(--text-3);
  margin-bottom: 2px;
}

.teach dd {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

@media (max-width: 720px) {
  .miss-head {
    flex-wrap: wrap;
  }

  .miss-stat {
    width: 100%;
  }

  .verdict {
    flex-wrap: wrap;
  }
}
</style>
