<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { api } from '../api/client';
import type { AdminReport, ReportStatus } from '../api/types';
import { dateTime, reportStatusMeta } from '../lib/format';
import { useQuerySync } from '../composables/useQuerySync';
import { refreshAlerts } from '../stores/alerts';
import AsyncSection from '../components/AsyncSection.vue';
import AppIcon from '../components/AppIcon.vue';
import AppDialog from '../components/AppDialog.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { toast } from '../lib/toast';

/**
 * 신고 처리.
 *
 * 신고는 다른 지표와 성격이 다르다. 사용자 수나 학습량은 '현황'이지만,
 * 신고는 **"지금 잘못된 내용이 전 사용자에게 배포 중"**이라는 뜻이다.
 * 그래서 목록을 보여 주는 데서 끝내지 않고, 한 화면에서 곧바로
 * 문제를 열어 고치거나 처리 단계를 남길 수 있게 한다.
 *
 * ── 왜 처리 단계가 필요한가 ──────────────────────────────────────────────
 * 상태가 없던 시절, 이 화면은 접수된 순간부터 영원히 같은 모습이었다.
 * 어제 확인한 신고를 오늘 또 읽고, 옆자리가 이미 고친 문제를 다시 붙잡는다.
 * 상단 바의 '신고 3건'도 줄지 않으니 며칠이면 아무도 그 숫자를 보지 않게 된다.
 */
const router = useRouter();

const items = ref<AdminReport[]>([]);
const counts = ref<Partial<Record<ReportStatus, number>>>({});
const loading = ref(true);
const error = ref<string | null>(null);

/** 필터는 주소창에 담는다 — 걸어 둔 화면을 그대로 공유·북마크할 수 있어야 한다. */
const { state: q, writeToUrl } = useQuerySync({ status: '' });

/**
 * 자주 쓰는 조건.
 *
 * 관리자가 실제로 찾는 것은 대개 '지금 손이 필요한 것'이다. 그 질문을
 * 버튼 하나로 만든다. 건수는 **필터 바깥까지** 센 값이라, 어느 칩에
 * 볼 것이 있는지 누르기 전에 알 수 있다.
 */
const PRESETS: { value: '' | ReportStatus; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'OPEN', label: '미처리' },
  { value: 'DOING', label: '확인 중' },
  { value: 'RESOLVED', label: '처리 완료' },
  { value: 'REJECTED', label: '반려' },
];

function presetCount(value: '' | ReportStatus): number {
  if (value === '') {
    return Object.values(counts.value).reduce((sum, n) => sum + (n ?? 0), 0);
  }
  return counts.value[value] ?? 0;
}

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
    const page = await api.reports({ status: q.status, limit: 200 });
    items.value = page.items;
    counts.value = page.counts;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '신고를 불러오지 못했습니다';
  } finally {
    loading.value = false;
  }
}

function setStatus(value: string): void {
  q.status = value;
  writeToUrl();
  void load();
}

onMounted(load);

// ── 처리 ─────────────────────────────────────────────────────────────────────
// 확인 중(DOING)은 되돌릴 수 있는 표시라 곧바로 실행한다. 완료·반려는 판단을
// 남기는 행위라 메모를 함께 받는다(반려는 사유가 없으면 서버가 거절한다).

const reviewing = ref<AdminReport | null>(null);
const reviewStatus = ref<ReportStatus>('RESOLVED');
const resolution = ref('');
const saving = ref(false);

const RESOLUTION_MAX = 500;
const resolutionLen = computed(() => [...resolution.value].length);
const needsReason = computed(() => reviewStatus.value === 'REJECTED');
const canSave = computed(
  () =>
    !saving.value &&
    resolutionLen.value <= RESOLUTION_MAX &&
    (!needsReason.value || resolution.value.trim().length > 0),
);

function openReview(report: AdminReport, next: ReportStatus): void {
  reviewing.value = report;
  reviewStatus.value = next;
  resolution.value = report.resolution_txt ?? '';
}

/** 되돌릴 수 있는 단계 변경은 확인 없이 바로 반영한다. */
async function quickSet(report: AdminReport, next: ReportStatus): Promise<void> {
  await apply(report, next, report.resolution_txt ?? '');
}

async function apply(report: AdminReport, next: ReportStatus, note: string): Promise<void> {
  saving.value = true;
  try {
    const updated = await api.reviewReport(report.id, next, note.trim());
    // 목록을 통째로 다시 받지 않고 그 줄만 갈아 끼운다 — 스크롤 위치와
    // 펼쳐 둔 맥락을 잃지 않기 위해서다. 건수는 서버가 다시 세야 하므로
    // 조용히 재조회한다(화면은 이미 최신이라 깜빡이지 않는다).
    const i = items.value.findIndex((r) => r.id === updated.id);
    if (i >= 0) items.value[i] = updated;
    // 필터가 걸려 있으면 이제 조건에서 벗어난 줄이 남아 있게 된다 — 목록을 다시 받는다.
    if (q.status) {
      await load();
    } else {
      counts.value = (await api.reports({ status: '', limit: 1 })).counts;
    }
    void refreshAlerts(true); // 상단 바의 배지도 함께 내려간다
    toast.success(`${reportStatusMeta(next).label}(으)로 처리했습니다`);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '처리하지 못했습니다');
  } finally {
    saving.value = false;
    reviewing.value = null;
  }
}

function confirmReview(): void {
  if (!reviewing.value || !canSave.value) return;
  void apply(reviewing.value, reviewStatus.value, resolution.value);
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
        <RouterLink class="btn btn-primary btn-sm" to="/announcements">
          <AppIcon name="bell" :size="14" />
          공지 보내기
        </RouterLink>
      </div>
    </header>

    <div class="chips">
      <button
        v-for="p in PRESETS"
        :key="p.value || 'all'"
        class="chip"
        :class="{ on: q.status === p.value }"
        type="button"
        @click="setStatus(p.value)"
      >
        {{ p.label }}
        <span class="chip-n num">{{ presetCount(p.value) }}</span>
      </button>
    </div>

    <AsyncSection
      :loading="loading"
      :error="error"
      :empty="items.length === 0"
      :empty-text="
        q.status
          ? '이 단계에 해당하는 신고가 없습니다.'
          : '접수된 신고가 없습니다. 문제 내용에 오류가 있으면 사용자가 앱에서 신고할 수 있습니다.'
      "
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
                <StatusBadge :tone="reportStatusMeta(r.status_cd).tone">
                  {{ reportStatusMeta(r.status_cd).label }}
                </StatusBadge>
                <span class="meta num">{{ r.reporter_name }} · {{ dateTime(r.created_at) }}</span>
              </div>
              <p v-if="r.detail" class="detail">{{ r.detail }}</p>

              <!-- 처리 기록은 신고 바로 아래에 둔다. 별도 화면으로 빼면
                   "이 신고 어떻게 됐더라"를 확인하는 데 한 번 더 이동해야 한다. -->
              <p v-if="r.handled_at" class="handled">
                {{ r.handler_name || '(알 수 없음)' }} · {{ dateTime(r.handled_at) }}
                <span v-if="r.resolution_txt" class="handled-note">— {{ r.resolution_txt }}</span>
              </p>

              <div class="actions">
                <button
                  v-if="r.status_cd !== 'DOING'"
                  class="btn btn-sm"
                  type="button"
                  :disabled="saving"
                  @click="quickSet(r, 'DOING')"
                >
                  확인 중
                </button>
                <button
                  v-if="r.status_cd !== 'RESOLVED'"
                  class="btn btn-sm"
                  type="button"
                  :disabled="saving"
                  @click="openReview(r, 'RESOLVED')"
                >
                  처리 완료
                </button>
                <button
                  v-if="r.status_cd !== 'REJECTED'"
                  class="btn btn-sm"
                  type="button"
                  :disabled="saving"
                  @click="openReview(r, 'REJECTED')"
                >
                  반려
                </button>
                <button
                  v-if="r.status_cd !== 'OPEN'"
                  class="btn btn-ghost btn-sm"
                  type="button"
                  :disabled="saving"
                  @click="quickSet(r, 'OPEN')"
                >
                  되돌리기
                </button>
              </div>
            </li>
          </ul>
        </article>
      </div>
    </AsyncSection>

    <AppDialog
      :open="reviewing !== null"
      :title="reviewStatus === 'REJECTED' ? '신고 반려' : '신고 처리 완료'"
      :confirm-text="reviewStatus === 'REJECTED' ? '반려' : '완료로 표시'"
      :busy="saving"
      @confirm="confirmReview"
      @close="reviewing = null"
    >
      <p class="callout callout-info review-why">
        <template v-if="reviewStatus === 'REJECTED'">
          반려하면 이 신고는 처리 목록에서 빠집니다. 왜 그렇게 판단했는지 남겨야
          같은 신고가 다시 올라왔을 때 앞사람의 판단을 되짚을 수 있습니다.
        </template>
        <template v-else>
          문제를 고쳤거나 지웠다면 완료로 표시합니다. 무엇을 했는지 한 줄 남겨두면
          다음 담당자가 같은 문제를 다시 확인하지 않습니다.
        </template>
      </p>

      <label class="field">
        <span class="label">
          처리 메모<span v-if="needsReason" class="required">필수</span>
          <span class="counter" :class="{ over: resolutionLen > RESOLUTION_MAX }">
            {{ resolutionLen }} / {{ RESOLUTION_MAX }}
          </span>
        </span>
        <textarea
          v-model="resolution"
          class="input area"
          rows="3"
          maxlength="600"
          :placeholder="
            reviewStatus === 'REJECTED' ? '예) 원문 확인 결과 오류가 아님' : '예) 해설 문구 수정'
          "
        ></textarea>
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
  align-items: center;
  gap: 8px;
}
.reason {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}
.meta {
  margin-left: auto;
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

/* 처리 기록 — 신고 본문보다 한 단계 옅게. 이미 끝난 일이라 먼저 읽힐 필요가 없다. */
.handled {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--ink-4);
  line-height: 1.5;
}
.handled-note {
  color: var(--ink-3);
}

/* 처리 버튼은 늘 보인다.
   표의 hover 규칙(줄 위에서만 나타남)을 여기 적용하지 않는 이유 — 이 목록은
   훑어보는 표가 아니라 한 건씩 판단하는 작업 목록이고, 항목 수가 적다.
   숨기면 터치 기기에서 닿기 어렵고, 무엇을 할 수 있는지도 보이지 않는다. */
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.review-why {
  margin: 0 0 14px;
}
.required {
  margin-left: 5px;
  padding: 0 4px;
  border-radius: var(--r-1);
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 10px;
  font-weight: 700;
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
  min-height: 72px;
  font-family: inherit;
  line-height: 1.6;
}
</style>
