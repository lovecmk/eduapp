<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { api } from '../api/client';
import type { Dashboard } from '../api/types';
import { useAsync } from '../composables/useAsync';
import { useLiveMetrics } from '../composables/useLiveMetrics';
import { useNow } from '../composables/useNow';
import { adoptDashboard } from '../stores/alerts';
import { num, pct, ms, uptime, timeAgo, statusTone } from '../lib/format';
import StatTile from '../components/StatTile.vue';
import TrafficChart from '../components/TrafficChart.vue';
import AsyncSection from '../components/AsyncSection.vue';
import AppIcon from '../components/AppIcon.vue';

/**
 * 대시보드 — "지금 서비스가 어떤가"에 한 화면으로 답한다.
 *
 * 데이터를 두 갈래로 받는 이유:
 *  · 집계(사용자 수·콘텐츠 분포)는 매초 바뀌지 않는다 → 한 번만 dashboard()
 *  · 트래픽·지연·활성 사용자는 실시간이어야 한다 → SSE 스트림
 * 둘을 합쳐 2초마다 전부 다시 계산하면 DB 를 헛되이 두드린다.
 */
/*
 * 받아 온 응답을 상단 바의 알림 저장소에도 넘긴다(adopt).
 * 상단 바는 신고 건수·저장소 상태를 상시 표시하느라 같은 응답을 2분마다 받아 오는데,
 * 이 화면에 있는 동안에는 방금 받은 것을 넘겨주면 그 요청이 통째로 필요 없어진다.
 */
const dash = useAsync<Dashboard>(async () => {
  const d = await api.dashboard();
  adoptDashboard(d);
  return d;
});
const { snapshot } = useLiveMetrics();
const now = useNow();

onMounted(() => void dash.run());

/** 스트림이 붙기 전에는 최초 집계에 실려 온 지표를 쓴다(빈 화면 방지). */
const m = computed(() => snapshot.value ?? dash.data.value?.metrics ?? null);
const users = computed(() => dash.data.value?.users ?? null);
const content = computed(() => dash.data.value?.content ?? null);
const learning = computed(() => dash.data.value?.learning ?? null);
const service = computed(() => dash.data.value?.service ?? null);
/** 접수된 신고 건수 — 0이면 줄 자체를 감춘다. */
const reportCount = computed(() => dash.data.value?.content.reports ?? 0);

/** 지표에 색을 입히는 건 '주의가 필요할 때'뿐이다. */
const errorTone = computed(() => {
  const r = m.value?.error_rate ?? 0;
  return r >= 5 ? 'danger' : r >= 1 ? 'warn' : 'default';
});
const latencyTone = computed(() => {
  const p = m.value?.p95_latency_ms ?? 0;
  return p >= 1000 ? 'danger' : p >= 300 ? 'warn' : 'default';
});

/*
 * 타일 옆 추세선에 쓸 계열.
 *
 * 스트림이 주는 traffic 은 '분당 요청 수'와 '그 분의 오류 수'다. 여기서 정직하게
 * 뽑을 수 있는 추세는 두 가지뿐이라, 그 두 타일에만 선을 단다.
 *
 * '지금 활동 중'·'응답 p95'·'가동'에는 달지 않는다. 시계열이 없기 때문이다.
 * 자리가 비어 보인다는 이유로 아무 계열이나 그려 넣으면, 그 선이 무엇을 뜻하는지
 * 아무도 설명할 수 없는 장식이 된다 — 관리 도구에서 가장 하지 말아야 할 일이다.
 */
const requestTrend = computed(() => (m.value?.traffic ?? []).map((p) => p.requests));
const errorTrend = computed(() =>
  // 분당 오류율(%). 요청이 없던 분은 0 으로 둔다 — 0/0 을 100% 로 그리면 안 된다.
  (m.value?.traffic ?? []).map((p) => (p.requests > 0 ? (p.errors / p.requests) * 100 : 0)),
);

/** 학습 진행 막대의 비율(0 나눗셈 방지). */
const learnTotal = computed(() => {
  const l = learning.value;
  return l ? l.new + l.learning + l.mastered : 0;
});
function share(v: number): string {
  return learnTotal.value === 0 ? '0%' : `${(v / learnTotal.value) * 100}%`;
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">대시보드</h1>
        <p class="page-sub">사용자 · 학습 콘텐츠 · 서비스 상태를 한눈에 봅니다</p>
      </div>
      <!-- 실시간 연결 표시등은 상단 바로 옮겼다. 화면마다 두면 같은 사실을
           두 곳에서 말하게 되고, 둘의 표시가 어긋나는 순간 둘 다 못 믿게 된다. -->
      <div class="row">
        <button
          class="btn btn-sm"
          type="button"
          :disabled="dash.loading.value"
          @click="() => void dash.run()"
        >
          <AppIcon name="refresh" :size="13" />
          새로고침
        </button>
      </div>
    </header>

    <AsyncSection
      :loading="dash.loading.value"
      :error="dash.error.value"
      :empty="!dash.data.value"
      :skeleton-rows="6"
      :on-retry="() => void dash.run()"
    >
      <!-- 실시간 지표: 상자 다섯 개가 아니라 하나의 띠 -->
      <section class="panel tiles">
        <StatTile
          label="지금 활동 중"
          :value="num(m?.active_users)"
          sub="최근 5분 내 요청"
          tone="accent"
        />
        <StatTile
          label="분당 요청"
          :value="num(m?.requests_per_min)"
          :sub="`누적 ${num(m?.total_requests)}`"
          :trend="requestTrend"
        />
        <StatTile
          label="오류율"
          :value="pct(m?.error_rate)"
          :sub="`5xx ${num(m?.total_errors)} · 4xx ${num(m?.total_rejected)}`"
          :tone="errorTone"
          :trend="errorTrend"
        />
        <StatTile
          label="응답 p95"
          :value="ms(m?.p95_latency_ms)"
          :sub="`평균 ${ms(m?.avg_latency_ms)}`"
          :tone="latencyTone"
        />
        <StatTile
          label="가동"
          :value="uptime(m?.uptime_seconds)"
          :sub="service ? `저장소 ${service.store}` : ''"
          :tone="service && !service.store_healthy ? 'danger' : 'default'"
        />
      </section>

      <!-- 신고는 '숫자'가 아니라 '처리할 일'이다.
           타일 하나로 세어 두면 지나치기 쉬우므로, 눌러서 바로 갈 수 있는 줄로 만든다.
           건수가 0이면 아무것도 표시하지 않는다 — 할 일이 없을 때의 빈 줄은 소음이다. -->
      <RouterLink v-if="reportCount > 0" to="/reports" class="callout callout-warn alert-row action-row">
        <AppIcon name="flag" :size="15" />
        <span>처리되지 않은 신고가 {{ num(reportCount) }}건 있습니다.</span>
        <span class="action-go">확인하기</span>
      </RouterLink>

      <!-- 저장소가 죽었을 때만 나타나는 경고 -->
      <div v-if="service && !service.store_healthy" class="callout callout-danger alert-row">
        <AppIcon name="alert" :size="15" />
        <span>저장소({{ service.store }})에 연결할 수 없습니다. 서비스 상태에서 확인하세요.</span>
        <RouterLink to="/service" class="alert-link">진단 →</RouterLink>
      </div>

      <section class="panel block">
        <div class="panel-head">
          <h2 class="panel-title">요청량</h2>
          <span class="panel-note">최근 1시간 · 분 단위</span>
        </div>
        <div class="panel-body">
          <TrafficChart :points="m?.traffic ?? []" />
        </div>
      </section>

      <div class="grid grid-2 block">
        <!-- 사용자 -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">사용자</h2>
            <RouterLink to="/users" class="link-more">전체 보기</RouterLink>
          </div>
          <dl class="kv">
            <div><dt>전체</dt><dd class="num">{{ num(users?.total) }}</dd></div>
            <div><dt>오늘 가입</dt><dd class="num">{{ num(users?.new_today) }}</dd></div>
            <div><dt>최근 7일</dt><dd class="num">{{ num(users?.new_7days) }}</dd></div>
            <div><dt>관리자</dt><dd class="num">{{ num(users?.admins) }}</dd></div>
            <div>
              <dt>정지 계정</dt>
              <dd class="num" :class="{ warn: (users?.suspended ?? 0) > 0 }">
                {{ num(users?.suspended) }}
              </dd>
            </div>
          </dl>
        </section>

        <!-- 학습 진행 -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">학습 진행</h2>
            <!-- 분모를 밝힌다. '완료 126'만 있으면 무엇 중 126인지 알 수 없다. -->
            <span class="panel-note">직원 × 문제 조합 · 완료율 {{ pct(learning?.rate) }}</span>
          </div>
          <div class="panel-body">
            <div
              class="stack"
              role="img"
              :aria-label="`직원 × 문제 조합 ${learnTotal}칸 중 완료 ${learning?.mastered ?? 0}, 학습 중 ${learning?.learning ?? 0}, 미시작 ${learning?.new ?? 0}`"
            >
              <span class="seg s-done" :style="{ width: share(learning?.mastered ?? 0) }" />
              <span class="seg s-doing" :style="{ width: share(learning?.learning ?? 0) }" />
              <span class="seg s-todo" :style="{ width: share(learning?.new ?? 0) }" />
            </div>
            <ul class="legend">
              <li>
                <span class="sw s-done" /><span>완료</span>
                <b class="num">{{ num(learning?.mastered) }}</b>
              </li>
              <li>
                <span class="sw s-doing" /><span>학습 중</span>
                <b class="num">{{ num(learning?.learning) }}</b>
              </li>
              <li>
                <span class="sw s-todo" /><span>미시작</span>
                <b class="num">{{ num(learning?.new) }}</b>
              </li>
            </ul>
          </div>
        </section>

        <!-- 콘텐츠 분포 -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">문제 {{ num(content?.total_cards) }}장</h2>
            <RouterLink to="/cards" class="link-more">관리</RouterLink>
          </div>
          <div class="panel-body">
            <div v-if="!content?.by_category?.length" class="empty">등록된 문제가 없습니다</div>
            <ul v-else class="dist">
              <li v-for="c in content.by_category" :key="c.code">
                <span class="dist-name">{{ c.label }}</span>
                <span class="dist-track">
                  <span
                    class="dist-fill"
                    :style="{ width: `${(c.count / (content!.total_cards || 1)) * 100}%` }"
                  />
                </span>
                <span class="dist-n num">{{ num(c.count) }}</span>
              </li>
            </ul>
            <div v-if="content?.by_type?.length" class="chips">
              <span v-for="t in content.by_type" :key="t.label" class="badge badge-neutral">
                {{ t.label }} {{ num(t.count) }}
              </span>
              <span v-for="d in content?.by_difficulty ?? []" :key="d.label" class="badge badge-neutral">
                {{ d.label }} {{ num(d.count) }}
              </span>
            </div>
          </div>
        </section>

        <!-- 점검 대상 문제 -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">점검이 필요한 문제</h2>
            <span class="panel-note">푼 사람은 있는데 완료 0건</span>
          </div>
          <div v-if="!content?.untouched?.length" class="empty">
            모든 문제에서 완료자가 나왔습니다
          </div>
          <ul v-else class="checklist">
            <li v-for="c in content.untouched" :key="c.id">
              <RouterLink :to="`/cards/${c.id}/edit`" class="check-title truncate">
                {{ c.title || '(제목 없음)' }}
              </RouterLink>
              <span class="badge badge-neutral">{{ c.category }}</span>
              <span class="check-n num">{{ num(c.learning) }}명 시도</span>
            </li>
          </ul>
        </section>
      </div>

      <!-- 실시간 요청 -->
      <section class="panel block">
        <div class="panel-head">
          <h2 class="panel-title">실시간 요청</h2>
          <RouterLink to="/service" class="link-more">서비스 상태</RouterLink>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 78px">시각</th>
                <th style="width: 62px">메서드</th>
                <th>경로</th>
                <th style="width: 62px">상태</th>
                <th class="right" style="width: 78px">소요</th>
                <th style="width: 130px">사용자</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!m?.recent?.length">
                <td colspan="6" class="empty">아직 요청이 없습니다</td>
              </tr>
              <tr v-for="(e, i) in m?.recent ?? []" :key="`${e.at}-${i}`">
                <td class="num muted">{{ timeAgo(e.at, now) }}</td>
                <td class="num">{{ e.method }}</td>
                <td class="truncate num">{{ e.path }}</td>
                <td>
                  <span class="badge" :class="`badge-${statusTone(e.status)}`">{{ e.status }}</span>
                </td>
                <td class="right num" :class="{ slow: e.slow }">{{ ms(e.duration_ms) }}</td>
                <td class="num muted truncate">{{ e.user_id || '비로그인' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </AsyncSection>
  </div>
</template>

<style scoped>
/* 조치가 가능한 알림 줄 — 누를 수 있다는 것이 보여야 한다. */
.action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  cursor: pointer;
}
.action-row:hover {
  text-decoration: none;
  filter: brightness(0.98);
}
.action-go {
  margin-left: auto;
  font-weight: 600;
  white-space: nowrap;
}

.block {
  margin-top: 12px;
}

/*
 * 지표 타일 띠.
 *
 * 칸 사이 구분선을 border 로 긋지 않는다. 칸이 줄바꿈되면 세로선이 엉뚱한 자리에
 * 남아 어긋나고, 그때마다 미디어쿼리로 방향을 바꿔 주는 땜질이 필요해진다.
 * 대신 격자 배경 위에 1px 간격을 두고 타일을 얹는다 — 가로·세로 어느 쪽으로
 * 접히든 구분선이 정확히 칸 사이에만 생긴다.
 */
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1px;
  background: var(--line);
  overflow: hidden;
}
.tiles > :deep(.tile) {
  background: var(--surface);
}

.alert-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.alert-link {
  margin-left: auto;
  color: inherit;
  font-weight: 600;
  white-space: nowrap;
}

.link-more {
  font-size: 11.5px;
  font-weight: 500;
}

/* 이름-값 목록 — 표를 쓸 만큼 항목이 많지 않을 때. */
.kv {
  margin: 0;
  padding: 4px 0;
}
.kv > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 30px;
  padding: 0 14px;
}
.kv > div + div {
  border-top: 1px solid var(--line);
}
.kv dt {
  color: var(--ink-2);
  font-size: 12.5px;
}
.kv dd {
  margin: 0;
  font-weight: 600;
}
.warn {
  color: var(--warn);
}

/* 누적 막대 */
/* 진행 막대 — 조각 사이를 **배경색 틈**으로 가른다.
   테두리를 두르면 데이터가 아닌 잉크가 늘고, 붙여 두면 어디서 끊기는지 안 보인다. */
.stack {
  display: flex;
  gap: 2px;
  height: 8px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--surface-3);
}

.seg {
  min-width: 0;
}

/* 미시작 → 학습 중 → 완료는 순서가 있는 단계다. 초록·파랑처럼 다른 색을 쓰면
   별개의 것으로 읽히지만 실제로는 같은 축 위의 앞뒤이므로, 한 색상의 밝기 단계로 그린다.
   (초록·빨강 조합을 피하는 이유는 base.css 의 차트 토큰 주석에 있다.) */
.s-done {
  background: var(--viz-step-2);
}
.s-doing {
  background: var(--viz-step-1);
}
/* 미시작은 '아직 아무 일도 없음'이다. 색상 단계를 주면 진행의 일부로 읽힌다.
   트랙과 같은 색은 쓰지 않는다 — 범례의 색 조각이 보이지 않게 된다. */
.s-todo {
  background: var(--viz-peer);
}

.legend {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.legend li {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--ink-2);
}
.legend b {
  margin-left: auto;
  color: var(--ink);
  font-weight: 600;
}
.sw {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}

/* 분야별 분포 */
.dist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.dist li {
  display: grid;
  grid-template-columns: 78px 1fr 38px;
  align-items: center;
  gap: 9px;
  font-size: 12px;
}
.dist-name {
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dist-track {
  height: 5px;
  border-radius: 99px;
  background: var(--surface-3);
  overflow: hidden;
}
.dist-fill {
  display: block;
  height: 100%;
  background: var(--n-400);
  border-radius: 99px;
}
.dist-n {
  text-align: right;
  color: var(--ink-2);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 13px;
  padding-top: 11px;
  border-top: 1px solid var(--line);
}

/* 점검 목록 */
.checklist {
  list-style: none;
  margin: 0;
  padding: 0;
}
.checklist li {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 14px;
  font-size: 12.5px;
}
.checklist li + li {
  border-top: 1px solid var(--line);
}
.check-title {
  flex: 1;
  min-width: 0;
  font-weight: 500;
}
.check-n {
  color: var(--warn);
  font-size: 11.5px;
  flex-shrink: 0;
}

.slow {
  color: var(--danger);
  font-weight: 600;
}
</style>
