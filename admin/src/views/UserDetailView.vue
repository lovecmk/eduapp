<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api/client';
import type { UserDetail } from '../api/types';
import { useAsync } from '../composables/useAsync';
import { useUserActions } from '../composables/useUserActions';
import { num, pct, dateTime, statusLabel } from '../lib/format';
import AsyncSection from '../components/AsyncSection.vue';
import AppDialog from '../components/AppDialog.vue';
import AppIcon from '../components/AppIcon.vue';
import LearnerDiagnosisPanel from '../components/LearnerDiagnosisPanel.vue';
import TodayAssignmentPanel from '../components/TodayAssignmentPanel.vue';

/**
 * 사용자 상세 — 프로필 + 학습 진행 + 권한·상태 변경.
 *
 * 목록의 미리보기 서랍이 '이 사람이 누구인가'에 답한다면, 이 화면은
 * 학습 진단까지 펼쳐 놓고 **오래 들여다보는** 자리다.
 *
 * 권한·상태 변경의 확인 문구와 위험 판단은 useUserActions 에 있다 —
 * 목록의 빠른 동작과 한 벌을 나눠 쓴다. 같은 일을 두 화면이 다르게 물어보면
 * 안 된다.
 */

const route = useRoute();
const id = computed(() => String(route.params.id ?? ''));

const detail = useAsync<UserDetail>(() => api.user(id.value));

const user = computed(() => detail.data.value?.user ?? null);

const { pending, saving, askRole, askStatus, confirm, cancel } = useUserActions(() => detail.run());
const learning = computed(() => detail.data.value?.learning ?? null);

const learnTotal = computed(() => {
  const l = learning.value;
  return l ? l.new + l.learning + l.mastered : 0;
});
function share(v: number): string {
  return learnTotal.value === 0 ? '0%' : `${(v / learnTotal.value) * 100}%`;
}

onMounted(() => void detail.run());
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <RouterLink to="/users" class="back">
          <AppIcon name="arrow-left" :size="13" />
          사용자
        </RouterLink>
        <h1 class="page-title">{{ user?.user_nm || '사용자 상세' }}</h1>
        <p class="page-sub">계정 정보와 학습 진행을 확인하고 권한을 관리합니다</p>
      </div>
      <div v-if="user" class="row">
        <span v-if="user.role_cd === 'ADMIN'" class="badge badge-accent">관리자</span>
        <span
          class="badge"
          :class="
            user.status_cd === 'A' || user.status_cd === ''
              ? 'badge-ok'
              : user.status_cd === 'I'
                ? 'badge-warn'
                : 'badge-danger'
          "
        >
          {{ statusLabel(user.status_cd) }}
        </span>
      </div>
    </header>

    <AsyncSection
      :loading="detail.loading.value"
      :error="detail.error.value"
      :empty="!user"
      :skeleton-rows="6"
      :on-retry="() => void detail.run()"
    >
      <div class="grid grid-2">
        <section class="panel">
          <div class="panel-head"><h2 class="panel-title">계정 정보</h2></div>
          <dl class="kv">
            <div><dt>아이디</dt><dd class="num">{{ user!.login_id }}</dd></div>
            <div><dt>이름</dt><dd>{{ user!.user_nm || '—' }}</dd></div>
            <div><dt>닉네임</dt><dd>{{ user!.nickname || '—' }}</dd></div>
            <div><dt>이메일</dt><dd class="num break">{{ user!.email_addr || '—' }}</dd></div>
            <div><dt>소속</dt><dd>{{ user!.org_nm || '—' }}</dd></div>
            <div><dt>직무</dt><dd>{{ user!.job_title || '—' }}</dd></div>
            <div><dt>멤버십</dt><dd>{{ user!.membership_cd || '—' }}</dd></div>
            <div><dt>가입</dt><dd class="num">{{ dateTime(user!.created_at) }}</dd></div>
            <div><dt>내부 ID</dt><dd class="num muted break">{{ user!.id }}</dd></div>
          </dl>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title">학습 진행</h2>
            <span class="panel-note">완료율 {{ pct(learning?.rate) }}</span>
          </div>
          <div class="panel-body">
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
          </div>
        </section>

        <!-- 진단은 계정 정보·진행 바로 다음에 온다.
             권한·상태 변경보다 먼저 봐야 하는 정보다 — 관리자가 이 화면에 오는
             이유는 대개 '이 사람을 어떻게 도울까'이지 권한 조정이 아니다. -->
        <TodayAssignmentPanel v-if="user" :user-id="user.id" />

        <LearnerDiagnosisPanel v-if="user" :user-id="user.id" />

        <section class="panel">
          <div class="panel-head"><h2 class="panel-title">권한</h2></div>
          <div class="panel-body">
            <p class="desc">
              관리자는 전체 사용자 데이터 조회, 계정 상태 변경, 학습 문제 등록·수정·삭제를 할 수
              있습니다.
            </p>
            <div class="row">
              <button
                class="btn btn-sm"
                type="button"
                :disabled="user!.role_cd === 'ADMIN' || saving"
                @click="askRole(user!, 'ADMIN')"
              >
                관리자로 승격
              </button>
              <button
                class="btn btn-sm btn-danger"
                type="button"
                :disabled="user!.role_cd !== 'ADMIN' || saving"
                @click="askRole(user!, 'USER')"
              >
                권한 해제
              </button>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2 class="panel-title">계정 상태</h2></div>
          <div class="panel-body">
            <p class="desc">
              정지·삭제 상태의 계정은 로그인할 수 없습니다.
              이미 접속 중인 기기에서는 최대 15초 뒤에 끊깁니다.
            </p>
            <div class="row">
              <button
                class="btn btn-sm"
                type="button"
                :disabled="user!.status_cd === 'A' || saving"
                @click="askStatus(user!, 'A')"
              >
                활성화
              </button>
              <button
                class="btn btn-sm"
                type="button"
                :disabled="user!.status_cd === 'I' || saving"
                @click="askStatus(user!, 'I')"
              >
                정지
              </button>
              <button
                class="btn btn-sm btn-danger"
                type="button"
                :disabled="user!.status_cd === 'D' || saving"
                @click="askStatus(user!, 'D')"
              >
                삭제 처리
              </button>
            </div>
          </div>
        </section>
      </div>
    </AsyncSection>

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
  </div>
</template>

<style scoped>
.back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--ink-3);
  margin-bottom: 4px;
}
.back:hover {
  color: var(--accent);
  text-decoration: none;
}

.kv {
  margin: 0;
  padding: 4px 0;
}
.kv > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 30px;
  padding: 4px 14px;
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
  overflow-wrap: anywhere;
}

.stack {
  display: flex;
  height: 7px;
  border-radius: 99px;
  overflow: hidden;
  background: var(--surface-3);
}
.seg {
  min-width: 0;
}
.s-done {
  background: var(--ok);
}
.s-doing {
  background: var(--accent);
}
.s-todo {
  background: var(--n-300);
}

.legend {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
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
  font-weight: 600;
}
.sw {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}

.desc {
  margin: 0 0 12px;
  font-size: 12.5px;
  color: var(--ink-3);
  line-height: 1.6;
}
.dlg-p {
  margin: 0 0 8px;
}
</style>
