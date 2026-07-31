<script setup lang="ts">
import { computed, watch } from 'vue';
import { api } from '../api/client';
import type { UserDetail } from '../api/types';
import { useAsync } from '../composables/useAsync';
import { useUserActions } from '../composables/useUserActions';
import { num, pct, dateTime, statusLabel } from '../lib/format';
import AppDrawer from './AppDrawer.vue';
import AppDialog from './AppDialog.vue';
import AsyncSection from './AsyncSection.vue';
import StatusBadge from './StatusBadge.vue';

/**
 * 목록에서 한 사람을 훑어보는 서랍.
 *
 * 전체 상세 화면(/users/:id)과 무엇이 다른가 — 담는 양이 다르다.
 * 여기서 답하는 질문은 **"이 사람 맞나?"** 하나다. 목록을 훑다가 이름 하나를
 * 확인하고 다음으로 넘어가는 흐름을 끊지 않는 것이 목적이므로, 계정 정보와
 * 학습 진행까지만 둔다.
 *
 * 학습 진단처럼 오래 들여다보는 것은 전체 화면이 맡는다. 서랍에 다 넣으면
 * 결국 좁은 화면 안에 상세 화면을 한 벌 더 만들게 되고, 두 벌이 서로 어긋난다.
 * 그래서 아래에 '전체 상세 열기'를 두고 넘긴다.
 *
 * 되돌릴 수 없는 동작(정지·권한 해제)은 서랍 안에서 바로 실행하지 않는다.
 * 서랍은 가볍게 닫히는 곳이라 — 바깥을 누르기만 해도 닫힌다 — 그 위에서
 * 곧바로 실행되는 파괴적 동작은 위험하다. 모달로 한 번 더 붙잡는다.
 */

const props = defineProps<{ userId: string | null }>();
const emit = defineEmits<{ close: []; changed: [] }>();

const detail = useAsync<UserDetail>(() => api.user(props.userId ?? ''));

const user = computed(() => detail.data.value?.user ?? null);
const learning = computed(() => detail.data.value?.learning ?? null);

const { pending, saving, askRole, askStatus, confirm, cancel } = useUserActions(async () => {
  await detail.run();
  // 목록의 그 줄도 함께 갱신돼야 한다 — 서랍에서 정지했는데 뒤의 목록이
  // '활성'인 채로 남아 있으면 어느 쪽이 맞는지 알 수 없다.
  emit('changed');
});

watch(
  () => props.userId,
  (id) => {
    if (!id) return;
    // 이전 사람의 정보가 잠깐 보이지 않도록 비우고 새로 받는다.
    detail.data.value = null;
    void detail.run();
  },
  { immediate: true },
);

const learnTotal = computed(() => {
  const l = learning.value;
  return l ? l.new + l.learning + l.mastered : 0;
});
function share(v: number): string {
  return learnTotal.value === 0 ? '0%' : `${(v / learnTotal.value) * 100}%`;
}

const statusTone = computed(() => {
  const cd = user.value?.status_cd ?? '';
  if (cd === 'A' || cd === '') return 'ok' as const;
  return cd === 'I' ? ('warn' as const) : ('danger' as const);
});

const active = computed(() => {
  const cd = user.value?.status_cd ?? '';
  return cd === 'A' || cd === '';
});
</script>

<template>
  <AppDrawer
    :open="userId !== null"
    eyebrow="사용자"
    :title="user?.user_nm || '사용자'"
    @close="emit('close')"
  >
    <template #head>
      <StatusBadge v-if="user?.role_cd === 'ADMIN'" tone="accent" dotless>관리자</StatusBadge>
      <StatusBadge v-if="user" :tone="statusTone">{{ statusLabel(user.status_cd) }}</StatusBadge>
    </template>

    <AsyncSection
      :loading="detail.loading.value"
      :error="detail.error.value"
      :empty="!user"
      :skeleton-rows="5"
      :on-retry="() => void detail.run()"
    >
      <section class="drawer-section">
        <h3 class="section-title">계정</h3>
        <dl class="kv">
          <div><dt>아이디</dt><dd class="num">{{ user!.login_id }}</dd></div>
          <div><dt>이메일</dt><dd class="num break">{{ user!.email_addr || '—' }}</dd></div>
          <div>
            <dt>소속 · 직무</dt>
            <dd>{{ [user!.org_nm, user!.job_title].filter(Boolean).join(' · ') || '—' }}</dd>
          </div>
          <div><dt>가입</dt><dd class="num">{{ dateTime(user!.created_at) }}</dd></div>
        </dl>
      </section>

      <section class="drawer-section">
        <h3 class="section-title">학습 진행 · 완료율 {{ pct(learning?.rate) }}</h3>
        <div
          class="stack"
          role="img"
          :aria-label="`완료 ${learning?.mastered ?? 0}, 학습 중 ${learning?.learning ?? 0}, 미시작 ${learning?.new ?? 0}`"
        >
          <span class="seg s-done" :style="{ width: share(learning?.mastered ?? 0) }" />
          <span class="seg s-doing" :style="{ width: share(learning?.learning ?? 0) }" />
          <span class="seg s-todo" :style="{ width: share(learning?.new ?? 0) }" />
        </div>
        <ul class="legend">
          <li><span class="sw s-done" />완료<b class="num">{{ num(learning?.mastered) }}</b></li>
          <li><span class="sw s-doing" />학습 중<b class="num">{{ num(learning?.learning) }}</b></li>
          <li><span class="sw s-todo" />미시작<b class="num">{{ num(learning?.new) }}</b></li>
        </ul>
        <p v-if="learnTotal === 0" class="hint">아직 학습 기록이 없는 계정입니다.</p>
      </section>

      <section class="drawer-section">
        <h3 class="section-title">빠른 처리</h3>
        <div class="row">
          <button
            v-if="active"
            class="btn btn-sm btn-danger"
            type="button"
            :disabled="saving"
            @click="askStatus(user!, 'I')"
          >
            계정 정지
          </button>
          <button
            v-else
            class="btn btn-sm"
            type="button"
            :disabled="saving"
            @click="askStatus(user!, 'A')"
          >
            계정 활성화
          </button>

          <button
            v-if="user!.role_cd !== 'ADMIN'"
            class="btn btn-sm"
            type="button"
            :disabled="saving"
            @click="askRole(user!, 'ADMIN')"
          >
            관리자로 승격
          </button>
          <button
            v-else
            class="btn btn-sm btn-danger"
            type="button"
            :disabled="saving"
            @click="askRole(user!, 'USER')"
          >
            권한 해제
          </button>
        </div>
        <p class="hint">'삭제 처리'는 되돌리기 어려워 전체 상세에서만 할 수 있습니다.</p>
      </section>
    </AsyncSection>

    <template #foot>
      <RouterLink v-if="user" class="btn btn-sm" :to="`/users/${user.id}`">
        전체 상세 열기
      </RouterLink>
      <span class="grow" />
      <button class="btn btn-sm" type="button" @click="emit('close')">닫기</button>
    </template>
  </AppDrawer>

  <!-- 서랍 위에 겹쳐 뜬다. 스크롤 잠금이 서로 어긋나지 않는 이유는
       useOverlay 가 열린 개수를 세기 때문이다. -->
  <AppDialog
    :open="pending !== null"
    title="변경 확인"
    :danger="pending?.danger ?? false"
    confirm-text="변경"
    :busy="saving"
    @close="cancel"
    @confirm="confirm"
  >
    <p class="dlg-p">{{ pending?.message }}</p>
    <p class="hint">이 작업은 관리 이력에 기록됩니다.</p>
  </AppDialog>
</template>

<style scoped>
/* 이름-값 목록. 상세 화면의 것과 같은 모양이지만 서랍은 폭이 좁아
   좌우 여백을 줄인다. */
.kv {
  margin: 0;
}
.kv > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 28px;
  padding: 3px 0;
}
.kv > div + div {
  border-top: 1px solid var(--line);
}
.kv dt {
  color: var(--ink-3);
  font-size: 12px;
  flex-shrink: 0;
}
.kv dd {
  margin: 0;
  font-weight: 500;
  text-align: right;
  min-width: 0;
}
.break {
  word-break: break-all;
}

.stack {
  display: flex;
  gap: 2px;
  height: 8px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--surface-3);
}
.seg {
  min-width: 0;
}
.s-done {
  background: var(--viz-step-2);
}
.s-doing {
  background: var(--viz-step-1);
}
.s-todo {
  background: var(--viz-peer);
}

.legend {
  list-style: none;
  margin: 11px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.legend li {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--ink-2);
}
.legend b {
  margin-left: auto;
  color: var(--ink);
}
.sw {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}

.grow {
  flex: 1;
}

.dlg-p {
  margin: 0 0 8px;
}
</style>
