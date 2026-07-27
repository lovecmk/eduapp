<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '../api/client';
import type { UserDetail, RoleCd, StatusCd } from '../api/types';
import { useAsync } from '../composables/useAsync';
import { num, pct, dateTime, statusLabel } from '../lib/format';
import { toast } from '../lib/toast';
import AsyncSection from '../components/AsyncSection.vue';

/**
 * 사용자 상세 — 프로필 + 학습 진행 + 권한·상태 변경.
 *
 * 권한 변경은 되돌리기 어려운 작업이므로 확인 단계를 둔다.
 * 서버도 잠금 방지 규칙(자기 자신·마지막 관리자)을 갖고 있어서, 화면에서 막지 못한
 * 경우에도 409 로 거절된다 — 그 메시지를 그대로 보여준다.
 */

const route = useRoute();
const id = computed(() => String(route.params.id ?? ''));

const detail = useAsync<UserDetail>(() => api.user(id.value));
const saving = ref(false);

/** 확인이 필요한 작업. null 이면 확인창이 닫힌 상태. */
const pending = ref<{ kind: 'role' | 'status'; value: string; message: string } | null>(null);

const user = computed(() => detail.data.value?.user ?? null);
const learning = computed(() => detail.data.value?.learning ?? null);

function askRole(next: RoleCd): void {
  if (!user.value || user.value.role_cd === next) return;
  pending.value = {
    kind: 'role',
    value: next,
    message:
      next === 'ADMIN'
        ? `${user.value.user_nm}님에게 관리자 권한을 부여합니다. 전체 사용자 데이터와 학습 콘텐츠를 조회·수정할 수 있게 됩니다.`
        : `${user.value.user_nm}님의 관리자 권한을 해제합니다. 즉시 관리 콘솔에 접근할 수 없게 됩니다.`,
  };
}

function askStatus(next: StatusCd): void {
  if (!user.value || user.value.status_cd === next) return;
  const label = statusLabel(next);
  pending.value = {
    kind: 'status',
    value: next,
    message:
      next === 'A'
        ? `${user.value.user_nm}님의 계정을 다시 활성화합니다.`
        : `${user.value.user_nm}님의 계정을 '${label}' 상태로 바꿉니다. 해당 계정은 로그인할 수 없게 됩니다.`,
  };
}

async function confirm(): Promise<void> {
  const req = pending.value;
  if (!req || saving.value) return;
  saving.value = true;
  try {
    if (req.kind === 'role') {
      await api.setUserRole(id.value, req.value as RoleCd);
      toast.success('권한을 변경했습니다');
    } else {
      await api.setUserStatus(id.value, req.value as StatusCd);
      toast.success('계정 상태를 변경했습니다');
    }
    pending.value = null;
    await detail.run(); // 서버가 최종 상태의 주인이다 — 화면을 임의로 낙관 갱신하지 않는다
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
    <div class="page-head">
      <div>
        <RouterLink to="/users" class="back">← 사용자 목록</RouterLink>
        <h1 class="page-title">{{ user?.user_nm || '사용자 상세' }}</h1>
        <p class="page-sub">계정 정보와 학습 진행을 확인하고 권한을 관리합니다</p>
      </div>
    </div>

    <AsyncSection
      :loading="detail.loading.value"
      :error="detail.error.value"
      :empty="!user"
      :on-retry="() => void detail.run()"
    >
      <div class="grid grid-2">
        <!-- 프로필 -->
        <section class="card">
          <div class="card-head"><h2 class="card-title">계정 정보</h2></div>
          <div class="card-body">
            <dl class="kv">
              <div><dt>아이디</dt><dd class="num">{{ user!.login_id }}</dd></div>
              <div><dt>이름</dt><dd>{{ user!.user_nm || '-' }}</dd></div>
              <div><dt>닉네임</dt><dd>{{ user!.nickname || '-' }}</dd></div>
              <div><dt>이메일</dt><dd class="num">{{ user!.email_addr || '-' }}</dd></div>
              <div><dt>소속</dt><dd>{{ user!.org_nm || '-' }}</dd></div>
              <div><dt>직무</dt><dd>{{ user!.job_title || '-' }}</dd></div>
              <div><dt>멤버십</dt><dd>{{ user!.membership_cd || '-' }}</dd></div>
              <div><dt>가입</dt><dd class="num">{{ dateTime(user!.created_at) }}</dd></div>
              <div>
                <dt>내부 ID</dt>
                <dd class="num muted">{{ user!.id }}</dd>
              </div>
            </dl>
          </div>
        </section>

        <!-- 학습 진행 -->
        <section class="card">
          <div class="card-head">
            <h2 class="card-title">학습 진행</h2>
            <span class="badge badge-green">완료율 {{ pct(learning?.rate) }}</span>
          </div>
          <div class="card-body">
            <div
              class="bar"
              role="img"
              :aria-label="`완료 ${learning?.mastered ?? 0}건, 학습 중 ${learning?.learning ?? 0}건, 미시작 ${learning?.new ?? 0}건`"
            >
              <span class="seg seg-done" :style="{ flexGrow: learning?.mastered || 0 }" />
              <span class="seg seg-doing" :style="{ flexGrow: learning?.learning || 0 }" />
              <span class="seg seg-todo" :style="{ flexGrow: learning?.new || 0 }" />
            </div>
            <dl class="kv kv-tight">
              <div><dt>완료</dt><dd class="num">{{ num(learning?.mastered) }}건</dd></div>
              <div><dt>학습 중</dt><dd class="num">{{ num(learning?.learning) }}건</dd></div>
              <div><dt>미시작</dt><dd class="num">{{ num(learning?.new) }}건</dd></div>
            </dl>
            <p v-if="(learning?.mastered ?? 0) === 0 && (learning?.learning ?? 0) === 0" class="hint">
              아직 학습 기록이 없는 계정입니다.
            </p>
          </div>
        </section>

        <!-- 권한 -->
        <section class="card">
          <div class="card-head">
            <h2 class="card-title">권한</h2>
            <span class="badge" :class="user!.role_cd === 'ADMIN' ? 'badge-violet' : 'badge-gray'">
              {{ user!.role_cd === 'ADMIN' ? '관리자' : '일반 사용자' }}
            </span>
          </div>
          <div class="card-body">
            <p class="desc">
              관리자는 전체 사용자 데이터 조회, 계정 상태 변경, 학습 문제 등록·수정·삭제를 할 수
              있습니다.
            </p>
            <div class="row">
              <button
                class="btn"
                type="button"
                :disabled="user!.role_cd === 'ADMIN' || saving"
                @click="askRole('ADMIN')"
              >
                관리자로 승격
              </button>
              <button
                class="btn btn-danger"
                type="button"
                :disabled="user!.role_cd !== 'ADMIN' || saving"
                @click="askRole('USER')"
              >
                권한 해제
              </button>
            </div>
          </div>
        </section>

        <!-- 계정 상태 -->
        <section class="card">
          <div class="card-head">
            <h2 class="card-title">계정 상태</h2>
            <span
              class="badge"
              :class="
                user!.status_cd === 'A' || user!.status_cd === ''
                  ? 'badge-green'
                  : user!.status_cd === 'I'
                    ? 'badge-amber'
                    : 'badge-red'
              "
            >
              {{ statusLabel(user!.status_cd) }}
            </span>
          </div>
          <div class="card-body">
            <p class="desc">정지·삭제 상태의 계정은 로그인할 수 없습니다.</p>
            <div class="row">
              <button
                class="btn"
                type="button"
                :disabled="user!.status_cd === 'A' || saving"
                @click="askStatus('A')"
              >
                활성화
              </button>
              <button
                class="btn"
                type="button"
                :disabled="user!.status_cd === 'I' || saving"
                @click="askStatus('I')"
              >
                정지
              </button>
              <button
                class="btn btn-danger"
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

    <!-- 확인창 -->
    <div v-if="pending" class="overlay" @click.self="pending = null">
      <div class="card dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div class="card-head"><h2 id="confirm-title" class="card-title">변경 확인</h2></div>
        <div class="card-body">
          <p class="dialog-msg">{{ pending.message }}</p>
          <p class="hint">이 작업은 관리 이력에 기록됩니다.</p>
        </div>
        <div class="dialog-foot">
          <button class="btn" type="button" :disabled="saving" @click="pending = null">취소</button>
          <button class="btn btn-primary" type="button" :disabled="saving" @click="confirm">
            <span v-if="saving" class="spinner" aria-hidden="true" />
            {{ saving ? '변경 중…' : '변경하기' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.back {
  font-size: 12.5px;
  font-weight: 600;
  display: inline-block;
  margin-bottom: 5px;
}
.kv {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.kv > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
}
.kv dt {
  color: var(--text-muted);
  font-size: 13px;
  flex-shrink: 0;
}
.kv dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
  min-width: 0;
  overflow-wrap: anywhere;
}
.kv-tight {
  margin-top: 12px;
  gap: 6px;
}
.muted {
  color: var(--text-faint);
  font-weight: 400;
  font-size: 12px;
}
.desc {
  margin: 0 0 14px;
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.6;
}
.bar {
  display: flex;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--surface-alt);
}
.seg {
  min-width: 0;
}
.seg-done {
  background: var(--green);
}
.seg-doing {
  background: var(--blue);
}
.seg-todo {
  background: var(--border-strong);
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
  max-width: 420px;
  box-shadow: var(--shadow-lg);
}
.dialog-msg {
  margin: 0 0 8px;
  font-size: 13.5px;
  line-height: 1.65;
}
.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}
</style>
