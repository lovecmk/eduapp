<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api, ApiError } from '../api/client';
import type { CardPage } from '../api/types';
import { useAsync, useDebounced } from '../composables/useAsync';
import { num, cardTypeLabel, difficultyLabel } from '../lib/format';
import { toast } from '../lib/toast';
import AsyncSection from '../components/AsyncSection.vue';

/** 문제(카드) 목록 — 검색·필터·삭제, 그리고 학습 현황 확인. */

const PAGE_SIZE = 25;

const search = ref('');
const category = ref('');
const type = ref('');
const offset = ref(0);
const deleting = ref<string | null>(null);
const confirmTarget = ref<{ id: string; title: string; learners: number } | null>(null);

const page = useAsync<CardPage>(() =>
  api.cards({
    search: search.value.trim(),
    category: category.value,
    type: type.value,
    offset: offset.value,
    limit: PAGE_SIZE,
  }),
);

const debounced = useDebounced(() => {
  offset.value = 0;
  void page.run();
});

function applyFilter(): void {
  offset.value = 0;
  void page.run();
}

const items = computed(() => page.data.value?.items ?? []);
const total = computed(() => page.data.value?.total ?? 0);
const from = computed(() => (total.value === 0 ? 0 : offset.value + 1));
const to = computed(() => Math.min(offset.value + PAGE_SIZE, total.value));

/** 목록에 실제로 존재하는 분야만 필터로 제시한다(빈 결과가 나오는 선택지를 주지 않는다). */
const categories = computed(() => {
  const set = new Set(items.value.map((c) => c.category_cd).filter(Boolean));
  return [...set].sort();
});

function go(delta: number): void {
  const next = offset.value + delta * PAGE_SIZE;
  if (next < 0 || next >= total.value) return;
  offset.value = next;
  void page.run();
}

function askDelete(id: string, title: string, learners: number): void {
  confirmTarget.value = { id, title, learners };
}

async function doDelete(): Promise<void> {
  const target = confirmTarget.value;
  if (!target || deleting.value) return;
  deleting.value = target.id;
  try {
    await api.deleteCard(target.id);
    toast.success('문제를 삭제했습니다');
    confirmTarget.value = null;
    // 마지막 페이지의 마지막 항목을 지우면 빈 페이지가 남는다 — 한 페이지 당긴다.
    if (items.value.length === 1 && offset.value > 0) offset.value -= PAGE_SIZE;
    await page.run();
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : '삭제하지 못했습니다');
  } finally {
    deleting.value = null;
  }
}

onMounted(() => void page.run());
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">문제 관리</h1>
        <p class="page-sub">학습 카드를 만들고 고치고, 학습자들의 진행 상황을 확인합니다</p>
      </div>
      <RouterLink to="/cards/new" class="btn btn-primary">+ 문제 만들기</RouterLink>
    </div>

    <section class="card">
      <div class="card-head filters">
        <input
          v-model="search"
          class="input search"
          type="search"
          placeholder="제목 · 문제 내용 · 주제 · 출처 검색"
          aria-label="문제 검색"
          @input="debounced.trigger"
        />
        <select v-model="category" class="select narrow" aria-label="분야 필터" @change="applyFilter">
          <option value="">분야 전체</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
        <select v-model="type" class="select narrow" aria-label="형식 필터" @change="applyFilter">
          <option value="">형식 전체</option>
          <option value="EXPLANATION">설명형</option>
          <option value="OX">OX</option>
          <option value="CHOICE">객관식</option>
        </select>
        <span class="count num">{{ num(total) }}장</span>
        <span v-if="page.loading.value" class="spinner" aria-label="불러오는 중" />
      </div>

      <AsyncSection
        :loading="page.loading.value"
        :error="page.error.value"
        :empty="items.length === 0"
        empty-text="조건에 맞는 문제가 없어요"
        :on-retry="() => void page.run()"
      >
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>제목 · 문제</th>
                <th>분야</th>
                <th>형식</th>
                <th>난이도</th>
                <th class="right">학습 중</th>
                <th class="right">완료</th>
                <th class="right">관리</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in items" :key="c.id">
                <td>
                  <RouterLink :to="`/cards/${c.id}/edit`" class="title truncate">
                    {{ c.title_txt || c.question_txt || '(제목 없음)' }}
                  </RouterLink>
                  <div v-if="c.title_txt" class="q truncate">{{ c.question_txt }}</div>
                </td>
                <td class="nowrap">{{ c.category_cd }}</td>
                <td>
                  <span class="badge badge-gray">{{ cardTypeLabel(c.card_type_cd) }}</span>
                </td>
                <td class="nowrap">{{ difficultyLabel(c.difficulty_cd) }}</td>
                <td class="right num" :class="{ warn: c.learning > 0 && c.mastered === 0 }">
                  {{ num(c.learning) }}
                </td>
                <td class="right num">{{ num(c.mastered) }}</td>
                <td class="right">
                  <div class="actions">
                    <RouterLink :to="`/cards/${c.id}/edit`" class="btn btn-sm">수정</RouterLink>
                    <button
                      class="btn btn-sm btn-danger"
                      type="button"
                      :disabled="deleting === c.id"
                      @click="askDelete(c.id, c.title_txt || c.question_txt, c.learning + c.mastered)"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pager">
          <span class="pager-info num">{{ num(from) }}–{{ num(to) }} / {{ num(total) }}</span>
          <div class="row">
            <button class="btn btn-sm" type="button" :disabled="offset === 0" @click="go(-1)">
              이전
            </button>
            <button
              class="btn btn-sm"
              type="button"
              :disabled="offset + PAGE_SIZE >= total"
              @click="go(1)"
            >
              다음
            </button>
          </div>
        </div>
      </AsyncSection>
    </section>

    <!-- 삭제 확인 -->
    <div v-if="confirmTarget" class="overlay" @click.self="confirmTarget = null">
      <div class="card dialog" role="dialog" aria-modal="true" aria-labelledby="del-title">
        <div class="card-head"><h2 id="del-title" class="card-title">문제 삭제</h2></div>
        <div class="card-body">
          <p class="dialog-msg">“{{ confirmTarget.title || '(제목 없음)' }}” 문제를 삭제합니다.</p>
          <p v-if="confirmTarget.learners > 0" class="warn-box">
            이미 <strong>{{ num(confirmTarget.learners) }}명</strong>이 이 문제를 학습했습니다.
            삭제하면 해당 학습 기록도 함께 사라지고 통계가 조정됩니다.
          </p>
          <p class="hint">이 작업은 되돌릴 수 없으며 관리 이력에 기록됩니다.</p>
        </div>
        <div class="dialog-foot">
          <button class="btn" type="button" :disabled="!!deleting" @click="confirmTarget = null">
            취소
          </button>
          <button class="btn btn-danger" type="button" :disabled="!!deleting" @click="doDelete">
            <span v-if="deleting" class="spinner" aria-hidden="true" />
            {{ deleting ? '삭제 중…' : '삭제하기' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filters {
  flex-wrap: wrap;
  justify-content: flex-start;
}
.search {
  flex: 1 1 240px;
  min-width: 0;
}
.narrow {
  width: auto;
  min-width: 118px;
  flex-shrink: 0;
}
.count {
  font-size: 12.5px;
  color: var(--text-muted);
  font-weight: 600;
}
.title {
  font-weight: 600;
}
.q {
  color: var(--text-faint);
  font-size: 12px;
  margin-top: 2px;
  max-width: 380px;
}
.nowrap {
  white-space: nowrap;
}
.right {
  text-align: right;
}
.warn {
  color: var(--amber);
  font-weight: 700;
}
.actions {
  display: inline-flex;
  gap: 6px;
  justify-content: flex-end;
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

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(16, 24, 40, 0.45);
  display: grid;
  place-items: center;
  padding: 20px;
  z-index: 50;
}
.dialog {
  width: 100%;
  max-width: 440px;
  box-shadow: var(--shadow-lg);
}
.dialog-msg {
  margin: 0 0 10px;
  font-size: 13.5px;
  line-height: 1.65;
}
.warn-box {
  background: var(--amber-weak);
  color: var(--amber);
  border-radius: var(--r);
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.6;
  margin: 0 0 8px;
}
.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}
</style>
