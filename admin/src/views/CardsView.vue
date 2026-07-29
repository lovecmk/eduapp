<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { api, ApiError } from '../api/client';
import type { CardPage, AdminCard } from '../api/types';
import { useAsync, useDebounced } from '../composables/useAsync';
import { useQuerySync } from '../composables/useQuerySync';
import { num, cardTypeLabel, difficultyLabel } from '../lib/format';
import { toast } from '../lib/toast';
import AsyncSection from '../components/AsyncSection.vue';
import SortTh from '../components/SortTh.vue';
import AppDialog from '../components/AppDialog.vue';
import AppIcon from '../components/AppIcon.vue';

/** 문제(카드) 목록 — 검색·필터·정렬·삭제, 그리고 카드별 학습 현황. */

const PAGE_SIZE = 30;

const { state, writeToUrl } = useQuerySync({
  search: '',
  category: '',
  type: '',
  sort: 'title',
  dir: 'asc',
  offset: 0,
});

const deleting = ref(false);
const target = ref<AdminCard | null>(null);

const page = useAsync<CardPage>(() =>
  api.cards({
    search: state.search.trim(),
    category: state.category,
    type: state.type,
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

const debounced = useDebounced(() => reload());

watch(
  () => [state.search, state.category, state.type, state.sort, state.dir, state.offset].join('|'),
  () => void page.run(),
);

function onSort(column: string): void {
  if (state.sort === column) {
    state.dir = state.dir === 'desc' ? 'asc' : 'desc';
  } else {
    state.sort = column;
    // 개수는 많은 것부터 보는 게 자연스럽고, 글자는 가나다순이다.
    state.dir = column === 'learning' || column === 'mastered' ? 'desc' : 'asc';
  }
  reload();
}

const items = computed(() => page.data.value?.items ?? []);
const total = computed(() => page.data.value?.total ?? 0);
const from = computed(() => (total.value === 0 ? 0 : state.offset + 1));
const to = computed(() => Math.min(state.offset + PAGE_SIZE, total.value));
const filtering = computed(
  () => state.search.trim() !== '' || state.category !== '' || state.type !== '',
);

/** 목록에 실제로 있는 분야만 필터로 제시한다(결과가 0인 선택지를 주지 않는다). */
const categories = computed(() =>
  [...new Set(items.value.map((c) => c.category_cd).filter(Boolean))].sort(),
);

function go(delta: number): void {
  const next = state.offset + delta * PAGE_SIZE;
  if (next < 0 || next >= total.value) return;
  state.offset = next;
  writeToUrl();
}

function resetFilters(): void {
  state.search = '';
  state.category = '';
  state.type = '';
  reload();
}

async function confirmDelete(): Promise<void> {
  const card = target.value;
  if (!card || deleting.value) return;
  deleting.value = true;
  try {
    await api.deleteCard(card.id);
    toast.success('문제를 삭제했습니다');
    target.value = null;
    // 마지막 페이지의 마지막 항목을 지우면 빈 페이지가 남는다 — 한 페이지 당긴다.
    if (items.value.length === 1 && state.offset > 0) {
      state.offset -= PAGE_SIZE;
      writeToUrl();
    }
    await page.run();
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : '삭제하지 못했습니다');
  } finally {
    deleting.value = false;
  }
}

const learners = computed(() =>
  target.value ? target.value.learning + target.value.mastered : 0,
);

onMounted(() => void page.run());
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">문제 관리</h1>
        <p class="page-sub">학습 카드를 만들고 고치며, 직원들의 진행 상황을 확인합니다</p>
      </div>
      <RouterLink to="/cards/new" class="btn btn-primary btn-sm">
        <AppIcon name="plus" :size="13" />
        문제 만들기
      </RouterLink>
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
            placeholder="제목 · 문제 내용 · 주제 · 출처"
            aria-label="문제 검색"
            @input="debounced.trigger"
          />
          <span class="search-kbd"><kbd class="kbd">/</kbd></span>
        </div>

        <select v-model="state.category" class="select w-auto" aria-label="분야" @change="reload()">
          <option value="">분야 전체</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
        <select v-model="state.type" class="select w-auto" aria-label="형식" @change="reload()">
          <option value="">형식 전체</option>
          <option value="EXPLANATION">설명형</option>
          <option value="OX">OX</option>
          <option value="CHOICE">객관식</option>
        </select>

        <button v-if="filtering" class="btn btn-ghost btn-sm" type="button" @click="resetFilters">
          <AppIcon name="x" :size="12" />
          초기화
        </button>

        <span class="grow" />
        <span v-if="page.loading.value" class="spinner" aria-label="불러오는 중" />
        <span class="count num">{{ num(total) }}장</span>
      </div>

      <AsyncSection
        :loading="page.loading.value"
        :error="page.error.value"
        :empty="items.length === 0"
        :empty-text="filtering ? '조건에 맞는 문제가 없습니다' : '등록된 문제가 없습니다'"
        :skeleton-rows="8"
        :on-retry="() => void page.run()"
      >
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <SortTh column="title" :active="state.sort" :desc="state.dir === 'desc'" @sort="onSort">
                  제목 · 문제
                </SortTh>
                <SortTh column="category" :active="state.sort" :desc="state.dir === 'desc'" @sort="onSort">
                  분야
                </SortTh>
                <SortTh column="type" :active="state.sort" :desc="state.dir === 'desc'" @sort="onSort">
                  형식
                </SortTh>
                <SortTh
                  column="difficulty"
                  :active="state.sort"
                  :desc="state.dir === 'desc'"
                  @sort="onSort"
                >
                  난이도
                </SortTh>
                <SortTh
                  column="learning"
                  :active="state.sort"
                  :desc="state.dir === 'desc'"
                  align="right"
                  @sort="onSort"
                >
                  학습 중
                </SortTh>
                <SortTh
                  column="mastered"
                  :active="state.sort"
                  :desc="state.dir === 'desc'"
                  align="right"
                  @sort="onSort"
                >
                  완료
                </SortTh>
                <th class="right" style="width: 92px"><span class="sr-only">관리</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in items" :key="c.id">
                <td>
                  <RouterLink :to="`/cards/${c.id}/edit`" class="strong truncate title">
                    {{ c.title_txt || c.question_txt || '(제목 없음)' }}
                  </RouterLink>
                  <div v-if="c.title_txt" class="q truncate muted">{{ c.question_txt }}</div>
                </td>
                <td class="nowrap muted">{{ c.category_cd }}</td>
                <td class="nowrap">{{ cardTypeLabel(c.card_type_cd) }}</td>
                <td class="nowrap muted">{{ difficultyLabel(c.difficulty_cd) }}</td>
                <td class="right num" :class="{ attention: c.learning > 0 && c.mastered === 0 }">
                  {{ num(c.learning) }}
                </td>
                <td class="right num">{{ num(c.mastered) }}</td>
                <td class="right">
                  <div class="actions">
                    <RouterLink :to="`/cards/${c.id}/edit`" class="btn btn-ghost btn-sm btn-icon" title="수정">
                      <AppIcon name="edit" :size="13" />
                      <span class="sr-only">수정</span>
                    </RouterLink>
                    <button
                      class="btn btn-ghost btn-sm btn-icon del"
                      type="button"
                      title="삭제"
                      @click="target = c"
                    >
                      <AppIcon name="trash" :size="13" />
                      <span class="sr-only">삭제</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pager">
          <span class="num">{{ num(from) }}–{{ num(to) }} / {{ num(total) }}</span>
          <div class="row">
            <button class="btn btn-sm" type="button" :disabled="state.offset === 0" @click="go(-1)">
              <AppIcon name="chevron-left" :size="13" />
              이전
            </button>
            <button
              class="btn btn-sm"
              type="button"
              :disabled="state.offset + PAGE_SIZE >= total"
              @click="go(1)"
            >
              다음
              <AppIcon name="chevron-right" :size="13" />
            </button>
          </div>
        </div>
      </AsyncSection>
    </section>

    <AppDialog
      :open="target !== null"
      title="문제 삭제"
      danger
      confirm-text="삭제"
      :busy="deleting"
      @close="target = null"
      @confirm="confirmDelete"
    >
      <p class="dlg-p">
        <strong>{{ target?.title_txt || target?.question_txt || '(제목 없음)' }}</strong> 문제를
        삭제합니다.
      </p>
      <p v-if="learners > 0" class="callout callout-warn">
        이미 {{ num(learners) }}명이 학습한 문제입니다. 삭제하면 해당 학습 기록도 함께 사라지고
        통계가 조정됩니다.
      </p>
      <p class="hint">되돌릴 수 없으며 관리 이력에 기록됩니다.</p>
    </AppDialog>
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
.title {
  display: inline-block;
  max-width: 380px;
}
.q {
  font-size: 11.5px;
  margin-top: 1px;
  max-width: 380px;
}
/* 시도는 있는데 완료가 0인 문제 — 눈에 띄어야 고칠 생각을 한다. */
.attention {
  color: var(--warn);
  font-weight: 600;
}
.actions {
  display: inline-flex;
  gap: 2px;
  justify-content: flex-end;
}
.del:hover {
  color: var(--danger);
  background: var(--danger-bg);
}
.dlg-p {
  margin: 0 0 10px;
}
.dlg-p strong {
  color: var(--ink);
}
</style>
