<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { api } from '../api/client';
import type { AuditLog } from '../api/types';
import { useAsync } from '../composables/useAsync';
import { useQuerySync } from '../composables/useQuerySync';
import { useNow } from '../composables/useNow';
import { dateTime, timeAgo, actionLabel } from '../lib/format';
import AsyncSection from '../components/AsyncSection.vue';
import AppIcon from '../components/AppIcon.vue';

/**
 * 관리 이력 — 누가·언제·무엇을 바꿨는지.
 *
 * 조회는 기록하지 않고 **변경만** 남는다(조회까지 남기면 진짜 변경이 노이즈에 묻힌다).
 * 표가 아니라 시간순 목록으로 그린다 — 이력은 '무슨 일이 있었나'를 읽는 것이지
 * 열별로 비교하는 자료가 아니다.
 */

const logs = useAsync<AuditLog[]>(() => api.audit(200));
const { state, writeToUrl } = useQuerySync({ kind: '' });
const now = useNow();

const items = computed(() => {
  const all = logs.data.value ?? [];
  return state.kind ? all.filter((l) => l.action.startsWith(state.kind)) : all;
});

function setKind(kind: string): void {
  state.kind = kind;
  writeToUrl();
}

/** 변경 종류별 아이콘 — 삭제는 눈에 띄어야 한다. */
function iconOf(action: string) {
  if (action.endsWith('.delete')) return 'trash' as const;
  if (action.endsWith('.create')) return 'plus' as const;
  if (action.startsWith('user.')) return 'users' as const;
  return 'edit' as const;
}
function toneOf(action: string): string {
  if (action.endsWith('.delete')) return 'act-danger';
  if (action.endsWith('.create')) return 'act-ok';
  return 'act-default';
}

const FILTERS = [
  { v: '', label: '전체' },
  { v: 'user.', label: '사용자' },
  { v: 'card.', label: '문제' },
];

onMounted(() => void logs.run());
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">관리 이력</h1>
        <p class="page-sub">관리자가 수행한 모든 변경 기록입니다. 조회는 기록되지 않습니다.</p>
      </div>
      <button class="btn btn-sm" type="button" :disabled="logs.loading.value" @click="() => void logs.run()">
        <AppIcon name="refresh" :size="13" />
        새로고침
      </button>
    </header>

    <section class="panel">
      <div class="panel-head">
        <div class="segmented" role="group" aria-label="이력 종류">
          <button
            v-for="f in FILTERS"
            :key="f.v"
            type="button"
            :aria-pressed="state.kind === f.v"
            @click="setKind(f.v)"
          >
            {{ f.label }}
          </button>
        </div>
        <span class="panel-note num">{{ items.length }}건</span>
      </div>

      <AsyncSection
        :loading="logs.loading.value"
        :error="logs.error.value"
        :empty="items.length === 0"
        :empty-text="state.kind ? '해당 종류의 이력이 없습니다' : '아직 기록된 변경이 없습니다'"
        :skeleton-rows="6"
        :on-retry="() => void logs.run()"
      >
        <ol class="feed">
          <li v-for="l in items" :key="l.id" class="entry">
            <span class="entry-icon" :class="toneOf(l.action)">
              <AppIcon :name="iconOf(l.action)" :size="13" />
            </span>
            <div class="entry-main">
              <p class="entry-summary">{{ l.summary }}</p>
              <p class="entry-meta">
                <span class="badge badge-neutral">{{ actionLabel(l.action) }}</span>
                <span class="num">{{ l.actor_name || l.actor_id || '알 수 없음' }}</span>
                <span class="dot-sep">·</span>
                <RouterLink
                  v-if="l.target_type === 'card'"
                  :to="`/cards/${l.target_id}/edit`"
                  class="entry-link"
                >
                  문제 보기
                </RouterLink>
                <RouterLink
                  v-else-if="l.target_type === 'user'"
                  :to="`/users/${l.target_id}`"
                  class="entry-link"
                >
                  사용자 보기
                </RouterLink>
              </p>
            </div>
            <time class="entry-time num" :title="dateTime(l.created_at)">
              {{ timeAgo(l.created_at, now) }}
            </time>
          </li>
        </ol>
      </AsyncSection>
    </section>
  </div>
</template>

<style scoped>
.feed {
  list-style: none;
  margin: 0;
  padding: 0;
}
.entry {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 14px;
}
.entry + .entry {
  border-top: 1px solid var(--line);
}
.entry:hover {
  background: var(--surface-2);
}

/* 색 띠 대신 아이콘 배경으로 종류를 구분한다. */
.entry-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--r-2);
  flex-shrink: 0;
  margin-top: 1px;
}
.act-default {
  background: var(--surface-3);
  color: var(--ink-2);
}
.act-ok {
  background: var(--ok-bg);
  color: var(--ok);
}
.act-danger {
  background: var(--danger-bg);
  color: var(--danger);
}

.entry-main {
  flex: 1;
  min-width: 0;
}
.entry-summary {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
}
.entry-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin: 3px 0 0;
  font-size: 11px;
  color: var(--ink-4);
}
.dot-sep {
  color: var(--n-300);
}
.entry-link {
  font-size: 11px;
}
.entry-time {
  font-size: 11px;
  color: var(--ink-4);
  flex-shrink: 0;
  white-space: nowrap;
  margin-top: 3px;
}
</style>
