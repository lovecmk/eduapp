<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '../api/client';
import type { UserDetail, RoleCd, StatusCd } from '../api/types';
import { useAsync } from '../composables/useAsync';
import { num, pct, dateTime, statusLabel } from '../lib/format';
import { toast } from '../lib/toast';
import AsyncSection from '../components/AsyncSection.vue';
import AppDialog from '../components/AppDialog.vue';
import AppIcon from '../components/AppIcon.vue';

/**
 * 사용자 상세 — 프로필 + 학습 진행 + 권한·상태 변경.
 *
 * 권한 변경은 되돌리기 어려우므로 확인 단계를 둔다. 서버도 잠금 방지 규칙
 * (자기 자신·마지막 관리자)을 갖고 있어, 화면에서 못 막은 경우 409 로 거절된다 —
 * 그 메시지를 그대로 보여준다.
 */

const route = useRoute();
const id = computed(() => String(route.params.id ?? ''));

const detail = useAsync<UserDetail>(() => api.user(id.value));
const saving = ref(false);
const pending = ref<{ kind: 'role' | 'status'; value: string; message: string; danger: boolean } | null>(
  null,
);

const user = computed(() => detail.data.value?.user ?? null);
const learning = computed(() => detail.data.value?.learning ?? null);

const learnTotal = computed(() => {
  const l = learning.value;
  return l ? l.new + l.learning + l.mastered : 0;
});
function share(v: number): string {
  return learnTotal.value === 0 ? '0%' : `${(v / learnTotal.value) * 100}%`;
}

function askRole(next: RoleCd): void {
  const u = user.value;
  if (!u || u.role_cd === next) return;
  pending.value = {
    kind: 'role',
    value: next,
    danger: next === 'USER',
    message:
      next === 'ADMIN'
        ? `${u.user_nm}님에게 관리자 권한을 부여합니다. 전체 사용자 데이터와 학습 콘텐츠를 조회·수정할 수 있게 됩니다.`
        : `${u.user_nm}님의 관리자 권한을 해제합니다. 즉시 관리 콘솔에 접근할 수 없게 됩니다.`,
  };
}

function askStatus(next: StatusCd): void {
  const u = user.value;
  if (!u || u.status_cd === next) return;
  pending.value = {
    kind: 'status',
    value: next,
    danger: next !== 'A',
    message:
      next === 'A'
        ? `${u.user_nm}님의 계정을 다시 활성화합니다.`
        : `${u.user_nm}님의 계정을 '${statusLabel(next)}' 상태로 바꿉니다. 해당 계정은 로그인할 수 없게 됩니다.`,
  };
}

async function confirm(): Promise<void> {
  const req = pending.value;
  if (!req || saving.value) return;
  saving.value = true;
  try {
    if (req.kind === 'role') await api.setUserRole(id.value, req.value as RoleCd);
    else await api.setUserStatus(id.value, req.value as StatusCd);
    toast.success(req.kind === 'role' ? '권한을 변경했습니다' : '계정 상태를 변경했습니다');
    pending.value = null;
    // 서버가 최종 상태의 주인이다 — 화면을 임의로 낙관 갱신하지 않는다.
    await detail.run();
  } catch (e) {
    // 409(잠금 방지 규칙)는 서버 메시지가 이유를 정확히 설명한다.
    toast.error(e instanceof ApiError ? e.message : '변경하지 못했습니다');
  } finally {
    saving.value = false;
  }
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
                @click="askRole('ADMIN')"
              >
                관리자로 승격
              </button>
              <button
                class="btn btn-sm btn-danger"
                type="button"
                :disabled="user!.role_cd !== 'ADMIN' || saving"
                @click="askRole('USER')"
              >
                권한 해제
              </button>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2 class="panel-title">계정 상태</h2></div>
          <div class="panel-body">
            <p class="desc">정지·삭제 상태의 계정은 로그인할 수 없습니다.</p>
            <div class="row">
              <button
                class="btn btn-sm"
                type="button"
                :disabled="user!.status_cd === 'A' || saving"
                @click="askStatus('A')"
              >
                활성화
              </button>
              <button
                class="btn btn-sm"
                type="button"
                :disabled="user!.status_cd === 'I' || saving"
                @click="askStatus('I')"
              >
                정지
              </button>
              <button
                class="btn btn-sm btn-danger"
                type="button"
                :disabled="user!.status_cd === 'D' || saving"
                @click="askStatus('D')"
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
      @close="pending = null"
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
