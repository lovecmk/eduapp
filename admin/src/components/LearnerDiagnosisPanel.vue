<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { api } from '../api/client';
import type { LearnerDiagnosis, MissSignal, Prescription } from '../api/types';
import { useAsync } from '../composables/useAsync';
import { num } from '../lib/format';
import {
  confidenceLabel,
  confidenceNote,
  isComparative,
  kindLabel,
  minutesLabel,
  nowPrescriptions,
  pct,
  priorityLabel,
  severityBadge,
  severityLabel,
  strengthLabel,
  totalMinutes,
} from '../lib/insight';
import AsyncSection from './AsyncSection.vue';
import AppIcon from './AppIcon.vue';
import PeerCompare, { type PeerRow } from './charts/PeerCompare.vue';
import GapBars, { type GapRow } from './charts/GapBars.vue';
import DayStrip from './charts/DayStrip.vue';

/**
 * 학습자 한 명의 교육 처방.
 *
 * ── 이 화면이 답하는 질문 ──────────────────────────────────────────────────
 * "이 사람에게 무엇을 가르쳐야 하는가, **그리고 왜 이 사람인가.**"
 *
 * 뒤엣것을 빼면 화면은 지시가 된다. 안전교육에서 지시는 거부되거나, 더 나쁘게는
 * 형식적으로 소화된다. "왜 나만 이걸 또 들어야 하느냐"에 답할 수 없는 교육은
 * 시간만 쓴다. 그래서 처방마다 **근거 사슬**을 그대로 편다 —
 * 무엇을 쟀는지, 얼마였는지, 무엇과 견줬는지, 표본이 얼마인지, 어느 기록에서
 * 나왔는지. 담당자가 읽고 "이건 아닌 것 같은데"라고 반박할 수 있어야 쓸모 있다.
 *
 * ── 배치 ──────────────────────────────────────────────────────────────────
 * 처방이 맨 위, 진단표가 아래다. 순서가 반대면 담당자는 표 다섯 개를 읽고
 * 각자 다른 결론을 낸다. 근거는 처방 안에 접어 두되 **한 번의 클릭**으로
 * 열리게 한다 — 다른 화면으로 보내면 아무도 확인하지 않는다.
 *
 * 색은 신호로만 쓴다. 처방을 종류별로 칠하면 색이 여섯 개가 되고,
 * 그러면 정작 급한 빨강이 눈에 안 들어온다.
 */
const props = defineProps<{ userId: string }>();

const { data, error, loading, run } = useAsync<LearnerDiagnosis>(() =>
  api.learnerDiagnosis(props.userId),
);

/**
 * 근거를 펼쳐 둔 처방.
 *
 * 기본은 **1순위만 펼침**이다. 전부 접으면 근거를 숨긴 셈이고, 전부 펼치면
 * 화면이 길어져 2순위 아래가 보이지 않는다.
 */
const openEvidence = ref<Set<string>>(new Set());

/** 펼쳐 둔 오답(문제·정답·해설). 여러 개를 동시에 펴야 비교하며 설명한다. */
const openMiss = ref<Set<string>>(new Set());

/** 신호별 보기 — 기본은 '이 사람 약점'만. 섞어 보여 주면 구분한 의미가 없다. */
const filter = ref<MissSignal | 'all'>('personal');

/** 진단 근거표를 펼쳤는가. 처방을 먼저 읽게 하려고 기본은 접어 둔다. */
const showEvidenceTables = ref(false);

const prescriptions = computed<Prescription[]>(() => data.value?.prescriptions ?? []);

const plan = computed(() => ({
  count: prescriptions.value.length,
  minutes: totalMinutes(prescriptions.value),
  thisWeek: nowPrescriptions(prescriptions.value).length,
}));

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

/**
 * 그림으로 먼저 보여 줄 두 지표.
 *
 * 표에 '75%'와 '17%'를 나란히 적어 두면 읽는 사람이 매번 머릿속에서 빼야 하고,
 * 그 수고 때문에 결국 안 읽는다. 아래 표(진단 근거 자료)는 그대로 두되 —
 * 정확한 값과 색 없이 읽는 경로가 필요하다 — 훑을 때 걸리는 것은 그림이어야 한다.
 *
 * 방향이 지표마다 다르다: 실패율은 높을수록, 숙달률은 낮을수록 나쁘다.
 * 한 규칙으로 칠하면 잘하는 쪽이 빨갛게 된다.
 */
const peerRows = computed<PeerRow[]>(() => {
  const s = data.value?.summary;
  if (!s) return [];
  return [
    { label: '틀린 비율', self: s.lapse_rate, peer: s.peer_lapse_rate, higherIsWorse: true },
    { label: '익힌 비율', self: s.mastery_rate, peer: s.peer_mastery_rate, higherIsWorse: false },
  ];
});

/** 분야별 격차 — 표본이 없는 분야(또래 값 0)는 그리지 않는다. */
const gapRows = computed<GapRow[]>(() =>
  (data.value?.weakness ?? [])
    .filter((w) => w.peer_rate > 0)
    .map((w) => ({ label: w.category, gap: w.gap, verdict: w.verdict, cards: w.cards })),
);

/**
 * 접힘 상태를 토글한다.
 *
 * Set 을 새로 만들어 바꾼다 — 제자리에서 add/delete 하면 참조가 그대로라
 * Vue 가 변화를 못 알아채고 화면이 그대로 있는다.
 *
 * 템플릿에서는 ref 가 자동으로 풀리므로 Set 자체를 인자로 넘길 수 없다.
 * 그래서 대상별로 얇은 함수를 하나씩 둔다.
 */
function toggled(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function toggleEvidence(id: string): void {
  openEvidence.value = toggled(openEvidence.value, id);
}

function toggleMiss(id: string): void {
  openMiss.value = toggled(openMiss.value, id);
}

function signalLabel(s: MissSignal): string {
  switch (s) {
    case 'personal':
      return '이 사람만';
    case 'shared':
      return '다들';
    default:
      return '비교 불가';
  }
}

/**
 * 처방을 종류별로 칠하지 않는다. 딱 한 가지만 색으로 구분한다 —
 * **사람을 가르칠 일인가, 자료를 고칠 일인가.** 이 둘이 섞이면 개인 코칭
 * 시간이 콘텐츠 문제로 새어 나간다. 나머지 구분은 글자가 한다.
 */
function isContentWork(p: Prescription): boolean {
  return p.kind === 'content';
}

const awayLabel = computed(() => {
  const d = data.value?.summary.days_away ?? 0;
  if (!data.value?.summary.last_seen) return '기록 없음';
  return d === 0 ? '오늘' : `${num(d)}일 전`;
});

/** 새 사람을 열 때마다 접힘 상태를 처음으로 돌린다(1순위만 펼침). */
function resetOpen(): void {
  openEvidence.value = new Set(prescriptions.value[0] ? [prescriptions.value[0].id] : []);
  openMiss.value = new Set();
  showEvidenceTables.value = false;
  filter.value = 'personal';
}

watch(data, resetOpen);
onMounted(() => void run());
watch(
  () => props.userId,
  () => void run(),
);
</script>

<template>
  <section class="panel span-2">
    <div class="panel-head">
      <h2 class="panel-title">이 직원에게 필요한 교육</h2>
      <span v-if="data" class="panel-note">{{ data.needs }}</span>
    </div>

    <AsyncSection
      :loading="loading"
      :error="error"
      :empty="!data"
      :skeleton-rows="5"
      :on-retry="run"
    >
      <div v-if="data" class="panel-body">
        <!-- ── 처방 ──────────────────────────────────────────────────────
             맨 위에 온다. 표를 읽고 각자 판단하라고 두면 아무도 안 한다. -->
        <div v-if="plan.count" class="plan-head">
          <p class="plan-line">
            <span class="plan-n num">{{ plan.count }}</span>
            <span>건의 교육이 필요합니다</span>
          </p>
          <p class="plan-meta">
            모두 하면 {{ minutesLabel(plan.minutes) }}
            <template v-if="plan.thisWeek"> · 이번 주 {{ plan.thisWeek }}건</template>
          </p>
        </div>

        <ol v-if="plan.count" class="rx-list">
          <li v-for="p in prescriptions" :key="p.id" class="rx">
            <!-- 왼쪽 여백에 순위만 둔다. 상자에 넣지 않는 이유:
                 처방이 여섯 개면 상자도 여섯 개가 되고, 그러면 무엇이 먼저인지
                 형태로는 알 수 없게 된다. 위계는 숫자와 세로 선이 만든다. -->
            <div class="rx-rail">
              <span class="rx-rank num">{{ String(p.rank).padStart(2, '0') }}</span>
            </div>

            <div class="rx-main">
              <div class="rx-top">
                <h3 class="rx-title" :class="{ 'is-content': isContentWork(p) }">{{ p.title }}</h3>
                <span class="rx-when" :class="{ soon: p.priority === 'now' }">
                  {{ priorityLabel(p.priority) }}
                </span>
              </div>

              <p class="rx-meta">
                {{ kindLabel(p.kind) }} · {{ p.target }} · 약 {{ minutesLabel(p.minutes) }}
              </p>

              <!-- 왜 이 사람인가 — 처방의 본문. -->
              <p class="rx-why">{{ p.why }}</p>

              <dl class="rx-do">
                <div>
                  <dt>할 일</dt>
                  <dd>{{ p.action }}</dd>
                </div>
                <div>
                  <dt>확인</dt>
                  <dd>{{ p.expect }}</dd>
                </div>
              </dl>

              <!-- ── 근거 사슬 ───────────────────────────────────────────
                   반박할 수 없는 추천은 결국 아무도 따르지 않는다. -->
              <button
                class="rx-eviq"
                type="button"
                :aria-expanded="openEvidence.has(p.id)"
                @click="toggleEvidence(p.id)"
              >
                <AppIcon :name="openEvidence.has(p.id) ? 'chevron-up' : 'chevron-down'" :size="12" />
                왜 이 교육인가 · 근거 {{ p.evidence.length }}개
                <span class="rx-conf" :class="`conf-${p.confidence}`">{{ confidenceLabel(p.confidence) }}</span>
                <span class="rx-confnote">{{ confidenceNote(p.confidence) }}</span>
              </button>

              <ol v-if="openEvidence.has(p.id)" class="ev-list">
                <li v-for="(e, i) in p.evidence" :key="i" class="ev">
                  <p class="ev-fact">{{ e.fact }}</p>
                  <dl class="ev-grid">
                    <dt>관측</dt>
                    <dd class="num">{{ e.observed }}</dd>

                    <!-- 비교 대상이 없으면 줄 자체를 그리지 않는다.
                         "비교 대상 없음"이라고 적으면 그것도 하나의 주장이 되는데,
                         근거 중에는 관측값 자체가 이미 또래 수치인 것도 있다.
                         그 위에 '비교 없음'을 얹으면 사실과 어긋난다.
                         근거의 질은 아래 세기 표시가 말한다. -->
                    <template v-if="isComparative(e)">
                      <dt>대조</dt>
                      <dd class="num">{{ e.compared }}</dd>
                    </template>

                    <template v-if="e.sample">
                      <dt>기록</dt>
                      <dd class="num">{{ e.sample }}</dd>
                    </template>

                    <dt>기준</dt>
                    <dd>{{ e.rule }}</dd>

                    <dt>출처</dt>
                    <dd class="ev-src">{{ e.source }}</dd>
                  </dl>
                  <span class="ev-strength" :class="`st-${e.strength}`">근거 {{ strengthLabel(e.strength) }}</span>
                </li>
              </ol>

              <!-- 지목한 문제 — 여기서 바로 열 수 있어야 코칭이 미뤄지지 않는다. -->
              <div v-if="p.cards.length" class="rx-cards">
                <p class="rx-cards-head">이 문제들을 설명하세요 · {{ p.cards.length }}장</p>
                <ul>
                  <li v-for="c in p.cards" :key="c.card_id">
                    <RouterLink :to="`/cards/${c.card_id}`" class="rx-card-link truncate">
                      {{ c.title }}
                    </RouterLink>
                    <span class="rx-card-why num">{{ c.reason }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </li>
        </ol>

        <p v-else class="rx-none">
          지금 따로 교육할 것이 없습니다. 다른 직원과 비교해 뒤처지는 분야가 없고 학습도 이어지고 있습니다.
        </p>

        <!-- ── 지금 상태 ───────────────────────────────────────────────────
             할 일이 먼저, 상태가 그다음이다. 담당자가 이 화면을 여는 이유는
             "이 사람 무엇을 해야 하나"이지 "이 사람 통계가 어떤가"가 아니다.
             그림은 위 처방이 왜 나왔는지를 눈으로 확인시켜 주는 자리다. -->
        <div v-if="data.summary.cards > 0" class="glance">
          <h3 class="glance-head">지금 상태</h3>

          <div class="glance-col">
            <h4 class="section-title">다른 직원과 비교하면</h4>
            <PeerCompare :rows="peerRows" />
          </div>

          <div v-if="gapRows.length" class="glance-col">
            <h4 class="section-title">어느 분야를 어려워하나</h4>
            <GapBars :rows="gapRows" />
          </div>

          <div v-if="data.rhythm.length" class="glance-col">
            <h4 class="section-title">얼마나 꾸준히 하나</h4>
            <DayStrip :points="data.rhythm" />
          </div>
        </div>

        <!-- ── 진단 근거 ───────────────────────────────────────────────────
             처방을 뒷받침하는 원자료. 처방보다 위에 두면 담당자는 표를 읽다가
             결론에 도달하지 못한다. 접어 두되 한 번에 열리게 한다. -->
        <button
          class="fold"
          type="button"
          :aria-expanded="showEvidenceTables"
          @click="showEvidenceTables = !showEvidenceTables"
        >
          <AppIcon :name="showEvidenceTables ? 'chevron-up' : 'chevron-down'" :size="12" />
          자세한 자료 보기 · 비교표 · 분야별 · 틀린 문제 {{ counts.all }}건
        </button>

        <div v-if="showEvidenceTables" class="tables">
          <!-- 결론 문장 -->
          <div class="verdicts">
            <article v-for="(v, i) in data.verdict" :key="i" class="verdict">
              <span class="badge" :class="severityBadge(v.severity)">{{ severityLabel(v.severity) }}</span>
              <div class="verdict-body">
                <h4 class="verdict-title">{{ v.title }}</h4>
                <p class="verdict-detail">{{ v.detail }}</p>
              </div>
              <div class="verdict-metric num">{{ v.metric }}</div>
            </article>
          </div>

          <!-- 요약: 모든 수치에 또래를 나란히 -->
          <h4 class="section-title">숫자로 보기</h4>
          <div class="table-wrap">
            <table class="table compare">
              <thead>
                <tr>
                  <th>지표</th>
                  <th class="right">이 사람</th>
                  <th class="right">다른 직원 평균</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>틀린 비율</td>
                  <td
                    class="right num"
                    :class="{ bad: worseThanPeers(data.summary.lapse_rate, data.summary.peer_lapse_rate) }"
                  >
                    {{ pct(data.summary.lapse_rate) }}
                  </td>
                  <td class="right num muted">{{ pct(data.summary.peer_lapse_rate) }}</td>
                </tr>
                <tr>
                  <td>확실히 익힌 비율</td>
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
          <h4 class="section-title">분야별 자세히</h4>
          <div v-if="data.weakness.length" class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>분야</th>
                  <th class="right">푼 문제</th>
                  <th class="right">본인</th>
                  <th class="right">다른 직원</th>
                  <th class="right">차이(%포인트)</th>
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
                    {{ w.peer_rate ? `${w.gap > 0 ? '+' : ''}${Math.round(w.gap * 100)}` : '—' }}
                  </td>
                  <td>
                    <span v-if="w.verdict === 'weak'" class="badge badge-danger">가르칠 분야</span>
                    <span v-else-if="w.verdict === 'shared'" class="badge badge-neutral">모두 어려워함</span>
                    <span v-else class="muted">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty">아직 분야를 나눌 만큼 학습하지 않았습니다.</p>

          <!-- 오답 -->
          <h4 class="section-title">틀린 문제 목록</h4>
          <div class="chips">
            <button
              class="chip"
              :class="{ on: filter === 'personal' }"
              type="button"
              @click="filter = 'personal'"
            >
              이 사람만 틀림<span class="chip-n">{{ counts.personal }}</span>
            </button>
            <button class="chip" :class="{ on: filter === 'shared' }" type="button" @click="filter = 'shared'">
              다들 틀림<span class="chip-n">{{ counts.shared }}</span>
            </button>
            <button class="chip" :class="{ on: filter === 'unknown' }" type="button" @click="filter = 'unknown'">
              비교 불가<span class="chip-n">{{ counts.unknown }}</span>
            </button>
            <button class="chip" :class="{ on: filter === 'all' }" type="button" @click="filter = 'all'">
              전체<span class="chip-n">{{ counts.all }}</span>
            </button>
          </div>

          <p v-if="filter === 'shared' && counts.shared > 0" class="hint">
            이 문제들은 다른 직원도 대부분 틀립니다. 개별 설명보다 문제나 교육 자료를 손보는 편이 빠릅니다.
          </p>

          <ul v-if="missed.length" class="miss-list">
            <li v-for="m in missed" :key="m.card_id" class="miss">
              <button
                class="miss-head"
                type="button"
                :aria-expanded="openMiss.has(m.card_id)"
                @click="toggleMiss(m.card_id)"
              >
                <span class="miss-sig" :class="`sig-${m.signal}`">{{ signalLabel(m.signal) }}</span>
                <span class="miss-title truncate">{{ m.title }}</span>
                <span class="miss-stat num">
                  {{ num(m.reps) }}번 중 {{ num(m.lapses) }}번 틀림
                  <span class="muted">
                    ({{ pct(m.lapse_rate) }}<template v-if="m.peer_count >= 5"> · 다른 직원 {{ pct(m.peer_rate) }}</template>)
                  </span>
                </span>
                <AppIcon :name="openMiss.has(m.card_id) ? 'chevron-up' : 'chevron-down'" :size="12" />
              </button>

              <!-- 펼치면 여기서 바로 가르칠 수 있다 -->
              <div v-if="openMiss.has(m.card_id)" class="miss-body">
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
            {{ filter === 'personal' ? '이 사람만 틀리는 문제는 없습니다.' : '해당하는 문제가 없습니다.' }}
          </p>
        </div>
      </div>
    </AsyncSection>
  </section>
</template>

<style scoped>
.span-2 {
  grid-column: 1 / -1;
}

/* ── 처방 머리 ────────────────────────────────────────────────────────────
   총량을 먼저 말한다. 개별 처방이 아무리 타당해도 다 합쳐 세 시간이면
   담당자는 시작조차 못 한다. 무엇을 자를지 정하려면 총량이 먼저 보여야 한다. */
.plan-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line-strong);
}

.plan-line {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 14px;
  color: var(--ink-2);
}

.plan-n {
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
  color: var(--ink);
  letter-spacing: -0.02em;
}

.plan-meta {
  font-size: 12px;
  color: var(--ink-4);
  font-variant-numeric: tabular-nums;
}

/* ── 한눈에 ─────────────────────────────────────────────────────────────
   처방 위에 놓는 그림 묶음. 세 그림이 서로 다른 질문에 답한다 —
   어디에 서 있는가 / 무엇을 가르칠 것인가 / 오기는 하는가. */
.glance {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 18px 0 4px;
  margin-top: 4px;
  border-top: 1px solid var(--line-strong);
}

.glance-head {
  font-size: 13px;
  font-weight: 650;
  letter-spacing: -0.01em;
  margin-bottom: -6px;
}

.glance-col .section-title {
  margin-bottom: 8px;
}

/* ── 처방 목록 ───────────────────────────────────────────────────────────
   상자에 담지 않는다. 여섯 개를 전부 테두리로 감싸면 무엇이 먼저인지
   형태로는 알 수 없게 된다. 위계는 순번과 세로 선이 만든다. */
.rx-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.rx {
  display: flex;
  gap: 14px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}

.rx:last-child {
  border-bottom: 0;
}

/* 왼쪽 홈통 — 순번과 세로 선. */
.rx-rail {
  flex: 0 0 30px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  position: relative;
}

.rx-rail::after {
  content: '';
  position: absolute;
  top: 22px;
  bottom: 0;
  right: 8px;
  width: 1px;
  background: var(--line);
}

.rx-rank {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink-4);
  letter-spacing: -0.01em;
  padding-right: 4px;
}

.rx-main {
  flex: 1 1 auto;
  min-width: 0;
}

.rx-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.rx-title {
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.01em;
  margin: 0;
}

/* 딱 한 가지만 색으로 가른다 — 사람을 가르칠 일인가, 자료를 고칠 일인가. */
.rx-title.is-content {
  color: var(--ink-2);
  font-weight: 600;
}

.rx-when {
  flex: 0 0 auto;
  font-size: 11.5px;
  color: var(--ink-4);
  white-space: nowrap;
}

.rx-when.soon {
  color: var(--danger);
  font-weight: 600;
}

.rx-meta {
  margin: 3px 0 0;
  font-size: 11.5px;
  color: var(--ink-4);
}

.rx-why {
  margin: 9px 0 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--ink);
}

.rx-do {
  margin: 10px 0 0;
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 3px 10px;
  font-size: 12.5px;
  line-height: 1.6;
}

.rx-do > div {
  display: contents;
}

.rx-do dt {
  color: var(--ink-4);
  font-size: 11.5px;
  padding-top: 1px;
}

.rx-do dd {
  margin: 0;
  color: var(--ink-2);
}

/* ── 근거 열기 ───────────────────────────────────────────────────────── */
.rx-eviq {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 11px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.rx-eviq:focus-visible {
  outline: none;
  box-shadow: var(--focus);
  border-radius: var(--r-1);
}

.rx-conf {
  font-weight: 600;
}

.conf-high {
  color: var(--ok);
}

.conf-medium {
  color: var(--ink-2);
}

/* 확신이 낮으면 눈에 띄어야 한다 — 근거의 한계를 숨기면 처방이 과신된다. */
.conf-low {
  color: var(--warn);
}

.rx-confnote {
  color: var(--ink-4);
  font-weight: 400;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 근거 사슬 ───────────────────────────────────────────────────────────
   표로 그리지 않는다. 근거는 서로 다른 것을 재므로 열이 맞지 않고,
   억지로 맞추면 빈칸이 '값이 0'처럼 읽힌다. */
.ev-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  counter-reset: ev;
}

.ev {
  position: relative;
  padding: 10px 0 10px 20px;
  border-top: 1px dashed var(--line-strong);
  counter-increment: ev;
}

.ev::before {
  content: counter(ev);
  position: absolute;
  left: 0;
  top: 11px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--ink-4);
  font-variant-numeric: tabular-nums;
}

.ev-fact {
  margin: 0 0 6px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.55;
}

.ev-grid {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 2px 10px;
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.ev-grid dt {
  color: var(--ink-4);
  font-size: 11px;
  padding-top: 1px;
}

.ev-grid dd {
  margin: 0;
  color: var(--ink-2);
}

.ev-src {
  color: var(--ink-4);
  font-size: 11.5px;
}

.ev-strength {
  display: inline-block;
  margin-top: 7px;
  font-size: 11px;
  color: var(--ink-4);
}

.st-strong {
  color: var(--ok);
}

.st-weak {
  color: var(--warn);
}

/* ── 지목한 문제 ─────────────────────────────────────────────────────── */
.rx-cards {
  margin-top: 12px;
  padding-top: 9px;
  border-top: 1px solid var(--line);
}

.rx-cards-head {
  margin: 0 0 5px;
  font-size: 11px;
  color: var(--ink-4);
}

.rx-cards ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.rx-cards li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 3px 0;
  font-size: 12.5px;
}

.rx-card-link {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--ink);
  text-decoration: none;
}

.rx-card-link:hover {
  color: var(--accent);
  text-decoration: underline;
}

/* 왜 이 문제가 뽑혔는지 — 목록만 주면 순서의 뜻이 사라진다. */
.rx-card-why {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--ink-4);
}

.rx-none {
  margin: 0;
  padding: 26px 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--ink-3);
}

/* ── 진단 근거 접기 ──────────────────────────────────────────────────── */
.fold {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin-top: 18px;
  padding: 9px 0 0;
  border: 0;
  border-top: 1px solid var(--line-strong);
  background: transparent;
  color: var(--ink-3);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.fold:hover {
  color: var(--ink);
}

.fold:focus-visible {
  outline: none;
  box-shadow: var(--focus);
  border-radius: var(--r-1);
}

.tables {
  margin-top: 14px;
}

.tables .section-title {
  margin-top: 22px;
}

/* ── 결론 ────────────────────────────────────────────────────────────── */
.verdicts {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.verdict {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: var(--r-2);
}

.verdict-body {
  flex: 1 1 auto;
  min-width: 0;
}

.verdict-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.verdict-detail {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--ink-2);
  line-height: 1.55;
}

.verdict-metric {
  flex: 0 0 auto;
  font-size: 15px;
  font-weight: 700;
}

/* 또래보다 나쁠 때만 색을 준다. */
.bad {
  color: var(--danger);
  font-weight: 600;
}

/* ── 오답 목록 ───────────────────────────────────────────────────────── */
.miss-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.miss {
  border-bottom: 1px solid var(--line);
}

.miss:last-child {
  border-bottom: 0;
}

.miss-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 4px;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.miss-head:hover {
  background: var(--surface-2);
}

.miss-head:focus-visible {
  outline: none;
  box-shadow: var(--focus);
  border-radius: var(--r-1);
}

/* 배지 대신 짧은 글자 + 색. 배지를 줄줄이 세우면 목록이 알록달록해져
   정작 'personal' 이 눈에 안 들어온다. */
.miss-sig {
  flex: 0 0 62px;
  font-size: 11px;
  color: var(--ink-4);
}

.sig-personal {
  color: var(--danger);
  font-weight: 600;
}

.miss-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
}

.miss-stat {
  flex: 0 0 auto;
  font-size: 11px;
}

.miss-body {
  padding: 2px 4px 14px;
}

/* 가르칠 재료 — 문제·정답·해설을 읽는 순서대로 세로로 편다. */
.teach {
  margin: 8px 0 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.teach dt {
  font-size: 11px;
  color: var(--ink-4);
  margin-bottom: 2px;
}

.teach dd {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
}

@media (max-width: 720px) {
  .rx {
    gap: 10px;
  }

  .rx-rail {
    flex-basis: 22px;
  }

  .rx-rail::after {
    display: none;
  }

  .rx-top {
    flex-wrap: wrap;
  }

  .rx-do {
    grid-template-columns: 34px 1fr;
  }

  .rx-confnote {
    display: none;
  }

  .rx-cards li {
    flex-wrap: wrap;
    gap: 2px;
  }

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
