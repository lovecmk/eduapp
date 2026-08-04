<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { api } from '../api/client';
import type { Announcement, AudienceKind, LabelCount } from '../api/types';
import { audienceLabel, dateTime, num } from '../lib/format';
import AsyncSection from '../components/AsyncSection.vue';
import AppIcon from '../components/AppIcon.vue';
import AppDialog from '../components/AppDialog.vue';
import { toast } from '../lib/toast';

/**
 * 공지 센터.
 *
 * 공지는 **되돌릴 수 없는 발송**이다. 그래서 이 화면은 두 가지에 답한다.
 *
 *  1. 보내기 전 — 이게 몇 명에게 가는가. 대상 규모를 모른 채 누르면
 *     조직 이름 오타 하나로 0명에게 보내거나, 전체인 줄 모르고 수천 명을 깨운다.
 *  2. 보낸 뒤 — 무엇을 언제 누구에게 보냈는가. 기록이 없으면 "그 안내
 *     보냈나요?"에 아무도 답할 수 없고, 결국 같은 공지를 두 번 보낸다.
 *
 * 예전에는 이 기능이 신고 화면 구석의 다이얼로그 하나였다. 대상은 '전체'
 * 하나뿐이었고 보낸 기록은 어디에도 남지 않았다.
 */

const items = ref<Announcement[]>([]);
const orgs = ref<LabelCount[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    items.value = await api.announcements(50);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '발송 이력을 불러오지 못했습니다';
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await load();
  // 조직 목록은 없어도 화면이 도는 보조 데이터다 — 실패해도 조용히 넘어간다
  // (대상 고르기에서 '조직'만 비어 보이고 나머지는 그대로 쓸 수 있다).
  try {
    orgs.value = await api.orgs();
  } catch {
    /* 무시 */
  }
});

// ── 작성 ─────────────────────────────────────────────────────────────────────

const composeOpen = ref(false);
const title = ref('');
const body = ref('');
const typeCd = ref('SYSTEM');
const audience = ref<AudienceKind>('ALL');
const audienceValue = ref('');
const pushYn = ref(false);
const sending = ref(false);

const TYPES = [
  { value: 'SYSTEM', label: '시스템 안내' },
  { value: 'NEW', label: '새 콘텐츠' },
  { value: 'REMIND', label: '학습 알림' },
  { value: 'ACHIEVEMENT', label: '성취' },
];

const AUDIENCES: { value: AudienceKind; label: string; hint: string }[] = [
  { value: 'ALL', label: '전체', hint: '활성 계정 전원' },
  { value: 'ORG', label: '조직', hint: '같은 소속에게만' },
  { value: 'MEMBERSHIP', label: '등급', hint: 'BASIC / PREMIUM / VIP' },
  { value: 'ROLE', label: '권한', hint: '일반 / 관리자' },
];

const MEMBERSHIPS = ['BASIC', 'PREMIUM', 'VIP'];
const ROLES = [
  { value: 'USER', label: '일반 사용자' },
  { value: 'ADMIN', label: '관리자' },
];

/** 값이 필요한 대상 방식인가(전체는 값이 없다). */
const needsValue = computed(() => audience.value !== 'ALL');

// 글자 수는 '쓴 만큼 / 최대' 로 보여 준다.
// 남은 수만 적으면 "50" 이 쓴 글자인지 남은 글자인지 알 수 없다.
// [...str] 로 세는 것은 이모지·한글 조합을 코드 단위가 아니라 글자 단위로 세기 위해서다.
const TITLE_MAX = 60;
const BODY_MAX = 500;
const titleLen = computed(() => [...title.value].length);
const bodyLen = computed(() => [...body.value].length);

/** 서버가 세어 준 대상 규모. null 이면 아직 확인 전. */
const preview = ref<{ count: number; label: string } | null>(null);
const previewError = ref<string | null>(null);
const previewing = ref(false);

const canSend = computed(
  () =>
    title.value.trim().length > 0 &&
    titleLen.value <= TITLE_MAX &&
    bodyLen.value <= BODY_MAX &&
    (!needsValue.value || audienceValue.value !== '') &&
    !sending.value,
);

function openCompose(): void {
  title.value = '';
  body.value = '';
  typeCd.value = 'SYSTEM';
  audience.value = 'ALL';
  audienceValue.value = '';
  pushYn.value = false;
  preview.value = null;
  previewError.value = null;
  composeOpen.value = true;
  void refreshPreview();
}

/**
 * 대상이 바뀔 때마다 규모를 다시 센다.
 *
 * 세는 일을 서버에 맡기는 이유 — 화면이 사용자 목록을 받아 와 세면 상한에
 * 걸린 수(예: 50)를 전체로 착각한다. 실제로 발송 대상을 고르는 것과 같은
 * 코드가 세야 "미리보기 12명, 실제 발송 40명" 같은 어긋남이 생기지 않는다.
 */
async function refreshPreview(): Promise<void> {
  if (needsValue.value && audienceValue.value === '') {
    preview.value = null;
    previewError.value = null;
    return;
  }
  previewing.value = true;
  previewError.value = null;
  try {
    preview.value = await api.audiencePreview(audience.value, audienceValue.value);
  } catch (e) {
    preview.value = null;
    previewError.value = e instanceof Error ? e.message : '대상을 확인하지 못했습니다';
  } finally {
    previewing.value = false;
  }
}

watch([audience, audienceValue], () => {
  // 대상 방식을 바꾸면 앞서 고른 값은 뜻이 달라진다 — 비우고 다시 고르게 한다.
  void refreshPreview();
});

function onAudienceChange(next: AudienceKind): void {
  audience.value = next;
  audienceValue.value = '';
}

async function send(): Promise<void> {
  if (!canSend.value) return;
  sending.value = true;
  try {
    const res = await api.announce({
      title_txt: title.value.trim(),
      desc_txt: body.value.trim(),
      type_cd: typeCd.value,
      audience_cd: audience.value,
      audience_value: audienceValue.value,
      push_yn: pushYn.value,
    });
    composeOpen.value = false;
    toast.success(`${num(res.sent)}명에게 공지를 보냈습니다`);
    await load();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '공지를 보내지 못했습니다');
  } finally {
    sending.value = false;
  }
}

/** 이력의 대상 설명 — 발송 시점에 얼려 둔 라벨이 있으면 그것을 먼저 쓴다. */
function targetOf(a: Announcement): string {
  if (a.audience_label) return a.audience_label;
  return a.audience_value ? `${audienceLabel(a.audience_cd)} ${a.audience_value}` : audienceLabel(a.audience_cd);
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">공지</h1>
        <p class="page-sub">
          앱 안 알림으로 전달됩니다. 보낸 공지는 되돌릴 수 없으므로 발송 기록을 함께 남깁니다.
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
      empty-text="아직 보낸 공지가 없습니다. 점검·교육 일정처럼 모두가 알아야 하는 내용을 보낼 수 있습니다."
      :on-retry="load"
    >
      <div class="panel">
        <div class="panel-head">
          <h2 class="panel-title">발송 이력</h2>
          <span class="panel-meta num">{{ num(items.length) }}건</span>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>제목</th>
                <th class="col-target">대상</th>
                <th class="col-n">수신</th>
                <th class="col-who">보낸 사람</th>
                <th class="col-when">발송 시각</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in items" :key="a.id">
                <td>
                  <div class="title-cell">
                    <span class="ann-title">{{ a.title_txt }}</span>
                    <span v-if="a.push_yn" class="badge badge-info">푸시</span>
                  </div>
                  <p v-if="a.desc_txt" class="ann-body">{{ a.desc_txt }}</p>
                </td>
                <td class="col-target">{{ targetOf(a) }}</td>
                <td class="col-n num">{{ num(a.recipients) }}</td>
                <td class="col-who">{{ a.actor_name || '—' }}</td>
                <td class="col-when num">{{ dateTime(a.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
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
      <!-- 경고가 대상 규모를 그대로 말한다. "정말 하시겠습니까?" 는 아무 정보가 없다. -->
      <p class="callout compose-warn" :class="pushYn ? 'callout-danger' : 'callout-warn'">
        <template v-if="previewing">대상을 확인하는 중…</template>
        <template v-else-if="previewError">{{ previewError }}</template>
        <template v-else-if="preview">
          <strong>{{ preview.label }} · {{ num(preview.count) }}명</strong>에게 즉시 전달되며
          되돌릴 수 없습니다.
          <template v-if="pushYn"> 기기 푸시 알림도 함께 울립니다.</template>
        </template>
        <template v-else>받을 대상을 골라주세요.</template>
      </p>

      <div class="field">
        <span class="label">받는 대상</span>
        <div class="chips audience-chips">
          <button
            v-for="a in AUDIENCES"
            :key="a.value"
            class="chip"
            :class="{ on: audience === a.value }"
            type="button"
            :title="a.hint"
            @click="onAudienceChange(a.value)"
          >
            {{ a.label }}
          </button>
        </div>
      </div>

      <!-- 조직은 목록에서 고른다. 자유 입력이면 "영업2팀"으로 보내려다
           아무도 없는 "영업 2팀"에 보내는 사고가 난다. -->
      <label v-if="audience === 'ORG'" class="field">
        <span class="label">조직</span>
        <select v-model="audienceValue" class="input">
          <option value="" disabled>조직을 고르세요</option>
          <option v-for="o in orgs" :key="o.label" :value="o.label">
            {{ o.label }} ({{ num(o.count) }}명)
          </option>
        </select>
        <span v-if="orgs.length === 0" class="hint">등록된 조직이 없습니다.</span>
      </label>

      <label v-if="audience === 'MEMBERSHIP'" class="field">
        <span class="label">등급</span>
        <select v-model="audienceValue" class="input">
          <option value="" disabled>등급을 고르세요</option>
          <option v-for="m in MEMBERSHIPS" :key="m" :value="m">{{ m }}</option>
        </select>
      </label>

      <label v-if="audience === 'ROLE'" class="field">
        <span class="label">권한</span>
        <select v-model="audienceValue" class="input">
          <option value="" disabled>권한을 고르세요</option>
          <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
        </select>
      </label>

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

      <!-- 푸시는 기본이 꺼짐이다. 앱 안 알림은 사용자가 열 때 보지만,
           푸시는 자는 사람도 깨운다 — 그 차이를 기본값으로 존중한다. -->
      <label class="field check-field">
        <input v-model="pushYn" type="checkbox" />
        <span>
          <span class="check-title">기기 푸시도 함께 보내기</span>
          <span class="hint">앱을 켜지 않아도 알림이 울립니다. 급한 안내에만 사용하세요.</span>
        </span>
      </label>
    </AppDialog>
  </div>
</template>

<style scoped>
.head-actions {
  display: flex;
  gap: 6px;
}

.title-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.ann-title {
  font-weight: 600;
  color: var(--ink);
}
/* 본문은 두 줄까지만. 표는 훑어보는 곳이고, 전문은 발송 전 다이얼로그에서 이미 봤다. */
.ann-body {
  margin: 3px 0 0;
  font-size: 11.5px;
  color: var(--ink-3);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.col-n {
  text-align: right;
  white-space: nowrap;
}
.col-target,
.col-who {
  white-space: nowrap;
}
.col-when {
  white-space: nowrap;
  color: var(--ink-3);
}

.compose-warn {
  margin: 0 0 14px;
}
.audience-chips {
  margin-bottom: 0;
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
.hint {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  color: var(--ink-4);
  line-height: 1.5;
}

/* 체크박스는 라벨 전체가 눌리게 둔다 — 12px 사각형만 맞히게 하면 손이 아프다. */
.check-field {
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
}
.check-field input {
  margin-top: 2px;
  accent-color: var(--accent);
}
.check-title {
  display: block;
  font-size: 12.5px;
  color: var(--ink);
}

@media (max-width: 900px) {
  /* 좁은 화면에서는 보낸 사람까지 볼 자리가 없다 — 이력의 핵심은 무엇을·누구에게다. */
  .col-who {
    display: none;
  }
}
</style>
