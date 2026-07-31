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
import StatusBadge from '../components/StatusBadge.vue';
import UserPeekDrawer from '../components/UserPeekDrawer.vue';

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

/** 미리보기 서랍이 열려 있는 대상. null 이면 닫혀 있다. */
const peekId = ref<string | null>(null);

/**
 * 자주 쓰는 조건 묶음.
 *
 * 필터 상자 두 개를 각각 맞추는 일은 별것 아닌 것 같지만, 하루에 스무 번 하면
 * 스무 번의 잔손질이다. 게다가 **관리자가 실제로 찾는 것은 정해져 있다** —
 * 대개 '지금 문제가 있는 계정'이다. 그 질문 하나를 버튼 하나로 만든다.
 *
 * 목록 위에 두는 이유: 필터를 걸기 전에 눈에 들어와야 쓴다. 아래에 두면
 * 이미 손으로 필터를 다 맞춘 뒤에 발견하게 된다.
 */
const PRESETS: { key: string; label: string; role: string; status: string }[] = [
  { key: 'all', label: '전체', role: '', status: '' },
  { key: 'suspended', label: '정지된 계정', role: '', status: 'I' },
  { key: 'admins', label: '관리자', role: 'ADMIN', status: '' },
  { key: 'deleted', label: '삭제된 계정', role: '', status: 'D' },
];

/** 지금 조건이 어느 묶음과 정확히 같은가. 검색어가 걸려 있으면 어느 것도 아니다. */
const activePreset = computed(() => {
  if (state.search.trim() !== '') return null;
  return PRESETS.find((p) => p.role === state.role && p.status === state.status)?.key ?? null;
});

/**
 * 줄 위에서의 Enter · Space — 마우스 없이도 미리보기를 연다.
 *
 * `@keydown.enter` 와 `@keydown.space` 를 따로 달지 않는다. 같은 요소에 같은
 * 이벤트를 두 번 걸면 어느 한쪽이 조용히 사라진다(실제로 Enter 가 먹지 않았다).
 * 키 판별을 여기서 직접 하면 그런 일이 없고, 무엇을 처리하는지도 한눈에 보인다.
 */
function onRowKey(e: KeyboardEvent, id: string): void {
  // 줄 안의 링크에 포커스가 있을 때는 링크가 열려야 한다 — 가로채지 않는다.
  if (e.target !== e.currentTarget) return;
  if (e.key !== 'Enter' && e.key !== ' ') return;
  // Space 는 기본이 '한 화면 아래로 스크롤'이다. 목록이 뛰면 안 된다.
  e.preventDefault();
  peekId.value = id;
}

function applyPreset(p: (typeof PRESETS)[number]): void {
  state.search = '';
  state.role = p.role;
  state.status = p.status;
  reload();
}

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

    <!-- 자주 쓰는 조건 묶음. 표 위에 둬서 필터를 손으로 맞추기 전에 눈에 띄게 한다. -->
    <div class="chips">
      <button
        v-for="p in PRESETS"
        :key="p.key"
        class="chip"
        type="button"
        :class="{ on: activePreset === p.key }"
        :aria-pressed="activePreset === p.key"
        @click="applyPreset(p)"
      >
        {{ p.label }}
      </button>
    </div>

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
                <!-- 빠른 동작 자리. 머리글은 비워 둔다 — '동작'이라고 써 두면
                     읽을 것이 하나 늘 뿐, 버튼을 보면 무엇인지 안다. -->
                <th class="act-col"><span class="sr-only">동작</span></th>
              </tr>
            </thead>
            <tbody>
              <!--
                줄 전체를 눌러 미리보기 서랍을 연다.
                이름의 링크는 그대로 둔다 — 새 탭으로 열거나 주소를 복사하는 길이
                막히면 안 된다. 그래서 링크는 클릭을 삼켜(stop) 전체 상세로 가고,
                줄의 나머지를 누르면 서랍이 열린다.
              -->
              <tr
                v-for="u in items"
                :key="u.id"
                class="row-peek"
                :class="{ on: peekId === u.id }"
                tabindex="0"
                role="button"
                :aria-label="`${u.user_nm || '이름 없음'} 미리보기`"
                @click="peekId = u.id"
                @keydown="onRowKey($event, u.id)"
              >
                <td>
                  <RouterLink :to="`/users/${u.id}`" class="strong" @click.stop>
                    {{ u.user_nm || '(이름 없음)' }}
                  </RouterLink>
                  <span v-if="u.nickname" class="nick">{{ u.nickname }}</span>
                </td>
                <td class="num">{{ u.login_id }}</td>
                <td class="truncate muted">
                  {{ [u.org_nm, u.job_title].filter(Boolean).join(' · ') || '—' }}
                </td>
                <td>
                  <StatusBadge v-if="u.role_cd === 'ADMIN'" tone="accent" dotless>
                    관리자
                  </StatusBadge>
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
                <td class="act-col">
                  <!--
                    평소에는 감춰 두고 줄에 마우스를 올리거나 포커스가 왔을 때만
                    나타난다. 서른 줄에 버튼이 늘 떠 있으면 표가 버튼 밭이 되어
                    정작 데이터가 안 읽힌다.

                    다만 '감춤'은 opacity 로만 한다. display:none 으로 지우면
                    키보드 Tab 순서에서도 사라져 마우스 없이는 닿을 수 없다.
                  -->
                  <div class="row-acts">
                    <RouterLink
                      class="btn btn-ghost btn-sm btn-icon"
                      :to="`/users/${u.id}`"
                      title="전체 상세 열기"
                      aria-label="전체 상세 열기"
                      @click.stop
                    >
                      <AppIcon name="chevron-right" :size="14" />
                    </RouterLink>
                  </div>
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

    <!-- 서랍은 목록 위에 겹쳐 뜬다. 닫으면 스크롤 위치도 필터도 그대로다. -->
    <UserPeekDrawer :user-id="peekId" @close="peekId = null" @changed="() => void page.run()" />
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

/* 줄 전체가 눌린다는 것을 보여 준다. */
.row-peek {
  cursor: pointer;
}
.row-peek:focus-visible {
  outline: none;
  /* 줄 안쪽에 링을 그린다 — 표 바깥으로 삐져나가면 옆 줄을 가린다. */
  box-shadow: inset var(--focus);
}
/* 서랍에 열려 있는 줄 — 뒤를 봤을 때 '무엇을 보고 있었는지'가 남아야 한다. */
.row-peek.on td {
  background: var(--accent-bg);
}

.act-col {
  width: 34px;
  padding-left: 0 !important;
  padding-right: 6px !important;
}

/* 평소에는 감춰 두되 자리는 차지한다 — 나타날 때 줄이 밀리면 안 된다.
   display:none 을 쓰지 않는 이유는 템플릿 주석에 있다(키보드 접근). */
.row-acts {
  display: flex;
  justify-content: flex-end;
  opacity: 0;
  transition: opacity 0.1s;
}
tr:hover .row-acts,
tr:focus-within .row-acts {
  opacity: 1;
}

/* 터치 기기에는 hover 가 없다 — 늘 보여 준다. */
@media (hover: none) {
  .row-acts {
    opacity: 1;
  }
}
</style>
