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
import PeerCompare, { type PeerRow } from '../components/charts/PeerCompare.vue';
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
import { barWidth, niceMax } from '../lib/chart';

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

/**
 * 파고드는 자료를 펼쳤는가.
 *
 * 기본은 접힘이다. 인사팀이 매일 쓰는 것은 '지금 할 일 → 분야 → 문제 → 사람'까지고,
 * 가입 이탈 구간이나 주별 잔존은 원인을 캘 때 필요한 것이다. 늘 펼쳐 두면 화면이
 * 길어져 정작 위쪽 할 일까지 안 읽힌다. 지우지는 않는다 — 내용을 줄이는 것과
 * 순서를 정하는 것은 다른 일이다.
 */
const showDetail = ref(false);

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

/**
 * 분야별 실패율 막대.
 *
 * 표만 두면 '어느 분야가 문제인가'를 알려고 여섯 개 숫자를 눈으로 정렬해야 한다.
 * 막대로 그리면 순서가 형태로 보인다. 축은 깔끔한 수에서 끊어 1등 막대가 늘
 * 끝까지 닿는 착시를 막는다.
 *
 * 색을 값에 따라 진하게 바꾸지 않는다 — 그러면 막대 길이가 이미 말한 것을
 * 색으로 한 번 더 말하는 셈이고, 정작 '평균보다 나쁨'을 표시할 채널이 사라진다.
 */
const categoryBars = computed(() => {
  const rows = view.value?.categories ?? [];
  const max = niceMax(rows.map((c) => c.lapse_rate * 100));
  return rows.map((c) => ({
    ...c,
    width: barWidth(c.lapse_rate * 100, max),
    // ratio 는 전체 평균 대비 배수. 1.3배 이상이면 손볼 분야다(표와 같은 기준).
    over: c.ratio >= 1.3,
    axisMax: max,
  }));
});

const categoryAxisMax = computed(() => categoryBars.value[0]?.axisMax ?? 1);

/**
 * 난이도 보정 — 선언한 난이도가 기대하는 실패율 vs 실제 실패율.
 *
 * 표에 '기대 12% / 실제 80%' 를 나란히 적어 두면 읽는 사람이 매번 빼야 한다.
 * 학습자 진단에서 쓰는 것과 **같은 아령형**을 재사용한다 — 두 화면이 같은
 * 질문("기준과 얼마나 떨어져 있나")에 답하는데 다른 그림을 쓰면 매번 새로 읽어야 한다.
 */
const calibrationRows = computed<PeerRow[]>(() =>
  (view.value?.calibration ?? []).slice(0, 6).map((c) => ({
    label: c.title,
    self: c.lapse_rate,
    peer: c.expected,
    higherIsWorse: true,
  })),
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
        <h1 class="page-title">교육 현황 분석</h1>
        <p class="page-sub">
          학습 기록에서 지금 손봐야 할 것을 찾아 줍니다. 위에서부터 순서대로 보시면 됩니다.
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
              학습 기록이 있는 직원 {{ num(view.coverage.learners_with_data) }}/{{ num(view.coverage.users) }}명 ·
              풀린 적 있는 문제 {{ num(view.coverage.cards_with_data) }}/{{ num(view.coverage.cards) }}장 ·
              활동 {{ num(view.coverage.activity_days) }}일
            </div>
          </div>
        </div>

        <!-- 2. 지금 할 일 -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">지금 할 일</h2>
            <span class="panel-note">급한 것부터 · 자세한 근거는 아래에 있습니다</span>
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

        <!-- 5. 조사 필터 -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">어느 분야를 다들 어려워하나</h2>
            <span class="panel-note">분야를 누르면 아래 내용이 그 분야로 좁혀집니다</span>
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

            <!-- 막대가 먼저, 표가 뒤. 표는 정확한 값과 색 없이 읽는 경로로 남는다. -->
            <div class="cbars">
              <div v-for="c in categoryBars" :key="c.category" class="cbar-row">
                <span class="cbar-label truncate">{{ c.category }}</span>
                <span class="cbar-track">
                  <i
                    class="cbar"
                    :class="{ over: c.over }"
                    :style="{ width: `${c.width}%` }"
                    :title="`${c.category} · 틀린 비율 ${pct(c.lapse_rate)} · 문제 ${num(c.cards)}장`"
                  />
                </span>
                <span class="cbar-value num" :class="{ bad: c.over }">{{ pct(c.lapse_rate) }}</span>
              </div>
              <p class="cbar-foot">
                눈금 끝은 {{ Math.round(categoryAxisMax) }}%입니다.
                진한 막대는 전체 평균보다 1.3배 넘게 틀리는 분야 — 여기부터 손보면 됩니다.
              </p>
            </div>

            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>분야</th>
                    <th class="right">문제</th>
                    <th class="right">틀린 비율</th>
                    <th class="right">평균의 몇 배</th>
                    <th class="right">익힌 비율</th>
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
            <h2 class="panel-title">난이도 표기가 실제와 다른 문제</h2>
            <span class="panel-note">5명 이상이 푼 문제만 판단합니다</span>
          </div>
          <div class="panel-body">
            <p class="hint">
              "쉬움"이라고 표기했는데 실제로는 다들 틀리는 문제가 있으면, 이제 막 시작한 직원에게
              어려운 문제가 먼저 나갑니다. 기록이 모자란 문제는 아예 판단하지 않습니다.
            </p>
            <div v-if="calibrationRows.length" class="calib">
              <PeerCompare
                :rows="calibrationRows"
                self-label="실제로 틀린 비율"
                peer-label="난이도 표기상 예상"
                label-width="minmax(0, 200px)"
              />
              <p class="cbar-foot">
                <!-- 색 이름으로 설명하지 않는다 — 다크 모드에서 '검은 점'은 흰 점이 된다.
                     계열을 가리키는 일은 범례가 한다. -->
                점 사이가 멀수록 표기가 크게 어긋난 문제입니다. 5명 미만이 푼 문제는
                판단하지 않습니다.
              </p>
            </div>

            <div v-if="view.calibration.length" class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>문제</th>
                    <th>분야</th>
                    <th>표기</th>
                    <th class="right">푼 사람</th>
                    <th class="right">틀린 비율</th>
                    <th class="right">예상</th>
                    <th>판단</th>
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

        <!-- 7. 이탈 위험 -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">곧 그만둘 것 같은 직원</h2>
            <span class="panel-note">지금까지 많이 배운 사람부터 — 되돌릴 값어치가 큽니다</span>
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
                    <th>직원</th>
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
            <p v-else class="empty">그만둘 것 같은 직원이 없습니다.</p>
          </div>
        </section>

        <!-- 10. 도달하지 못한 콘텐츠 -->
        <section v-if="view.dead_content.length" class="panel">
          <div class="panel-head">
            <h2 class="panel-title">아무도 풀지 않은 문제</h2>
            <span class="panel-note">{{ num(view.dead_content.length) }}장</span>
          </div>
          <div class="panel-body">
            <p class="hint">만들어 두고 아무도 안 보면 없는 것과 같습니다.</p>
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

        <!-- ── 여기부터는 자세히 보고 싶을 때 ───────────────────────────
             인사팀이 매일 쓰는 것은 위까지다. 아래 넷은 '왜 그런가'를 파고들 때
             필요한 것들인데, 늘 펼쳐 두면 화면이 길어져 위쪽 할 일까지 안 읽힌다.
             숨기지는 않는다 — 내용을 줄이는 것과 순서를 정하는 것은 다르다. -->
        <button
          class="more"
          type="button"
          :aria-expanded="showDetail"
          @click="showDetail = !showDetail"
        >
          <AppIcon :name="showDetail ? 'chevron-up' : 'chevron-down'" :size="13" />
          자세히 보기 — 가입 후 이탈 구간 · 최근 30일 활동 · 부서별 · 가입 주별 잔존
        </button>

        <template v-if="showDetail">
        <div class="grid-2">
          <!-- 3. 가입에서 습관까지 -->
          <section class="panel">
            <div class="panel-head">
              <h2 class="panel-title">가입하고 나서 어디서 그만두나</h2>
              <span class="panel-note">막대가 크게 줄어드는 칸이 문제 구간입니다</span>
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
              <span class="panel-note">평소와 유난히 다른 날에 점이 찍힙니다</span>
            </div>
            <div class="panel-body">
              <svg
                class="spark"
                :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`"
                preserveAspectRatio="none"
                role="img"
                :aria-label="`최근 30일 하루별 학습한 직원 수. 평소와 다른 날 ${view.anomalies.length}건`"
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


        <!-- 8. 조직별 도입 -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">부서별 참여 현황</h2>
            <span class="panel-note">인원이 많은 곳부터</span>
          </div>
          <div class="panel-body">
            <div v-if="view.orgs.length" class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>조직</th>
                    <th class="right">인원</th>
                    <th class="right">시작한 비율</th>
                    <th class="right">꾸준한 사람</th>
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

        <!-- 9. 코호트 리텐션 -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">가입 주별로 얼마나 남았나</h2>
            <span class="panel-note">가로는 가입 후 몇 주째인지 · 진할수록 많이 남아 있습니다</span>
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
            <p v-else class="empty">주 단위로 나눌 만큼 가입 기록이 쌓이지 않았습니다.</p>
          </div>
        </section>
        </template>

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

/* ── 자세히 보기 ─────────────────────────────────────────────────────────
   판(panel)이 아니라 줄 하나로 둔다. 상자로 만들면 위 판들과 같은 무게로 보이고,
   그러면 '접혀 있다'가 아니라 '빈 판이다'로 읽힌다. */
.more {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 11px 2px;
  margin-top: 4px;
  border: 0;
  border-top: 1px solid var(--line-strong);
  background: transparent;
  color: var(--ink-3);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
}

.more:hover {
  color: var(--ink);
}

.more:focus-visible {
  outline: none;
  box-shadow: var(--focus);
  border-radius: var(--r-1);
}

/* ── 분야별 실패율 막대 ──────────────────────────────────────────────────── */
.cbars {
  margin-bottom: 16px;
}

.cbar-row {
  display: grid;
  grid-template-columns: 96px 1fr 54px;
  align-items: center;
  gap: 12px;
  padding: 3px 0;
}

.cbar-label {
  font-size: 12px;
  color: var(--ink-2);
}

.cbar-track {
  position: relative;
  height: 14px;
  background: var(--viz-track);
  border-radius: 3px;
}

.cbar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 3px;
  background: var(--viz-peer);
}

/* 평균보다 많이 틀리는 분야에만 색을 준다 — 전부 칠하면 순위만 남고 뜻이 사라진다. */
.cbar.over {
  background: var(--viz-worse);
}

.cbar-value {
  font-size: 12px;
  font-weight: 600;
  text-align: right;
  color: var(--ink-2);
}

.cbar-value.bad {
  color: var(--viz-worse);
}

.cbar-foot {
  margin: 9px 0 0;
  font-size: 11px;
  color: var(--ink-4);
  line-height: 1.5;
}

.calib {
  margin-bottom: 16px;
}

@media (max-width: 640px) {
  .cbar-row {
    grid-template-columns: 72px 1fr 44px;
    gap: 8px;
  }
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
