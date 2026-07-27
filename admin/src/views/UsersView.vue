<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../api/client';
import type { UserPage } from '../api/types';
import { useAsync, useDebounced } from '../composables/useAsync';
import { num, dateOnly, statusLabel } from '../lib/format';
import AsyncSection from '../components/AsyncSection.vue';

/** 사용자 목록 — 검색·필터·페이지네이션. */

const PAGE_SIZE = 25;

const search = ref('');
const role = ref('');
const status = ref('');
const offset = ref(0);

const page = useAsync<UserPage>(() =>
  api.users({
    search: search.value.trim(),
    role: role.value,
    status: status.value,
    offset: offset.value,
    limit: PAGE_SIZE,
  }),
);

/** 검색어는 타이핑이 멎은 뒤에 보낸다 — 한 글자마다 요청하면 서버가 헛돈다. */
const debounced = useDebounced(() => {
  offset.value = 0; // 조건이 바뀌면 1페이지부터
  void page.run();
});

/** 필터(드롭다운)는 즉시 반영해도 요청이 몰리지 않는다. */
function applyFilter(): void {
  offset.value = 0;
  void page.run();
}

function go(delta: number): void {
  const total = page.data.value?.total ?? 0;
  const next = offset.value + delta * PAGE_SIZE;
  if (next < 0 || next >= total) return;
  offset.value = next;
  void page.run();
}

const items = computed(() => page.data.value?.items ?? []);
const total = computed(() => page.data.value?.total ?? 0);
const from = computed(() => (total.value === 0 ? 0 : offset.value + 1));
const to = computed(() => Math.min(offset.value + PAGE_SIZE, total.value));
const hasPrev = computed(() => offset.value > 0);
const hasNext = computed(() => offset.value + PAGE_SIZE < total.value);

const filtering = computed(
  () => search.value.trim() !== '' || role.value !== '' || status.value !== '',
);

function resetFilters(): void {
  search.value = '';
  role.value = '';
  status.value = '';
  applyFilter();
}

onMounted(() => void page.run());
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">사용자</h1>
        <p class="page-sub">가입한 학습자 계정을 조회하고 권한·상태를 관리합니다</p>
      </div>
      <span class="badge badge-gray">전체 {{ num(total) }}명</span>
    </div>

    <section class="card">
      <div class="card-head filters">
        <input
          v-model="search"
          class="input search"
          type="search"
          placeholder="이름 · 닉네임 · 아이디 · 이메일 · 소속 검색"
          aria-label="사용자 검색"
          @input="debounced.trigger"
        />
        <select v-model="role" class="select narrow" aria-label="권한 필터" @change="applyFilter">
          <option value="">권한 전체</option>
          <option value="USER">일반</option>
          <option value="ADMIN">관리자</option>
        </select>
        <select v-model="status" class="select narrow" aria-label="상태 필터" @change="applyFilter">
          <option value="">상태 전체</option>
          <option value="A">활성</option>
          <option value="I">정지</option>
          <option value="D">삭제</option>
        </select>
        <button v-if="filtering" class="btn btn-sm" type="button" @click="resetFilters">
          초기화
        </button>
        <span v-if="page.loading.value" class="spinner" aria-label="불러오는 중" />
      </div>

      <AsyncSection
        :loading="page.loading.value"
        :error="page.error.value"
        :empty="items.length === 0"
        :empty-text="filtering ? '조건에 맞는 사용자가 없어요' : '아직 가입한 사용자가 없어요'"
        :on-retry="() => void page.run()"
      >
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>이름</th>
                <th>아이디</th>
                <th>소속 · 직무</th>
                <th>권한</th>
                <th>상태</th>
                <th>가입일</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in items" :key="u.id">
                <td>
                  <RouterLink :to="`/users/${u.id}`" class="name">
                    {{ u.user_nm || '(이름 없음)' }}
                  </RouterLink>
                  <span v-if="u.nickname" class="nick">{{ u.nickname }}</span>
                </td>
                <td class="num">{{ u.login_id }}</td>
                <td class="truncate">
                  {{ [u.org_nm, u.job_title].filter(Boolean).join(' · ') || '-' }}
                </td>
                <td>
                  <span class="badge" :class="u.role_cd === 'ADMIN' ? 'badge-violet' : 'badge-gray'">
                    {{ u.role_cd === 'ADMIN' ? '관리자' : '일반' }}
                  </span>
                </td>
                <td>
                  <span
                    class="badge"
                    :class="
                      u.status_cd === 'A' || u.status_cd === ''
                        ? 'badge-green'
                        : u.status_cd === 'I'
                          ? 'badge-amber'
                          : 'badge-red'
                    "
                  >
                    {{ statusLabel(u.status_cd) }}
                  </span>
                </td>
                <td class="num muted">{{ dateOnly(u.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pager">
          <span class="pager-info num">{{ num(from) }}–{{ num(to) }} / {{ num(total) }}</span>
          <div class="row">
            <button class="btn btn-sm" type="button" :disabled="!hasPrev" @click="go(-1)">
              이전
            </button>
            <button class="btn btn-sm" type="button" :disabled="!hasNext" @click="go(1)">
              다음
            </button>
          </div>
        </div>
      </AsyncSection>
    </section>
  </div>
</template>

<style scoped>
.filters {
  flex-wrap: wrap;
  justify-content: flex-start;
}
.search {
  flex: 1 1 260px;
  min-width: 0;
}
.narrow {
  width: auto;
  min-width: 118px;
  flex-shrink: 0;
}
.name {
  font-weight: 600;
}
.nick {
  color: var(--text-faint);
  font-size: 12px;
  margin-left: 6px;
}
.muted {
  color: var(--text-faint);
}
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}
.pager-info {
  font-size: 12.5px;
  color: var(--text-muted);
}
</style>
