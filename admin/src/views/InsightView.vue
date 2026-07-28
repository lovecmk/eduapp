<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { api } from '../api/client';
import type { Insight } from '../api/types';
import { useAsync } from '../composables/useAsync';
import { num } from '../lib/format';
import AsyncSection from '../components/AsyncSection.vue';
import AppIcon from '../components/AppIcon.vue';
import StatTile from '../components/StatTile.vue';
import {
  anomalyMarks,
  applyCategoryFilter,
  calibrationLabel,
  churnBadge,
  churnLabel,
  funnelWidth,
  heatIntensity,
  pct,
  severityLabel,
  sparklinePoints,
} from '../lib/insight';

/**
 * 분석 — 숫자에서 '무엇을 해야 하는가'까지.
 *
 * 대시보드가 현황(몇 명·몇 장)을 보여 준다면 여기는 **판단**을 보여 준다.
 * 두 화면을 나눈 이유가 그것이다. 현황과 판단을 섞으면, 매일 봐야 하는 숫자와
 * 가끔 파고들 분석이 같은 무게로 놓여 둘 다 안 보게 된다.
 *
 * 화면이 지키는 규칙 세 가지:
 *
 *  1. **믿을 수 있는지부터 말한다.** 학습자가 10명인데 코호트 히트맵을 그리면
 *     보는 사람은 그것을 사실로 받아들인다. 표본 판정이 가장 위에 온다.
 *  2. **결론을 먼저, 근거를 뒤에.** 헤드라인이 할 일을 말하고, 아래 표들이
 *     그 근거다. 차트를 스무 개 늘어놓으면 아무도 무엇부터 할지 모른다.
 *  3. **파고들 수 있어야 한다.** 모든 항목에서 해당 문제·사용자 화면으로
 *     바로 넘어간다. 발견하고 나서 찾아 헤매야 한다면 발견하지 않은 것과 같다.
 */
const router = useRouter();

const { data, error, loading, run } = useAsync<Insight>(() => api.insight());
const refreshing = ref(false);

/** 조사용 분야 필터 — 하나를 고르면 아래 표들이 전부 그 분야로 좁혀진다. */
const category = ref<string | null>(null);

const view = computed(() => (data.value ? applyCategoryFilter(data.value, category.value) : null));

/** 필터 후보는 원본에서 뽑는다(좁힌 결과에서 뽑으면 되돌아올 수 없다). */
const allCategories = computed(() => data.value?.categories.map((c) => c.category) ?? []);

const funnelFirst = computed(() => view.value?.funnel[0]?.count ?? 0);

/** 코호트 표의 열 수 — 가장 오래된 코호트에 맞춘다. */
const retentionWeeks = computed(() =>
  Math.max(0, ...(view.value?.retention.map((r) => r.weekly.length) ?? [0])),
);

const SPARK_W = 560;
const SPARK_H = 48;

const spark = computed(() => sparklinePoints(view.value?.activity ?? [], SPARK_W, SPARK_H));
const marks = computed(() =>
  anomalyMarks(view.value?.activity ?? [], view.value?.anomalies ?? [], SPARK_W, SPARK_H),
);

const generatedAt = computed(() => {
  if (!view.value?.generated_at) return '';
  const d = new Date(view.value.generated_at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ko-KR');
});

async function refresh(): Promise<void> {
  refreshing.value = true;
  try {
    data.value = await api.refreshInsight();
  } catch {
    // 실패해도 화면에 있던 분석은 그대로 둔다 — 비우면 방금까지 보던 근거가 사라진다.
    await run();
  } finally {
    refreshing.value = false;
  }
}

/** 헤드라인에서 해당 화면으로 넘어간다. */
function openLink(link?: string): void {
  if (!link) return;
  void router.push(link === 'users' ? '/users' : `/${link}`);
}

onMounted(() => {
  void run();
});
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">분석</h1>
        <p class="page-sub">
          학습 데이터에서 지금 손봐야 할 것을 뽑아냅니다.
          <span v-if="generatedAt" class="muted">· {{ generatedAt }} 기준</span>
        </p>
      </div>
      <button class="btn btn-sm" type="button" :disabled="refreshing || loading" @click="refresh">
        <AppIcon name="refresh" :size="13" />
        {{ refreshing ? '계산 중…' : '다시 계산' }}
      </button>
    </header>

    <AsyncSection
      :loading="loading"
      :error="error"
      :empty="!view"
      :skeleton-rows="8"
      :on-retry="run"
    >
      <template v-if="view">
        <!-- 1. 이 분석을 믿어도 되는가 — 어떤 수치보다 먼저. -->
        <div
          class="callout"
          :class="view.coverage.trustworthy ? 'callout-info' : 'callout-warn'"
          role="note"
        >
          <AppIcon :name="view.coverage.trustworthy ? 'check' : 'alert'" :size="16" />
          <div>
            <strong>{{ view.coverage.verdict }}</strong>
            <div class="muted cov-line">
              학습자 {{ num(view.coverage.learners_with_data) }}/{{ num(view.coverage.users) }}명 ·
              데이터 있는 문제 {{ num(view.coverage.cards_with_data) }}/{{ num(view.coverage.cards) }}장 ·
              활동 {{ num(view.coverage.activity_days) }}일
            </div>
          </div>
        </div>

        <!-- 2. 지금 할 일 -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">지금 할 일</h2>
            <span class="panel-note">근거는 아래 표에 있습니다</span>
          </div>
          <div class="panel-body headlines">
            <article
              v-for="(h, i) in view.headlines"
              :key="i"
              class="headline"
              :class="[`sev-${h.severity}`, { clickable: !!h.link }]"
              :tabindex="h.link ? 0 : undefined"
              :role="h.link ? 'button' : undefined"
              @click="openLink(h.link)"
              @keydown.enter="openLink(h.link)"
              @keydown.space.prevent="openLink(h.link)"
            >
              <!-- 수치를 왼쪽 홈통에 크게 둔다. 훑을 때 눈이 한 줄만 따라가면 되고,
                   상자 없이도 항목이 갈린다. -->
              <div class="headline-metric num">{{ h.metric }}</div>
              <div class="headline-body">
                <h3 class="headline-title">
                  {{ h.title }}
                  <!-- 심각도는 배지가 아니라 제목 뒤의 작은 글자로 둔다.
                       배지를 네 줄 세우면 색만 남고 문장이 안 읽힌다. -->
                  <span class="headline-sev">{{ severityLabel(h.severity) }}</span>
                </h3>
                <p class="headline-detail">{{ h.detail }}</p>
              </div>
              <AppIcon v-if="h.link" name="search" :size="13" class="headline-go" />
            </article>
          </div>
        </section>

        <div class="grid-2">
          <!-- 3. 가입에서 습관까지 -->
          <section class="panel">
            <div class="panel-head">
              <h2 class="panel-title">가입 → 습관</h2>
              <span class="panel-note">어디서 새는가</span>
            </div>
            <div class="panel-body">
              <div v-for="s in view.funnel" :key="s.stage" class="funnel-row">
                <div class="funnel-label">
                  <span>{{ s.stage }}</span>
                  <span class="num">{{ num(s.count) }}명</span>
                </div>
                <div class="funnel-track">
                  <div class="funnel-bar" :style="{ width: `${funnelWidth(s.count, funnelFirst)}%` }" />
                </div>
                <div v-if="s.drop > 0" class="funnel-drop muted">
                  −{{ num(s.drop) }}명 이탈 · 통과 {{ pct(s.rate) }}
                </div>
              </div>
            </div>
          </section>

          <!-- 4. 활동 추세와 이상 -->
          <section class="panel">
            <div class="panel-head">
              <h2 class="panel-title">최근 30일 활동</h2>
              <span class="panel-note">평소와 다른 날은 표시됩니다</span>
            </div>
            <div class="panel-body">
              <svg
                class="spark"
                :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`"
                preserveAspectRatio="none"
                role="img"
                :aria-label="`최근 30일 일별 학습자 수. 이상 감지 ${view.anomalies.length}건`"
              >
                <polyline class="spark-line" :points="spark" />
                <circle
                  v-for="m in marks"
                  :key="m.day"
                  :cx="m.x"
                  :cy="m.y"
                  r="4"
                  :class="m.direction === 'drop' ? 'mark-drop' : 'mark-spike'"
                />
              </svg>
              <ul v-if="view.anomalies.length" class="anomaly-list">
                <li v-for="a in view.anomalies" :key="a.day">
                  <span class="badge" :class="a.direction === 'drop' ? 'badge-danger' : 'badge-accent'">
                    {{ a.direction === 'drop' ? '급락' : '급등' }}
                  </span>
                  {{ a.day }} · {{ num(a.users) }}명
                  <span class="muted">(평소 {{ num(Math.round(a.expected)) }}명)</span>
                </li>
              </ul>
              <p v-else class="muted">평소와 크게 다른 날은 없었습니다.</p>
            </div>
          </section>
        </div>

        <!-- 5. 조사 필터 -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">분야별 지식 격차</h2>
            <span class="panel-note">분야를 누르면 아래 표가 함께 좁혀집니다</span>
          </div>
          <div class="panel-body">
            <div class="chips">
              <button
                class="chip"
                :class="{ on: category === null }"
                type="button"
                @click="category = null"
              >
                전체
              </button>
              <button
                v-for="c in allCategories"
                :key="c"
                class="chip"
                :class="{ on: category === c }"
                type="button"
                @click="category = category === c ? null : c"
              >
                {{ c }}
              </button>
            </div>

            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>분야</th>
                    <th class="right">문제</th>
                    <th class="right">실패율</th>
                    <th class="right">평균 대비</th>
                    <th class="right">숙달률</th>
                    <th class="right">신고</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in view.categories" :key="c.category">
                    <td class="strong">{{ c.category }}</td>
                    <td class="right num">{{ num(c.cards) }}</td>
                    <td class="right num">{{ pct(c.lapse_rate) }}</td>
                    <td class="right num">
                      <span :class="c.ratio >= 1.3 ? 'over' : c.ratio > 0 && c.ratio <= 0.7 ? 'under' : ''">
                        {{ c.ratio ? `${c.ratio.toFixed(1)}배` : '—' }}
                      </span>
                    </td>
                    <td class="right num">{{ pct(c.mastery_rate) }}</td>
                    <td class="right num">{{ c.reports ? num(c.reports) : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- 6. 난이도 보정 -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">난이도가 실제와 어긋난 문제</h2>
            <span class="panel-note">학습자 5명 이상이 푼 문제만 판정합니다</span>
          </div>
          <div class="panel-body">
            <p class="hint">
              선언한 난이도와 실제 실패율이 크게 다르면, 초급자에게 어려운 문제가 먼저 나가거나
              그 반대가 됩니다. 표본이 모자란 문제는 아예 판정하지 않습니다.
            </p>
            <div v-if="view.calibration.length" class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>문제</th>
                    <th>분야</th>
                    <th>선언</th>
                    <th class="right">학습자</th>
                    <th class="right">실패율</th>
                    <th class="right">기대</th>
                    <th>판정</th>
                    <th>제안</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="c in view.calibration"
                    :key="c.card_id"
                    class="clickable"
                    tabindex="0"
                    @click="router.push(`/cards/${c.card_id}`)"
                    @keydown.enter="router.push(`/cards/${c.card_id}`)"
                  >
                    <td class="truncate strong">{{ c.title }}</td>
                    <td>{{ c.category }}</td>
                    <td class="num">{{ c.declared }}</td>
                    <td class="right num">{{ num(c.learners) }}</td>
                    <td class="right num">{{ pct(c.lapse_rate) }}</td>
                    <td class="right num muted">{{ pct(c.expected) }}</td>
                    <td>
                      <span class="badge" :class="c.verdict === 'harder' ? 'badge-danger' : 'badge-info'">
                        {{ calibrationLabel(c) }}
                      </span>
                    </td>
                    <td class="num strong">{{ c.suggested }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="empty">난이도가 어긋난 문제가 없습니다.</p>
          </div>
        </section>

        <div class="grid-2">
          <!-- 7. 이탈 위험 -->
          <section class="panel">
            <div class="panel-head">
              <h2 class="panel-title">되돌릴 가치가 큰 학습자</h2>
              <span class="panel-note">쌓아 둔 학습량이 많은 순</span>
            </div>
            <div class="panel-body">
              <div class="tiles">
                <StatTile label="활성" :value="num(view.churn.active)" />
                <StatTile label="식는 중" :value="num(view.churn.cooling)" tone="warn" />
                <StatTile label="이탈 위험" :value="num(view.churn.at_risk)" tone="warn" />
                <StatTile label="휴면" :value="num(view.churn.dormant)" tone="danger" />
              </div>
              <div v-if="view.churn.top.length" class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>학습자</th>
                      <th>소속</th>
                      <th class="right">학습</th>
                      <th class="right">경과</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="e in view.churn.top"
                      :key="e.user_id"
                      class="clickable"
                      tabindex="0"
                      @click="router.push(`/users/${e.user_id}`)"
                      @keydown.enter="router.push(`/users/${e.user_id}`)"
                    >
                      <td class="strong truncate">{{ e.name }}</td>
                      <td class="truncate muted">{{ e.org || '—' }}</td>
                      <td class="right num">{{ num(e.cards) }}장</td>
                      <td class="right num">{{ num(e.days_away) }}일</td>
                      <td>
                        <span class="badge" :class="churnBadge(e.tier)">{{ churnLabel(e.tier) }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="empty">멀어진 학습자가 없습니다.</p>
            </div>
          </section>

          <!-- 8. 조직별 도입 -->
          <section class="panel">
            <div class="panel-head">
              <h2 class="panel-title">조직별 도입</h2>
              <span class="panel-note">인원이 많은 곳부터</span>
            </div>
            <div class="panel-body">
              <div v-if="view.orgs.length" class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>조직</th>
                      <th class="right">인원</th>
                      <th class="right">도입률</th>
                      <th class="right">습관</th>
                      <th class="right">평균 학습</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="o in view.orgs" :key="o.org">
                      <td class="strong truncate">{{ o.org }}</td>
                      <td class="right num">{{ num(o.members) }}</td>
                      <td class="right num">
                        <span :class="o.adoption_rate < 0.5 ? 'over' : ''">{{ pct(o.adoption_rate) }}</span>
                      </td>
                      <td class="right num">{{ num(o.habitual) }}</td>
                      <td class="right num">{{ o.avg_cards ? `${o.avg_cards}장` : '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="empty">조직 정보가 없습니다.</p>
            </div>
          </section>
        </div>

        <!-- 9. 코호트 리텐션 -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">가입 주차별 잔존</h2>
            <span class="panel-note">0주차는 가입한 그 주입니다</span>
          </div>
          <div class="panel-body">
            <div v-if="view.retention.length" class="table-wrap">
              <table class="table heat">
                <thead>
                  <tr>
                    <th>가입 주</th>
                    <th class="right">인원</th>
                    <th v-for="w in retentionWeeks" :key="w" class="right">{{ w - 1 }}주</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in view.retention" :key="r.cohort">
                    <td class="num">{{ r.cohort }}</td>
                    <td class="right num">{{ num(r.size) }}</td>
                    <td
                      v-for="w in retentionWeeks"
                      :key="w"
                      class="right num heat-cell"
                      :style="
                        r.weekly[w - 1] !== undefined
                          ? { '--heat': heatIntensity(r.weekly[w - 1]!) }
                          : undefined
                      "
                    >
                      {{ r.weekly[w - 1] !== undefined ? pct(r.weekly[w - 1]!) : '' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="empty">코호트를 만들 만한 가입 기록이 없습니다.</p>
          </div>
        </section>

        <!-- 10. 도달하지 못한 콘텐츠 -->
        <section v-if="view.dead_content.length" class="panel">
          <div class="panel-head">
            <h2 class="panel-title">아무도 만나지 못한 문제</h2>
            <span class="panel-note">{{ num(view.dead_content.length) }}장</span>
          </div>
          <div class="panel-body">
            <p class="hint">만들어 두고 도달하지 않으면 없는 것과 같습니다.</p>
            <ul class="dead-list">
              <li
                v-for="c in view.dead_content"
                :key="c.card_id"
                class="clickable"
                tabindex="0"
                @click="router.push(`/cards/${c.card_id}`)"
                @keydown.enter="router.push(`/cards/${c.card_id}`)"
              >
                <span class="badge badge-neutral">{{ c.category }}</span>
                <span class="truncate">{{ c.title }}</span>
              </li>
            </ul>
          </div>
        </section>
      </template>
    </AsyncSection>
  </div>
</template>

<style scoped>
.cov-line {
  margin-top: 2px;
  font-size: 12px;
}

/* ── 헤드라인 ─────────────────────────────────────────────────────────────
   상자로 감싸지 않는다. 네 항목을 전부 테두리로 두르면 무엇이 급한지
   형태로는 알 수 없고, 화면은 카드 목록처럼 보인다. 구획은 실선 한 줄이
   하고, 위계는 왼쪽 수치의 크기가 만든다. */
.headlines {
  display: flex;
  flex-direction: column;
}

.headline {
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding: 13px 4px;
  border-bottom: 1px solid var(--line);
}

.headline:first-child {
  padding-top: 2px;
}

.headline:last-child {
  border-bottom: 0;
  padding-bottom: 2px;
}

.headline.clickable {
  cursor: pointer;
}

.headline.clickable:hover {
  background: var(--surface-2);
}

.headline.clickable:focus-visible {
  outline: none;
  box-shadow: var(--focus);
  border-radius: var(--r-1);
}

/* 수치를 왼쪽 홈통에 크게 두어, 훑을 때 눈이 한 줄만 따라가면 되게 한다. */
.headline-metric {
  flex: 0 0 84px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-align: right;
}

/* 색은 '지금 손대야 하는가'에만 쓴다. 급한 것 하나만 붉게 두면 그것이 보인다. */
.sev-critical .headline-metric {
  color: var(--danger);
}

.sev-warn .headline-metric {
  color: var(--warn);
}

.sev-good .headline-metric {
  color: var(--ok);
}

.sev-info .headline-metric {
  color: var(--ink-3);
}

.headline-body {
  flex: 1 1 auto;
  min-width: 0;
}

.headline-title {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.headline-sev {
  margin-left: 7px;
  font-size: 11px;
  font-weight: 400;
  color: var(--ink-4);
}

.headline-detail {
  margin: 3px 0 0;
  font-size: 12.5px;
  color: var(--ink-2);
  line-height: 1.55;
}

.headline-go {
  flex: 0 0 auto;
  color: var(--ink-4);
  align-self: center;
}

/* ── 퍼널 ────────────────────────────────────────────────────────────────── */
.funnel-row + .funnel-row {
  margin-top: 14px;
}

.funnel-label {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 5px;
}

.funnel-track {
  height: 10px;
  border-radius: 5px;
  background: var(--surface-3);
  overflow: hidden;
}

.funnel-bar {
  height: 100%;
  background: var(--accent);
  border-radius: 5px;
}

.funnel-drop {
  margin-top: 4px;
  font-size: 11.5px;
}

/* ── 스파크라인 ──────────────────────────────────────────────────────────── */
.spark {
  width: 100%;
  height: 56px;
  display: block;
  overflow: visible;
}

.spark-line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.mark-drop {
  fill: var(--danger);
}

.mark-spike {
  fill: var(--accent);
}

.anomaly-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
}

/* ── 표 ──────────────────────────────────────────────────────────────────── */
.clickable {
  cursor: pointer;
}

tr.clickable:hover {
  background: var(--surface-2);
}

/* 평균보다 나쁜 값에만 색을 준다 — 정상까지 칠하면 나쁜 값이 안 보인다. */
.over {
  color: var(--danger);
  font-weight: 600;
}

.under {
  color: var(--ink-3);
}

/* ── 리텐션 히트맵 ───────────────────────────────────────────────────────── */
.heat-cell {
  /* --heat 는 0~1. 값이 없는(아직 오지 않은) 주는 배경을 칠하지 않아
     '0% 로 이탈'과 '아직 모름'이 구분된다. */
  background: color-mix(in srgb, var(--accent) calc(var(--heat, 0) * 55%), transparent);
}

/* ── 도달 못한 콘텐츠 ────────────────────────────────────────────────────── */
.dead-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 260px;
  overflow-y: auto;
}

.dead-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  font-size: 13px;
}

.dead-list li:hover {
  background: var(--surface-2);
}

.tiles {
  display: flex;
  gap: 0;
  margin-bottom: 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  overflow: hidden;
}

@media (max-width: 720px) {
  .headline {
    flex-wrap: wrap;
  }

  .headline-metric {
    min-width: 0;
    text-align: left;
  }
}
</style>
