<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { api } from '../api/client';
import type { ServiceStatus } from '../api/types';
import { useAsync } from '../composables/useAsync';
import { useLiveMetrics } from '../composables/useLiveMetrics';
import { num, pct, ms, uptime, dateTime, timeAgo, statusTone } from '../lib/format';
import StatTile from '../components/StatTile.vue';
import TrafficChart from '../components/TrafficChart.vue';
import AsyncSection from '../components/AsyncSection.vue';

/**
 * 서비스 상태 — "지금 서버가 제대로 일하고 있나"에 답하는 화면.
 *
 * 대시보드가 '서비스 전반의 요약'이라면 여기는 '운영 진단'이다.
 * 경로별 지연·오류, 느린 요청, 저장소 연결 상태를 자세히 본다.
 */

const status = useAsync<ServiceStatus>(() => api.status());
const { snapshot, live, lastUpdate } = useLiveMetrics();

onMounted(() => void status.run());

const m = computed(() => snapshot.value);
const healthy = computed(() => status.data.value?.store_healthy === true);

/** 최근 요청 중 느린 것만 — 병목을 바로 짚기 위해. */
const slowRequests = computed(() => (m.value?.recent ?? []).filter((e) => e.slow));

/** 오류가 난 요청만. */
const failedRequests = computed(() => (m.value?.recent ?? []).filter((e) => e.status >= 400));

const errorTone = computed(() => {
  const rate = m.value?.error_rate ?? 0;
  if (rate >= 5) return 'red';
  if (rate >= 1) return 'amber';
  return 'green';
});
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">서비스 상태</h1>
        <p class="page-sub">서버 연결·응답 속도·오류를 실시간으로 진단합니다</p>
      </div>
      <div class="live">
        <span class="dot" :class="live ? 'dot-live' : 'dot-dead'" aria-hidden="true" />
        <span>{{ live ? '실시간 연결됨' : '연결 끊김 — 재연결 중' }}</span>
        <span v-if="lastUpdate" class="live-time num">{{ timeAgo(lastUpdate.toISOString()) }}</span>
      </div>
    </div>

    <!-- 저장소 연결 -->
    <AsyncSection
      :loading="status.loading.value"
      :error="status.error.value"
      :empty="!status.data.value"
      :on-retry="() => void status.run()"
    >
      <section class="card sec" :class="healthy ? 'ok' : 'bad'">
        <div class="card-body health">
          <span class="health-dot" :class="healthy ? 'health-ok' : 'health-bad'" aria-hidden="true" />
          <div class="health-text">
            <div class="health-title">
              {{ healthy ? '정상 동작 중' : '저장소에 연결할 수 없습니다' }}
            </div>
            <div class="health-sub">
              저장소 <b>{{ status.data.value!.store }}</b>
              · 가동 {{ uptime(status.data.value!.uptime_seconds) }}
              · 확인 {{ dateTime(status.data.value!.checked_at) }}
            </div>
            <div v-if="status.data.value!.store_error" class="health-err">
              {{ status.data.value!.store_error }}
            </div>
          </div>
          <button class="btn btn-sm" type="button" @click="() => void status.run()">다시 확인</button>
        </div>
      </section>
    </AsyncSection>

    <!-- 지표 요약 -->
    <section class="grid grid-stats sec">
      <StatTile label="누적 요청" :value="num(m?.total_requests)" hint="서버 기동 이후" />
      <StatTile
        label="오류율(최근 1시간)"
        :value="pct(m?.error_rate)"
        :hint="`5xx ${num(m?.total_errors)}건`"
        :tone="errorTone"
      />
      <StatTile label="4xx 거부" :value="num(m?.total_rejected)" hint="잘못된 요청·권한 없음" />
      <StatTile label="평균 응답" :value="ms(m?.avg_latency_ms)" :hint="`p95 ${ms(m?.p95_latency_ms)}`" />
      <StatTile label="지금 활동 중" :value="num(m?.active_users)" hint="최근 5분" tone="blue" />
    </section>

    <section class="card sec">
      <div class="card-head"><h2 class="card-title">최근 1시간 요청량</h2></div>
      <div class="card-body"><TrafficChart :points="m?.traffic ?? []" /></div>
    </section>

    <div class="grid grid-2 sec">
      <!-- 경로별 -->
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">많이 호출된 경로</h2>
          <span class="hint">평균 응답 · 오류 수</span>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>경로</th>
                <th class="right">호출</th>
                <th class="right">평균</th>
                <th class="right">오류</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!m?.top_paths?.length">
                <td colspan="4" class="empty">아직 기록이 없어요</td>
              </tr>
              <tr v-for="p in m?.top_paths ?? []" :key="p.path">
                <td class="truncate num">{{ p.path }}</td>
                <td class="right num">{{ num(p.count) }}</td>
                <td class="right num" :class="{ warn: p.avg_ms >= 300 }">{{ ms(p.avg_ms) }}</td>
                <td class="right num" :class="{ bad: p.errors > 0 }">{{ num(p.errors) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 느린 요청 -->
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">느린 요청</h2>
          <span class="hint">1초 이상 걸린 요청</span>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>시각</th>
                <th>경로</th>
                <th class="right">소요</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="slowRequests.length === 0">
                <td colspan="3" class="empty">느린 요청이 없어요 👍</td>
              </tr>
              <tr v-for="(e, i) in slowRequests" :key="`${e.at}-${i}`">
                <td class="num">{{ timeAgo(e.at) }}</td>
                <td class="truncate num">{{ e.method }} {{ e.path }}</td>
                <td class="right num bad">{{ ms(e.duration_ms) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- 실패한 요청 -->
    <section class="card sec">
      <div class="card-head">
        <h2 class="card-title">실패한 요청</h2>
        <span class="hint">4xx · 5xx 응답</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>시각</th>
              <th>메서드</th>
              <th>경로</th>
              <th>상태</th>
              <th class="right">소요</th>
              <th>사용자</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="failedRequests.length === 0">
              <td colspan="6" class="empty">최근 실패한 요청이 없어요 👍</td>
            </tr>
            <tr v-for="(e, i) in failedRequests" :key="`${e.at}-${i}`">
              <td class="num">{{ timeAgo(e.at) }}</td>
              <td class="num">{{ e.method }}</td>
              <td class="truncate num">{{ e.path }}</td>
              <td>
                <span class="badge" :class="`badge-${statusTone(e.status)}`">{{ e.status }}</span>
              </td>
              <td class="right num">{{ ms(e.duration_ms) }}</td>
              <td class="num muted">{{ e.user_id || '비로그인' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
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

.ok {
  border-left: 3px solid var(--green);
}
.bad {
  border-left: 3px solid var(--red);
}
.health {
  display: flex;
  align-items: center;
  gap: 13px;
}
.health-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  flex-shrink: 0;
}
.health-ok {
  background: var(--green);
}
.health-bad {
  background: var(--red);
}
.health-text {
  flex: 1;
  min-width: 0;
}
.health-title {
  font-weight: 700;
  font-size: 14px;
}
.health-sub {
  font-size: 12.5px;
  color: var(--text-muted);
  margin-top: 2px;
}
.health-err {
  font-size: 12px;
  color: var(--red);
  margin-top: 5px;
  overflow-wrap: anywhere;
}

.right {
  text-align: right;
}
.warn {
  color: var(--amber);
  font-weight: 700;
}
td.bad {
  color: var(--red);
  font-weight: 700;
  border-left: none;
}
.muted {
  color: var(--text-faint);
}
</style>
