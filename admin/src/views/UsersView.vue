<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { api, ApiError } from '../api/client';
import type { UserPage } from '../api/types';
import { useAsync, useDebounced } from '../composables/useAsync';
import { useQuerySync } from '../composables/useQuerySync';
import { useNow } from '../composables/useNow';
import { num, dateOnly, timeAgo, statusLabel } from '../lib/format';
import { downloadCSV, stamp } from '../lib/csv';
import { toast } from '../lib/toast';
import AsyncSection from '../components/AsyncSection.vue';
import SortTh from '../components/SortTh.vue';
import AppIcon from '../components/AppIcon.vue';

/**
 * 사용자 목록.
 *
 * 조건(검색·필터·정렬·페이지)을 전부 주소창에 담는다 — 필터를 건 화면을 그대로
 * 공유하거나 북마크할 수 있고, 상세를 보고 뒤로 와도 조건이 유지된다.
 * 정렬은 서버가 한다(화면에서 현재 페이지만 정렬하면 '전체가 정렬된 것'으로 오해한다).
 */

const PAGE_SIZE = 30;

const { state, writeToUrl } = useQuerySync({
  search: '',
  role: '',
  status: '',
  sort: 'created_at',
  dir: 'desc',
  offset: 0,
});

const now = useNow();
const exporting = ref(false);

const page = useAsync<UserPage>(() =>
  api.users({
    search: state.search.trim(),
    role: state.role,
    status: state.status,
    sort: state.sort,
    dir: state.dir,
    offset: state.offset,
    limit: PAGE_SIZE,
  }),
);

function reload(resetPage = true): void {
  if (resetPage) state.offset = 0;
  writeToUrl();
  void page.run();
}

/** 검색어는 타이핑이 멎은 뒤에만 보낸다(글자마다 요청하면 서버가 헛돈다). */
const debounced = useDebounced(() => reload());

// 주소창이 바뀌면(뒤로가기 등) 목록도 따라간다.
watch(
  () => [state.search, state.role, state.status, state.sort, state.dir, state.offset].join('|'),
  () => void page.run(),
);

function onSort(column: string): void {
  if (state.sort === column) {
    state.dir = state.dir === 'desc' ? 'asc' : 'desc';
  } else {
    state.sort = column;
    // 날짜는 최신부터, 글자는 가나다순이 자연스럽다.
    state.dir = column === 'created_at' ? 'desc' : 'asc';
  }
  reload();
}

const items = computed(() => page.data.value?.items ?? []);
const total = computed(() => page.data.value?.total ?? 0);
const from = computed(() => (total.value === 0 ? 0 : state.offset + 1));
const to = computed(() => Math.min(state.offset + PAGE_SIZE, total.value));
const hasPrev = computed(() => state.offset > 0);
const hasNext = computed(() => state.offset + PAGE_SIZE < total.value);
const filtering = computed(
  () => state.search.trim() !== '' || state.role !== '' || state.status !== '',
);

function go(delta: number): void {
  const next = state.offset + delta * PAGE_SIZE;
  if (next < 0 || next >= total.value) return;
  state.offset = next;
  writeToUrl();
}

function resetFilters(): void {
  state.search = '';
  state.role = '';
  state.status = '';
  reload();
}

/**
 * CSV 내보내기.
 * 지금 보이는 30명이 아니라 **조건에 맞는 전체**를 받아 저장한다 —
 * 화면 한 페이지만 나가면 받는 사람이 전체인 줄 알고 잘못된 보고를 한다.
 */
async function exportCSV(): Promise<void> {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const all = await api.users({
      search: state.search.trim(),
      role: state.role,
      status: state.status,
      sort: state.sort,
      dir: state.dir,
      offset: 0,
      limit: 200, // 서버가 허용하는 최대치
    });
    downloadCSV(
      `users-${stamp()}.csv`,
      ['아이디', '이름', '닉네임', '이메일', '소속', '직무', '권한', '상태', '가입일'],
      all.items.map((u) => [
        u.login_id,
        u.user_nm,
        u.nickname,
        u.email_addr,
        u.org_nm,
        u.job_title,
        u.role_cd === 'ADMIN' ? '관리자' : '일반',
        statusLabel(u.status_cd),
        dateOnly(u.created_at),
      ]),
    );
    // 상한에 걸렸다면 반드시 알린다 — 잘린 파일을 전체로 오해하면 안 된다.
    if (all.total > all.items.length) {
      toast.info(`전체 ${num(all.total)}명 중 ${num(all.items.length)}명을 내보냈습니다`);
    } else {
      toast.success(`${num(all.items.length)}명을 내보냈습니다`);
    }
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : '내보내기에 실패했습니다');
  } finally {
    exporting.value = false;
  }
}

onMounted(() => void page.run());
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">사용자</h1>
        <p class="page-sub">가입한 직원 계정을 조회하고 권한·상태를 관리합니다</p>
      </div>
      <div class="row">
        <button class="btn btn-sm" type="button" :disabled="exporting" @click="exportCSV">
          <span v-if="exporting" class="spinner" aria-hidden="true" />
          <AppIcon v-else name="download" :size="13" />
          CSV
        </button>
      </div>
    </header>

    <section class="panel">
      <div class="panel-head filters">
        <div class="search-wrap">
          <span class="search-icon"><AppIcon name="search" :size="14" /></span>
          <input
            v-model="state.search"
            data-search-input
            class="input"
            type="search"
            placeholder="이름 · 닉네임 · 아이디 · 이메일 · 소속"
            aria-label="사용자 검색"
            @input="debounced.trigger"
          />
          <span class="search-kbd"><kbd class="kbd">/</kbd></span>
        </div>

        <select v-model="state.role" class="select w-auto" aria-label="권한" @change="reload()">
          <option value="">권한 전체</option>
          <option value="USER">일반</option>
          <option value="ADMIN">관리자</option>
        </select>
        <select v-model="state.status" class="select w-auto" aria-label="상태" @change="reload()">
          <option value="">상태 전체</option>
          <option value="A">활성</option>
          <option value="I">정지</option>
          <option value="D">삭제</option>
        </select>

        <button v-if="filtering" class="btn btn-ghost btn-sm" type="button" @click="resetFilters">
          <AppIcon name="x" :size="12" />
          초기화
        </button>

        <span class="grow" />
        <span v-if="page.loading.value" class="spinner" aria-label="불러오는 중" />
        <span class="count num">{{ num(total) }}명</span>
      </div>

      <AsyncSection
        :loading="page.loading.value"
        :error="page.error.value"
        :empty="items.length === 0"
        :empty-text="filtering ? '조건에 맞는 사용자가 없습니다' : '아직 가입한 사용자가 없습니다'"
        :skeleton-rows="8"
        :on-retry="() => void page.run()"
      >
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <SortTh column="user_nm" :active="state.sort" :desc="state.dir === 'desc'" @sort="onSort">
                  이름
                </SortTh>
                <SortTh column="login_id" :active="state.sort" :desc="state.dir === 'desc'" @sort="onSort">
                  아이디
                </SortTh>
                <th>소속 · 직무</th>
                <SortTh column="role_cd" :active="state.sort" :desc="state.dir === 'desc'" @sort="onSort">
                  권한
                </SortTh>
                <SortTh column="status_cd" :active="state.sort" :desc="state.dir === 'desc'" @sort="onSort">
                  상태
                </SortTh>
                <SortTh
                  column="created_at"
                  :active="state.sort"
                  :desc="state.dir === 'desc'"
                  align="right"
                  @sort="onSort"
                >
                  가입
                </SortTh>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in items" :key="u.id">
                <td>
                  <RouterLink :to="`/users/${u.id}`" class="strong">
                    {{ u.user_nm || '(이름 없음)' }}
                  </RouterLink>
                  <span v-if="u.nickname" class="nick">{{ u.nickname }}</span>
                </td>
                <td class="num">{{ u.login_id }}</td>
                <td class="truncate muted">
                  {{ [u.org_nm, u.job_title].filter(Boolean).join(' · ') || '—' }}
                </td>
                <td>
                  <span v-if="u.role_cd === 'ADMIN'" class="badge badge-accent">관리자</span>
                  <span v-else class="muted">일반</span>
                </td>
                <td class="nowrap">
                  <span
                    class="status-dot"
                    :class="
                      u.status_cd === 'A' || u.status_cd === ''
                        ? 'status-ok'
                        : u.status_cd === 'I'
                          ? 'status-warn'
                          : 'status-danger'
                    "
                  />
                  {{ statusLabel(u.status_cd) }}
                </td>
                <td class="right num muted" :title="dateOnly(u.created_at)">
                  {{ timeAgo(u.created_at, now) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pager">
          <span class="num">{{ num(from) }}–{{ num(to) }} / {{ num(total) }}</span>
          <div class="row">
            <button class="btn btn-sm" type="button" :disabled="!hasPrev" @click="go(-1)">
              <AppIcon name="chevron-left" :size="13" />
              이전
            </button>
            <button class="btn btn-sm" type="button" :disabled="!hasNext" @click="go(1)">
              다음
              <AppIcon name="chevron-right" :size="13" />
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
  gap: 7px;
  padding: 9px 12px;
}
.w-auto {
  width: auto;
  min-width: 108px;
  flex-shrink: 0;
}
.grow {
  flex: 1;
}
.count {
  font-size: 11.5px;
  color: var(--ink-3);
}
.nick {
  color: var(--ink-4);
  font-size: 11.5px;
  margin-left: 6px;
}
</style>
