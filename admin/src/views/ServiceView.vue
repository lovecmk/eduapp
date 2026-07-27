<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { api } from '../api/client';
import type { ServiceStatus } from '../api/types';
import { useAsync } from '../composables/useAsync';
import { useLiveMetrics } from '../composables/useLiveMetrics';
import { useNow } from '../composables/useNow';
import { num, pct, ms, uptime, dateTime, timeAgo, statusTone } from '../lib/format';
import StatTile from '../components/StatTile.vue';
import TrafficChart from '../components/TrafficChart.vue';
import AsyncSection from '../components/AsyncSection.vue';
import LiveIndicator from '../components/LiveIndicator.vue';
import AppIcon from '../components/AppIcon.vue';

/**
 * 서비스 상태 — 운영 진단 화면.
 *
 * 대시보드가 '요약'이라면 여기는 '왜 느린가 / 무엇이 실패하는가'에 답한다.
 * 경로별 지연·오류, 느린 요청, 실패 요청을 각각 따로 세워 원인을 좁힌다.
 */

const status = useAsync<ServiceStatus>(() => api.status());
const { snapshot, live, lastUpdate } = useLiveMetrics();
const now = useNow();

onMounted(() => void status.run());

const m = computed(() => snapshot.value);
const healthy = computed(() => status.data.value?.store_healthy === true);

const slow = computed(() => (m.value?.recent ?? []).filter((e) => e.slow));
const failed = computed(() => (m.value?.recent ?? []).filter((e) => e.status >= 400));

const errorTone = computed(() => {
  const r = m.value?.error_rate ?? 0;
  return r >= 5 ? 'danger' : r >= 1 ? 'warn' : 'default';
});
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">서비스 상태</h1>
        <p class="page-sub">서버 연결 · 응답 속도 · 오류를 실시간으로 진단합니다</p>
      </div>
      <div class="row">
        <LiveIndicator :live="live" :last-update="lastUpdate" />
        <button
          class="btn btn-sm"
          type="button"
          :disabled="status.loading.value"
          @click="() => void status.run()"
        >
          <AppIcon name="refresh" :size="13" />
          다시 확인
        </button>
      </div>
    </header>

    <!-- 저장소 연결 상태: 색 띠 대신 아이콘 + 배지로 나타낸다 -->
    <AsyncSection
      :loading="status.loading.value"
      :error="status.error.value"
      :empty="!status.data.value"
      :skeleton-rows="2"
      :on-retry="() => void status.run()"
    >
      <section class="panel health">
        <AppIcon
          :name="healthy ? 'check' : 'alert'"
          :size="17"
          :class="healthy ? 'h-ok' : 'h-bad'"
        />
        <div class="health-text">
          <div class="health-title">
            {{ healthy ? '정상 동작 중' : '저장소에 연결할 수 없습니다' }}
          </div>
          <div class="health-meta num">
            저장소 {{ status.data.value!.store }} · 가동
            {{ uptime(status.data.value!.uptime_seconds) }} · 확인
            {{ dateTime(status.data.value!.checked_at) }}
          </div>
          <div v-if="status.data.value!.store_error" class="callout callout-danger health-err">
            {{ status.data.value!.store_error }}
          </div>
        </div>
        <span class="badge" :class="healthy ? 'badge-ok' : 'badge-danger'">
          {{ healthy ? 'OK' : 'DOWN' }}
        </span>
      </section>
    </AsyncSection>

    <section class="panel tiles block">
      <StatTile label="누적 요청" :value="num(m?.total_requests)" sub="서버 기동 이후" />
      <StatTile
        label="오류율"
        :value="pct(m?.error_rate)"
        :sub="`최근 1시간 · 5xx ${num(m?.total_errors)}`"
        :tone="errorTone"
      />
      <StatTile label="4xx 거부" :value="num(m?.total_rejected)" sub="잘못된 요청 · 권한 없음" />
      <StatTile label="평균 응답" :value="ms(m?.avg_latency_ms)" :sub="`p95 ${ms(m?.p95_latency_ms)}`" />
      <StatTile label="지금 활동 중" :value="num(m?.active_users)" sub="최근 5분" tone="accent" />
    </section>

    <section class="panel block">
      <div class="panel-head">
        <h2 class="panel-title">요청량</h2>
        <span class="panel-note">최근 1시간 · 분 단위</span>
      </div>
      <div class="panel-body"><TrafficChart :points="m?.traffic ?? []" /></div>
    </section>

    <div class="grid grid-2 block">
      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">경로별</h2>
          <span class="panel-note">호출 많은 순</span>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>경로</th>
                <th class="right" style="width: 62px">호출</th>
                <th class="right" style="width: 70px">평균</th>
                <th class="right" style="width: 58px">오류</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!m?.top_paths?.length">
                <td colspan="4" class="empty">아직 기록이 없습니다</td>
              </tr>
              <tr v-for="p in m?.top_paths ?? []" :key="p.path">
                <td class="truncate num">{{ p.path }}</td>
                <td class="right num">{{ num(p.count) }}</td>
                <td class="right num" :class="{ attention: p.avg_ms >= 300 }">{{ ms(p.avg_ms) }}</td>
                <td class="right num" :class="{ bad: p.errors > 0 }">{{ num(p.errors) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">느린 요청</h2>
          <span class="panel-note">1초 이상</span>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 76px">시각</th>
                <th>경로</th>
                <th class="right" style="width: 72px">소요</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="slow.length === 0">
                <td colspan="3" class="empty">느린 요청이 없습니다</td>
              </tr>
              <tr v-for="(e, i) in slow" :key="`${e.at}-${i}`">
                <td class="num muted">{{ timeAgo(e.at, now) }}</td>
                <td class="truncate num">{{ e.method }} {{ e.path }}</td>
                <td class="right num bad">{{ ms(e.duration_ms) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <section class="panel block">
      <div class="panel-head">
        <h2 class="panel-title">실패한 요청</h2>
        <span class="panel-note">4xx · 5xx</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 78px">시각</th>
              <th style="width: 62px">메서드</th>
              <th>경로</th>
              <th style="width: 62px">상태</th>
              <th class="right" style="width: 72px">소요</th>
              <th style="width: 130px">사용자</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="failed.length === 0">
              <td colspan="6" class="empty">최근 실패한 요청이 없습니다</td>
            </tr>
            <tr v-for="(e, i) in failed" :key="`${e.at}-${i}`">
              <td class="num muted">{{ timeAgo(e.at, now) }}</td>
              <td class="num">{{ e.method }}</td>
              <td class="truncate num">{{ e.path }}</td>
              <td>
                <span class="badge" :class="`badge-${statusTone(e.status)}`">{{ e.status }}</span>
              </td>
              <td class="right num">{{ ms(e.duration_ms) }}</td>
              <td class="num muted truncate">{{ e.user_id || '비로그인' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.block {
  margin-top: 12px;
}

.health {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 13px 14px;
}
.h-ok {
  color: var(--ok);
  margin-top: 1px;
}
.h-bad {
  color: var(--danger);
  margin-top: 1px;
}
.health-text {
  flex: 1;
  min-width: 0;
}
.health-title {
  font-weight: 600;
  font-size: 13px;
}
.health-meta {
  font-size: 11.5px;
  color: var(--ink-3);
  margin-top: 2px;
}
.health-err {
  margin-top: 8px;
  overflow-wrap: anywhere;
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

.attention {
  color: var(--warn);
  font-weight: 600;
}
.bad {
  color: var(--danger);
  font-weight: 600;
}
</style>
