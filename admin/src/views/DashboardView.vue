<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { api } from '../api/client';
import type { Dashboard } from '../api/types';
import { useAsync } from '../composables/useAsync';
import { useLiveMetrics } from '../composables/useLiveMetrics';
import { num, pct, ms, uptime, timeAgo, statusTone } from '../lib/format';
import StatTile from '../components/StatTile.vue';
import TrafficChart from '../components/TrafficChart.vue';
import AsyncSection from '../components/AsyncSection.vue';

/**
 * 대시보드 — "지금 서비스가 어떤가"를 한 화면에서 본다.
 *
 * 데이터가 두 갈래인 이유:
 *  · 집계(사용자 수·콘텐츠 분포)는 한 번 불러오면 되고 매초 바뀌지 않는다 → dashboard()
 *  · 트래픽·지연·활성 사용자는 실시간이어야 한다 → SSE 스트림
 * 둘을 하나로 합쳐 2초마다 전부 다시 계산하면 DB 를 헛되이 두드리게 된다.
 */
const dash = useAsync<Dashboard>(() => api.dashboard());
const { snapshot, live, lastUpdate } = useLiveMetrics();

onMounted(() => void dash.run());

/** 스트림이 붙기 전에는 최초 집계에 실려 온 지표를 쓴다(빈 화면 방지). */
const metrics = computed(() => snapshot.value ?? dash.data.value?.metrics ?? null);

const users = computed(() => dash.data.value?.users ?? null);
const content = computed(() => dash.data.value?.content ?? null);
const learning = computed(() => dash.data.value?.learning ?? null);
const service = computed(() => dash.data.value?.service ?? null);

/** 에러율이 위험 수준이면 색으로 알린다 — 숫자만으로는 눈에 안 들어온다. */
const errorTone = computed(() => {
  const rate = metrics.value?.error_rate ?? 0;
  if (rate >= 5) return 'red';
  if (rate >= 1) return 'amber';
  return 'green';
});

const latencyTone = computed(() => {
  const p95 = metrics.value?.p95_latency_ms ?? 0;
  if (p95 >= 1000) return 'red';
  if (p95 >= 300) return 'amber';
  return 'green';
});
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">대시보드</h1>
        <p class="page-sub">사용자 · 학습 콘텐츠 · 실시간 서비스 상태를 한눈에 봅니다</p>
      </div>
      <div class="live">
        <span class="dot" :class="live ? 'dot-live' : 'dot-dead'" aria-hidden="true" />
        <span>{{ live ? '실시간 연결됨' : '연결 끊김 — 재연결 중' }}</span>
        <span v-if="lastUpdate" class="live-time num">{{ timeAgo(lastUpdate.toISOString()) }}</span>
      </div>
    </div>

    <AsyncSection
      :loading="dash.loading.value"
      :error="dash.error.value"
      :empty="!dash.data.value"
      :on-retry="() => void dash.run()"
    >
      <!-- 실시간 지표 -->
      <section class="grid grid-stats sec">
        <StatTile
          label="지금 활동 중"
          :value="num(metrics?.active_users)"
          hint="최근 5분 내 요청한 사용자"
          tone="blue"
        />
        <StatTile
          label="분당 요청"
          :value="num(metrics?.requests_per_min)"
          :hint="`누적 ${num(metrics?.total_requests)}건`"
        />
        <StatTile
          label="오류율"
          :value="pct(metrics?.error_rate)"
          :hint="`5xx ${num(metrics?.total_errors)}건 · 4xx ${num(metrics?.total_rejected)}건`"
          :tone="errorTone"
        />
        <StatTile
          label="응답 p95"
          :value="ms(metrics?.p95_latency_ms)"
          :hint="`평균 ${ms(metrics?.avg_latency_ms)}`"
          :tone="latencyTone"
        />
        <StatTile
          label="가동 시간"
          :value="uptime(metrics?.uptime_seconds)"
          :hint="service ? `저장소 ${service.store}` : ''"
          :tone="service?.store_healthy === false ? 'red' : 'gray'"
        />
      </section>

      <!-- 트래픽 그래프 -->
      <section class="card sec">
        <div class="card-head">
          <h2 class="card-title">최근 1시간 요청량</h2>
          <span class="legend">
            <i class="sw sw-blue" aria-hidden="true" />정상
            <i class="sw sw-red" aria-hidden="true" />오류 발생
          </span>
        </div>
        <div class="card-body">
          <TrafficChart :points="metrics?.traffic ?? []" />
        </div>
      </section>

      <div class="grid grid-2 sec">
        <!-- 사용자 -->
        <section class="card">
          <div class="card-head">
            <h2 class="card-title">사용자</h2>
            <RouterLink to="/users" class="more">전체 보기 →</RouterLink>
          </div>
          <div class="card-body">
            <dl class="kv">
              <div><dt>전체</dt><dd class="num">{{ num(users?.total) }}명</dd></div>
              <div><dt>오늘 가입</dt><dd class="num">{{ num(users?.new_today) }}명</dd></div>
              <div><dt>최근 7일 가입</dt><dd class="num">{{ num(users?.new_7days) }}명</dd></div>
              <div><dt>관리자</dt><dd class="num">{{ num(users?.admins) }}명</dd></div>
              <div>
                <dt>정지 계정</dt>
                <dd class="num" :class="{ warn: (users?.suspended ?? 0) > 0 }">
                  {{ num(users?.suspended) }}명
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <!-- 학습 진행 -->
        <section class="card">
          <div class="card-head">
            <h2 class="card-title">전체 학습 진행</h2>
            <span class="badge badge-green">완료율 {{ pct(learning?.rate) }}</span>
          </div>
          <div class="card-body">
            <div class="bar" role="img" :aria-label="`완료 ${learning?.mastered ?? 0}건, 학습 중 ${learning?.learning ?? 0}건, 미시작 ${learning?.new ?? 0}건`">
              <span class="seg seg-done" :style="{ flexGrow: learning?.mastered || 0 }" />
              <span class="seg seg-doing" :style="{ flexGrow: learning?.learning || 0 }" />
              <span class="seg seg-todo" :style="{ flexGrow: learning?.new || 0 }" />
            </div>
            <dl class="kv kv-tight">
              <div><dt><i class="sw sw-green" />완료</dt><dd class="num">{{ num(learning?.mastered) }}</dd></div>
              <div><dt><i class="sw sw-blue" />학습 중</dt><dd class="num">{{ num(learning?.learning) }}</dd></div>
              <div><dt><i class="sw sw-gray" />미시작</dt><dd class="num">{{ num(learning?.new) }}</dd></div>
            </dl>
          </div>
        </section>

        <!-- 콘텐츠 분포 -->
        <section class="card">
          <div class="card-head">
            <h2 class="card-title">문제 {{ num(content?.total_cards) }}장</h2>
            <RouterLink to="/cards" class="more">관리하기 →</RouterLink>
          </div>
          <div class="card-body">
            <div v-if="!content?.by_category?.length" class="empty">등록된 문제가 없어요</div>
            <ul v-else class="dist">
              <li v-for="c in content.by_category" :key="c.code">
                <span class="dist-label">{{ c.label }}</span>
                <span class="dist-track">
                  <span
                    class="dist-fill"
                    :style="{ width: `${(c.count / (content!.total_cards || 1)) * 100}%` }"
                  />
                </span>
                <span class="dist-num num">{{ num(c.count) }}</span>
              </li>
            </ul>
            <div v-if="content?.by_type?.length" class="chips">
              <span v-for="t in content.by_type" :key="t.label" class="badge badge-gray">
                {{ t.label }} {{ num(t.count) }}
              </span>
            </div>
          </div>
        </section>

        <!-- 점검이 필요한 문제 -->
        <section class="card">
          <div class="card-head">
            <h2 class="card-title">아무도 못 푼 문제</h2>
            <span class="card-note">푼 사람은 있는데 완료가 0건</span>
          </div>
          <div class="card-body">
            <div v-if="!content?.untouched?.length" class="empty">
              모든 문제에서 완료자가 나왔어요
            </div>
            <ul v-else class="untouched">
              <li v-for="c in content.untouched" :key="c.id">
                <RouterLink :to="`/cards/${c.id}/edit`" class="untouched-title truncate">
                  {{ c.title || '(제목 없음)' }}
                </RouterLink>
                <span class="badge badge-gray">{{ c.category }}</span>
                <span class="untouched-n num">{{ num(c.learning) }}명 시도</span>
              </li>
            </ul>
          </div>
        </section>
      </div>

      <!-- 실시간 요청 흐름 -->
      <section class="card sec">
        <div class="card-head">
          <h2 class="card-title">실시간 요청</h2>
          <RouterLink to="/service" class="more">서비스 상태 →</RouterLink>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>시각</th>
                <th>메서드</th>
                <th>경로</th>
                <th>상태</th>
                <th>소요</th>
                <th>사용자</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!metrics?.recent?.length">
                <td colspan="6" class="empty">아직 요청이 없어요</td>
              </tr>
              <tr v-for="(e, i) in metrics?.recent ?? []" :key="`${e.at}-${i}`">
                <td class="num">{{ timeAgo(e.at) }}</td>
                <td class="num">{{ e.method }}</td>
                <td class="truncate">{{ e.path }}</td>
                <td>
                  <span class="badge" :class="`badge-${statusTone(e.status)}`">{{ e.status }}</span>
                </td>
                <td class="num" :class="{ slow: e.slow }">{{ ms(e.duration_ms) }}</td>
                <td class="num muted">{{ e.user_id || '비로그인' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </AsyncSection>
  </div>
</template>

<style scoped>
.sec {
  margin-bottom: 16px;
}

.live {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--text-muted);
}
.live-time {
  color: var(--text-faint);
}

.legend,
.card-note {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-faint);
}
.sw {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  display: inline-block;
  flex-shrink: 0;
}
.sw-blue {
  background: var(--blue);
}
.sw-red {
  background: var(--red);
}
.sw-green {
  background: var(--green);
}
.sw-gray {
  background: var(--border-strong);
}

.more {
  font-size: 12.5px;
  font-weight: 600;
}

.kv {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.kv > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.kv dt {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 13px;
}
.kv dd {
  margin: 0;
  font-weight: 700;
}
.kv-tight {
  margin-top: 12px;
  gap: 6px;
}
.warn {
  color: var(--amber);
}

.bar {
  display: flex;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--surface-alt);
}
.seg {
  min-width: 0;
}
.seg-done {
  background: var(--green);
}
.seg-doing {
  background: var(--blue);
}
.seg-todo {
  background: var(--border-strong);
}

.dist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dist li {
  display: grid;
  grid-template-columns: 84px 1fr 44px;
  align-items: center;
  gap: 9px;
  font-size: 12.5px;
}
.dist-label {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dist-track {
  height: 7px;
  border-radius: 999px;
  background: var(--surface-alt);
  overflow: hidden;
}
.dist-fill {
  display: block;
  height: 100%;
  background: var(--blue);
  border-radius: 999px;
}
.dist-num {
  text-align: right;
  font-weight: 700;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.untouched {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.untouched li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}
.untouched-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}
.untouched-n {
  color: var(--amber);
  font-weight: 700;
  flex-shrink: 0;
}

.slow {
  color: var(--red);
  font-weight: 700;
}
.muted {
  color: var(--text-faint);
}
</style>
