<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../api/client';
import type { AuditLog } from '../api/types';
import { useAsync } from '../composables/useAsync';
import { dateTime, timeAgo, actionLabel } from '../lib/format';
import AsyncSection from '../components/AsyncSection.vue';

/**
 * 관리 이력 — 누가·언제·무엇을 바꿨는지.
 *
 * 이 화면은 "무슨 일이 있었나"를 되짚는 용도다. 그래서 조회는 기록하지 않고
 * **변경만** 남는다(조회까지 남기면 진짜 변경이 노이즈에 묻힌다).
 */

const logs = useAsync<AuditLog[]>(() => api.audit(200));
const filter = ref('');

const items = computed(() => {
  const all = logs.data.value ?? [];
  if (!filter.value) return all;
  return all.filter((l) => l.action.startsWith(filter.value));
});

/** 어떤 종류의 변경이 있었는지에 따라 배지 색을 다르게 — 삭제는 눈에 띄어야 한다. */
function tone(action: string): string {
  if (action.endsWith('.delete')) return 'badge-red';
  if (action.endsWith('.create')) return 'badge-green';
  if (action.startsWith('user.')) return 'badge-violet';
  return 'badge-blue';
}

onMounted(() => void logs.run());
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">관리 이력</h1>
        <p class="page-sub">관리자가 수행한 모든 변경 기록입니다. 조회는 기록되지 않습니다.</p>
      </div>
      <button class="btn btn-sm" type="button" @click="() => void logs.run()">새로고침</button>
    </div>

    <section class="card">
      <div class="card-head filters">
        <div class="seg-group" role="group" aria-label="이력 종류 필터">
          <button
            v-for="f in [
              { v: '', label: '전체' },
              { v: 'user.', label: '사용자' },
              { v: 'card.', label: '문제' },
            ]"
            :key="f.v"
            type="button"
            class="seg-btn"
            :class="{ 'seg-btn-on': filter === f.v }"
            :aria-pressed="filter === f.v"
            @click="filter = f.v"
          >
            {{ f.label }}
          </button>
        </div>
        <span class="count num">{{ items.length }}건</span>
      </div>

      <AsyncSection
        :loading="logs.loading.value"
        :error="logs.error.value"
        :empty="items.length === 0"
        :empty-text="filter ? '해당 종류의 이력이 없어요' : '아직 기록된 변경이 없어요'"
        :on-retry="() => void logs.run()"
      >
        <ul class="feed">
          <li v-for="l in items" :key="l.id" class="entry">
            <span class="badge" :class="tone(l.action)">{{ actionLabel(l.action) }}</span>
            <div class="entry-main">
              <div class="entry-summary">{{ l.summary }}</div>
              <div class="entry-meta num">
                {{ l.actor_name || l.actor_id || '알 수 없음' }}
                · {{ dateTime(l.created_at) }}
                <span v-if="l.target_type === 'card'" class="entry-link">
                  ·
                  <RouterLink :to="`/cards/${l.target_id}/edit`">문제 보기</RouterLink>
                </span>
                <span v-else-if="l.target_type === 'user'" class="entry-link">
                  ·
                  <RouterLink :to="`/users/${l.target_id}`">사용자 보기</RouterLink>
                </span>
              </div>
            </div>
            <span class="entry-ago num">{{ timeAgo(l.created_at) }}</span>
          </li>
        </ul>
      </AsyncSection>
    </section>
  </div>
</template>

<style scoped>
.filters {
  justify-content: flex-start;
  gap: 12px;
}
.count {
  font-size: 12.5px;
  color: var(--text-muted);
  font-weight: 600;
}
.seg-group {
  display: inline-flex;
  border: 1px solid var(--border-strong);
  border-radius: var(--r);
  overflow: hidden;
}
.seg-btn {
  border: none;
  background: var(--surface);
  padding: 6px 13px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  border-right: 1px solid var(--border);
}
.seg-btn:last-child {
  border-right: none;
}
.seg-btn-on {
  background: var(--blue);
  color: #fff;
}

.feed {
  list-style: none;
  margin: 0;
  padding: 0;
}
.entry {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.entry:last-child {
  border-bottom: none;
}
.entry-main {
  flex: 1;
  min-width: 0;
}
.entry-summary {
  font-size: 13.5px;
  line-height: 1.55;
}
.entry-meta {
  font-size: 11.5px;
  color: var(--text-faint);
  margin-top: 3px;
}
.entry-link a {
  font-size: 11.5px;
}
.entry-ago {
  font-size: 11.5px;
  color: var(--text-faint);
  flex-shrink: 0;
  white-space: nowrap;
}
</style>
