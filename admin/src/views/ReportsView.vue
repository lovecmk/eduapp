<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { api } from '../api/client';
import type { AdminReport } from '../api/types';
import { dateTime, num } from '../lib/format';
import AsyncSection from '../components/AsyncSection.vue';
import AppIcon from '../components/AppIcon.vue';
import AppDialog from '../components/AppDialog.vue';
import { toast } from '../lib/toast';

/**
 * 신고 관리.
 *
 * 신고는 다른 지표와 성격이 다르다. 사용자 수나 학습량은 '현황'이지만,
 * 신고는 **"지금 잘못된 내용이 전 사용자에게 배포 중"**이라는 뜻이다.
 * 그래서 목록을 보여 주는 데서 끝내지 않고, 한 화면에서 곧바로
 * 문제를 열어 고치거나 지울 수 있게 한다.
 */
const router = useRouter();

const items = ref<AdminReport[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

/** 같은 카드에 신고가 여러 건 몰린 경우를 먼저 보여 준다 — 그쪽이 더 급하다. */
const grouped = computed(() => {
  const byCard = new Map<string, AdminReport[]>();
  for (const r of items.value) {
    const list = byCard.get(r.card_id) ?? [];
    list.push(r);
    byCard.set(r.card_id, list);
  }
  return [...byCard.values()].sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    return b[0]!.created_at.localeCompare(a[0]!.created_at);
  });
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    items.value = await api.reports(200);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '신고를 불러오지 못했습니다';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// ── 공지 발송 ────────────────────────────────────────────────────────────────
// 신고 화면에 둔 이유: 신고를 확인하고 "안내가 필요하다"고 판단하는 순간이
// 공지를 쓰는 순간이다. 화면을 옮겨 다니게 하면 그 흐름이 끊긴다.

const composeOpen = ref(false);
const title = ref('');
const body = ref('');
const typeCd = ref('SYSTEM');
const sending = ref(false);

const TYPES = [
  { value: 'SYSTEM', label: '시스템 안내' },
  { value: 'NEW', label: '새 콘텐츠' },
  { value: 'REMIND', label: '학습 알림' },
  { value: 'ACHIEVEMENT', label: '성취' },
];

// 글자 수는 '쓴 만큼 / 최대' 로 보여 준다.
// 남은 수만 적으면 "50" 이 쓴 글자인지 남은 글자인지 알 수 없다.
// [...str] 로 세는 것은 이모지·한글 조합을 코드 단위가 아니라 글자 단위로 세기 위해서다.
const TITLE_MAX = 60;
const BODY_MAX = 500;
const titleLen = computed(() => [...title.value].length);
const bodyLen = computed(() => [...body.value].length);
const canSend = computed(
  () =>
    title.value.trim().length > 0 &&
    titleLen.value <= TITLE_MAX &&
    bodyLen.value <= BODY_MAX &&
    !sending.value,
);

function openCompose(): void {
  title.value = '';
  body.value = '';
  typeCd.value = 'SYSTEM';
  composeOpen.value = true;
}

async function send(): Promise<void> {
  if (!canSend.value) return;
  sending.value = true;
  try {
    const sent = await api.notify({
      title_txt: title.value.trim(),
      desc_txt: body.value.trim(),
      type_cd: typeCd.value,
    });
    composeOpen.value = false;
    toast.success(`${num(sent)}명에게 공지를 보냈습니다`);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '공지를 보내지 못했습니다');
  } finally {
    sending.value = false;
  }
}

function openCard(id: string): void {
  void router.push(`/cards/${id}/edit`);
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">신고 관리</h1>
        <p class="page-sub">
          사용자가 문제에 대해 접수한 신고입니다. 같은 문제에 여러 건이 몰린 순서로 보여줍니다.
        </p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost btn-sm" type="button" @click="load">
          <AppIcon name="refresh" :size="14" />
          새로고침
        </button>
        <button class="btn btn-primary btn-sm" type="button" @click="openCompose">
          <AppIcon name="bell" :size="14" />
          공지 보내기
        </button>
      </div>
    </header>

    <AsyncSection
      :loading="loading"
      :error="error"
      :empty="items.length === 0"
      empty-text="접수된 신고가 없습니다. 문제 내용에 오류가 있으면 사용자가 앱에서 신고할 수 있습니다."
      :on-retry="load"
    >
      <div class="groups">
        <article v-for="group in grouped" :key="group[0]!.card_id" class="panel">
          <div class="panel-head group-head">
            <div class="group-title">
              <span class="card-name">
                {{ group[0]!.card_title || '(제목 없음)' }}
              </span>
              <span v-if="group[0]!.card_category" class="badge badge-neutral">
                {{ group[0]!.card_category }}
              </span>
              <span v-if="group.length > 1" class="badge badge-warn">{{ group.length }}건</span>
              <span v-if="group[0]!.card_missing" class="badge badge-danger">삭제된 문제</span>
            </div>
            <button
              v-if="!group[0]!.card_missing"
              class="btn btn-ghost btn-sm"
              type="button"
              @click="openCard(group[0]!.card_id)"
            >
              문제 열기
            </button>
          </div>

          <ul class="report-list">
            <li v-for="r in group" :key="r.id" class="report">
              <div class="report-top">
                <span class="reason">{{ r.reason }}</span>
                <span class="meta num">{{ r.reporter_name }} · {{ dateTime(r.created_at) }}</span>
              </div>
              <p v-if="r.detail" class="detail">{{ r.detail }}</p>
            </li>
          </ul>
        </article>
      </div>
    </AsyncSection>

    <AppDialog
      :open="composeOpen"
      title="공지 보내기"
      confirm-text="보내기"
      :busy="sending"
      @confirm="send"
      @close="composeOpen = false"
    >
      <p class="callout callout-warn compose-warn">
        활성 사용자 전원에게 즉시 전달되며 되돌릴 수 없습니다. 내용을 다시 확인해주세요.
      </p>

      <label class="field">
        <span class="label">종류</span>
        <select v-model="typeCd" class="input">
          <option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </label>

      <label class="field">
        <span class="label">
          제목
          <span class="counter" :class="{ over: titleLen > TITLE_MAX }">
            {{ titleLen }} / {{ TITLE_MAX }}
          </span>
        </span>
        <input v-model="title" class="input" type="text" maxlength="80" />
      </label>

      <label class="field">
        <span class="label">
          내용
          <span class="counter" :class="{ over: bodyLen > BODY_MAX }">
            {{ bodyLen }} / {{ BODY_MAX }}
          </span>
        </span>
        <textarea v-model="body" class="input area" rows="4" maxlength="600"></textarea>
      </label>
    </AppDialog>
  </div>
</template>

<style scoped>
.head-actions {
  display: flex;
  gap: 6px;
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.card-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-list {
  list-style: none;
  margin: 0;
  padding: 0;
  /* 항목 사이 1px 머리카락선 — 테두리 대신 배경 틈으로 만든다. */
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--line);
}
.report {
  background: var(--surface);
  padding: 10px 14px;
}
.report-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.reason {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}
.meta {
  font-size: 11px;
  color: var(--ink-4);
  flex-shrink: 0;
}
.detail {
  margin: 5px 0 0;
  font-size: 12px;
  color: var(--ink-3);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.compose-warn {
  margin: 0 0 14px;
}
.counter {
  margin-left: 6px;
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--ink-4);
}
.counter.over {
  color: var(--danger);
  font-weight: 600;
}
.area {
  resize: vertical;
  min-height: 84px;
  font-family: inherit;
  line-height: 1.6;
}
</style>
