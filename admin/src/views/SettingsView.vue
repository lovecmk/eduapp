<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { api } from '../api/client';
import type { NoticeLevel, OpsSettings, SettingsPatch } from '../api/types';
import { dateTime } from '../lib/format';
import { changedFields, toDraft } from '../lib/settings';
import { setMaintenance } from '../stores/alerts';
import AsyncSection from '../components/AsyncSection.vue';
import AppIcon from '../components/AppIcon.vue';
import AppDialog from '../components/AppDialog.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { toast } from '../lib/toast';

/**
 * 운영 설정.
 *
 * 여기 있는 값들의 공통점은 **재배포 없이 지금 당장 바꿔야 하는 것**이라는 점이다.
 * 환경변수로 두면 바꾸는 데 재기동이 필요하고, 재기동은 현장에서 학습 중인
 * 사용자의 세션을 끊는다. 게다가 누가 언제 바꿨는지가 남지 않는다.
 *
 * ── 화면을 이렇게 나눈 이유 ──────────────────────────────────────────────
 * 위험도 순으로 쌓았다. 맨 위가 서비스를 통째로 닫는 점검 모드, 그다음이
 * 신규 유입만 막는 가입 차단, 아래로 갈수록 되돌리기 쉬운 값이다.
 * 위험한 것을 아래 숨기면 스크롤 없이 보이는 화면이 실제 위험도를 속인다.
 *
 * ── 왜 '바꾼 것만' 보내는가 ──────────────────────────────────────────────
 * 전체를 보내면 화면이 열릴 때 받은 낡은 값이 남의 변경을 덮는다. 공지 문구를
 * 고치는 사이 다른 관리자가 점검 모드를 켰다면, 통째로 저장하는 순간 그것이 꺼진다.
 */

const settings = ref<OpsSettings | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const saving = ref(false);

/** 화면에서 편집 중인 값(저장 전). 저장에 성공해야 settings 로 확정된다. */
const draft = ref<SettingsPatch>({});

const NOTICE_LEVELS: { value: NoticeLevel; label: string; hint: string }[] = [
  { value: 'INFO', label: '안내', hint: '알아 두면 좋은 소식' },
  { value: 'WARN', label: '주의', hint: '일정 변경·지연처럼 영향이 있는 것' },
  { value: 'DANGER', label: '경고', hint: '지금 조치가 필요한 것' },
];

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const s = await api.settings();
    settings.value = s;
    draft.value = toDraft(s);
    setMaintenance(s.maintenance_yn);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '설정을 불러오지 못했습니다';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/** 저장 전과 달라진 필드만 골라낸다(계산 규칙은 lib/settings 에 한 벌만 둔다). */
const changed = computed<SettingsPatch>(() =>
  settings.value ? changedFields(settings.value, draft.value) : {},
);

const dirty = computed(() => Object.keys(changed.value).length > 0);

/** 점검 모드를 새로 켜는 변경인가 — 유일하게 확인을 한 번 더 받는 동작이다. */
const turningMaintenanceOn = computed(
  () => changed.value.maintenance_yn === true,
);

const confirmOpen = ref(false);

function onSave(): void {
  if (!dirty.value || saving.value) return;
  // 서비스를 통째로 닫는 것은 되돌릴 수 있어도 그 사이 사용자가 전부 막힌다 —
  // 맥락을 끊고 한 번 더 붙잡는다(DESIGN.md 의 모달 규칙).
  if (turningMaintenanceOn.value) {
    confirmOpen.value = true;
    return;
  }
  void save();
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    const updated = await api.updateSettings(changed.value);
    settings.value = updated;
    draft.value = toDraft(updated);
    // 상단 바를 곧바로 맞춘다 — 폴링(2분)을 기다리면 방금 켠 점검이
    // 한동안 안 떠서 "정말 켜졌나?" 를 확인할 방법이 없다.
    setMaintenance(updated.maintenance_yn);
    toast.success('운영 설정을 저장했습니다');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '저장하지 못했습니다');
  } finally {
    saving.value = false;
    confirmOpen.value = false;
  }
}

function reset(): void {
  void load();
}

// 출제량의 한계 — 서버(domain.MinDailyCardsAllowed/Max)와 같은 값이어야 한다.
// 여기서만 더 넓게 열어 두면 저장은 되고 서버가 조용히 자르는, 설명할 수 없는
// 동작이 된다(관리자는 20을 넣었는데 10으로 돌아간다).
const MIN_CARDS = 1;
const MAX_CARDS = 10;

/**
 * 지금 범위로 각 난이도에 몇 문제가 나가는지.
 *
 * 서버의 countForDifficulty 와 같은 규칙이다. 숫자 두 개만 보여 주면
 * "그래서 오늘 몇 문제가 나가지?"에 답할 수 없어, 관리자가 값을 넣어 보고
 * 앱을 열어 확인하게 된다.
 */
const countPreview = computed(() => {
  const lo = Math.min(draft.value.daily_min_cards ?? 3, draft.value.daily_max_cards ?? 5);
  const hi = Math.max(draft.value.daily_min_cards ?? 3, draft.value.daily_max_cards ?? 5);
  const mid = Math.floor((lo + hi) / 2) + ((lo + hi) % 2 === 1 ? 1 : 0);
  return [
    { label: '쉬움', count: hi },
    { label: '보통', count: Math.min(hi, Math.max(lo, mid)) },
    { label: '어려움', count: lo },
  ];
});

const NOTICE_MAX = 200;
const noticeLen = computed(() => [...(draft.value.notice_txt ?? '')].length);
const maintenanceMsgLen = computed(() => [...(draft.value.maintenance_msg ?? '')].length);
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">운영 설정</h1>
        <p class="page-sub">
          재배포 없이 즉시 반영됩니다. 모든 변경은 관리 이력에 남습니다.
        </p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost btn-sm" type="button" :disabled="!dirty || saving" @click="reset">
          되돌리기
        </button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="!dirty || saving" @click="onSave">
          <AppIcon name="check" :size="14" />
          {{ saving ? '저장 중…' : '저장' }}
        </button>
      </div>
    </header>

    <AsyncSection :loading="loading" :error="error" :empty="false" :on-retry="load">
      <div v-if="settings" class="stack">
        <!-- 1. 서비스 개폐 — 가장 위험한 것을 가장 위에. -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">서비스 개폐</h2>
            <StatusBadge :tone="draft.maintenance_yn ? 'danger' : 'ok'" :pulse="draft.maintenance_yn">
              {{ draft.maintenance_yn ? '점검 중' : '정상 운영' }}
            </StatusBadge>
          </div>

          <div class="rows">
            <label class="row">
              <span class="row-text">
                <span class="row-title">점검 모드</span>
                <span class="row-desc">
                  켜면 일반 사용자의 모든 요청이 막힙니다(503). 관리 콘솔과 로그인은
                  그대로 열려 있어, 켠 뒤에도 여기서 되돌릴 수 있습니다.
                </span>
              </span>
              <input v-model="draft.maintenance_yn" class="row-switch" type="checkbox" />
            </label>

            <!-- 안내 문구는 점검 모드를 켤 때만 뜻이 있다. 늘 보이면
                 지금 무엇이 켜져 있는지가 흐려진다. -->
            <label v-if="draft.maintenance_yn" class="row row-stack">
              <span class="row-text">
                <span class="row-title">
                  안내 문구
                  <span class="counter" :class="{ over: maintenanceMsgLen > NOTICE_MAX }">
                    {{ maintenanceMsgLen }} / {{ NOTICE_MAX }}
                  </span>
                </span>
                <span class="row-desc">
                  사용자가 앱에서 보게 될 문구입니다. 비워 두면 기본 안내가 나갑니다 —
                  이유를 적어야 문의가 줄어듭니다.
                </span>
              </span>
              <input
                v-model="draft.maintenance_msg"
                class="input"
                type="text"
                maxlength="240"
                placeholder="예) 설비 교체로 오후 3시까지 점검 중입니다"
              />
            </label>

            <label class="row">
              <span class="row-text">
                <span class="row-title">신규 가입 받기</span>
                <span class="row-desc">
                  끄면 회원가입만 막힙니다. 기존 사용자는 그대로 학습할 수 있습니다 —
                  정원이 찼거나 계정을 수동 발급할 때 씁니다.
                </span>
              </span>
              <input v-model="draft.signup_enabled" class="row-switch" type="checkbox" />
            </label>
          </div>
        </section>

        <!-- 2. 출제 정책 -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">출제 정책</h2>
            <span class="panel-meta">사람마다 · 날마다 새로 편성</span>
          </div>
          <div class="rows">
            <div class="row">
              <span class="row-text">
                <span class="row-title">하루 출제량</span>
                <span class="row-desc">
                  정확한 장수는 <strong>그날 그 사람의 난이도</strong>가 정합니다 —
                  쉬운 날은 최대치, 어려운 날은 최소치. 한 장에 드는 시간이 다르므로
                  개수를 고정하면 '하루 3분'이 날마다 3분도 10분도 됩니다.
                  복습에는 상한이 없습니다.
                </span>
              </span>
              <span class="range-input">
                <input
                  v-model.number="draft.daily_min_cards"
                  class="input num"
                  type="number"
                  :min="MIN_CARDS"
                  :max="MAX_CARDS"
                  aria-label="최소 출제량"
                />
                <span class="tilde" aria-hidden="true">~</span>
                <input
                  v-model.number="draft.daily_max_cards"
                  class="input num"
                  type="number"
                  :min="MIN_CARDS"
                  :max="MAX_CARDS"
                  aria-label="최대 출제량"
                />
                <span class="unit">문제</span>
              </span>
            </div>

            <!-- 지금 설정이 실제로 어떻게 나가는지 바로 보여 준다.
                 숫자 두 개만 있으면 "그래서 오늘 몇 문제가 나가지?"를 알 수 없다. -->
            <div class="row preview-row">
              <span class="row-text">
                <span class="row-title">이 설정으로 나가는 분량</span>
              </span>
              <span class="preview">
                <span v-for="p in countPreview" :key="p.label" class="preview-item">
                  <span class="preview-label">{{ p.label }}</span>
                  <span class="preview-n num">{{ p.count }}문제</span>
                </span>
              </span>
            </div>

            <label class="row">
              <span class="row-text">
                <span class="row-title">난이도 자동 조절</span>
                <span class="row-desc">
                  그동안의 학습 기록(기억 상자·되돌아간 횟수)으로 그 사람에게 맞는
                  난이도를 정합니다. 끄면 모두에게 쉬운 문제만 나갑니다 —
                  교육 과정이 순서를 강제하거나 콘텐츠가 한 난이도에 몰려 있을 때 씁니다.
                </span>
              </span>
              <input v-model="draft.adaptive_difficulty" class="row-switch" type="checkbox" />
            </label>
          </div>
        </section>

        <!-- 3. 공지 배너 — 되돌리기 가장 쉬운 것이 맨 아래. -->
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">공지 배너</h2>
            <span class="panel-meta">앱 상단에 항상 표시</span>
          </div>
          <div class="rows">
            <label class="row row-stack">
              <span class="row-text">
                <span class="row-title">
                  문구
                  <span class="counter" :class="{ over: noticeLen > NOTICE_MAX }">
                    {{ noticeLen }} / {{ NOTICE_MAX }}
                  </span>
                </span>
                <span class="row-desc">
                  비우면 배너가 내려갑니다. 한 줄로 읽히지 않으면 아무도 읽지 않습니다 —
                  긴 내용은 공지 발송을 쓰세요.
                </span>
              </span>
              <input
                v-model="draft.notice_txt"
                class="input"
                type="text"
                maxlength="240"
                placeholder="예) 이번 주 금요일 안전교육이 있습니다"
              />
            </label>

            <div class="row row-stack">
              <span class="row-text">
                <span class="row-title">단계</span>
                <span class="row-desc">배너의 색과 세기를 정합니다.</span>
              </span>
              <div class="chips level-chips">
                <button
                  v-for="lv in NOTICE_LEVELS"
                  :key="lv.value"
                  class="chip"
                  :class="{ on: draft.notice_level === lv.value }"
                  type="button"
                  :title="lv.hint"
                  @click="draft.notice_level = lv.value"
                >
                  {{ lv.label }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <p v-if="settings.updated_at" class="last-change">
          마지막 변경 · {{ settings.updated_by_name || '알 수 없음' }} ·
          {{ dateTime(settings.updated_at) }}
        </p>
      </div>
    </AsyncSection>

    <AppDialog
      :open="confirmOpen"
      title="점검 모드를 켭니다"
      confirm-text="점검 모드 켜기"
      danger
      :busy="saving"
      @confirm="save"
      @close="confirmOpen = false"
    >
      <p class="confirm-body">
        지금 학습 중인 사용자를 포함해 <strong>모든 일반 사용자의 요청이 막힙니다.</strong>
        관리 콘솔과 로그인은 계속 열려 있으므로 여기서 다시 끌 수 있습니다.
      </p>
      <p v-if="draft.maintenance_msg" class="confirm-msg">
        사용자에게 보일 문구 — “{{ draft.maintenance_msg }}”
      </p>
      <p v-else class="callout callout-warn confirm-msg">
        안내 문구가 비어 있습니다. 기본 문구가 나가며, 사용자는 왜 막혔는지 알 수 없습니다.
      </p>
    </AppDialog>
  </div>
</template>

<style scoped>
.head-actions {
  display: flex;
  gap: 6px;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 설정 항목 사이 1px 머리카락선 — 테두리 대신 배경 틈으로 만든다
   (신고 목록과 같은 방식이라 두 화면이 같은 시스템으로 읽힌다). */
.rows {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--line);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  background: var(--surface);
}
/* 입력이 넓어야 하는 항목은 설명 아래로 내려 한 줄을 통째로 쓴다. */
.row-stack {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.row-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.row-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}
.row-desc {
  font-size: 11.5px;
  color: var(--ink-3);
  line-height: 1.55;
  max-width: 62ch;
}

.row-switch {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}

.range-input {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.range-input .input {
  width: 64px;
  text-align: right;
}
.tilde {
  color: var(--ink-4);
  font-size: 12px;
}

/* 설정이 실제로 어떻게 나가는지 — 값이 아니라 결과를 보여 준다. */
.preview-row {
  background: var(--surface-2);
}
.preview {
  display: flex;
  gap: 14px;
  flex-shrink: 0;
}
.preview-item {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}
.preview-label {
  font-size: 10.5px;
  color: var(--ink-4);
}
.preview-n {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}
.unit {
  font-size: 12px;
  color: var(--ink-3);
}

.level-chips {
  margin-bottom: 0;
}

.counter {
  margin-left: 6px;
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 400;
  color: var(--ink-4);
}
.counter.over {
  color: var(--danger);
  font-weight: 600;
}

.last-change {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--ink-4);
}

.confirm-body {
  margin: 0 0 10px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--ink-2);
}
.confirm-msg {
  margin: 0;
  font-size: 12px;
  color: var(--ink-3);
  line-height: 1.6;
}

@media (max-width: 640px) {
  /* 좁은 화면에서는 설명과 컨트롤이 한 줄에 들어가지 않는다. */
  .row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .range-input {
    justify-content: flex-end;
  }
}
</style>
