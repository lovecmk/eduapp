<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const id = ref('');
const password = ref('');
const idInput = ref<HTMLInputElement | null>(null);

/** 세션 만료로 튕겨 온 경우 이유를 알려준다(아무 설명 없이 로그인 화면이 뜨면 버그로 보인다). */
const expired = route.query.expired === '1';

onMounted(() => idInput.value?.focus());

async function onSubmit(): Promise<void> {
  if (auth.loading) return;
  const ok = await auth.login(id.value.trim(), password.value);
  if (!ok) {
    // 실패해도 아이디는 남긴다 — 오타 난 비밀번호만 다시 치면 되게.
    password.value = '';
    return;
  }
  const next = typeof route.query.next === 'string' ? route.query.next : '/';
  // next 는 주소창으로 조작될 수 있다. 앱 내부 경로만 허용해
  // 외부 사이트로 튕겨 보내는 열린 리다이렉트를 막는다.
  await router.replace(isInternalPath(next) ? next : '/');
}

function isInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\');
}
</script>

<template>
  <div class="wrap">
    <form class="card panel" @submit.prevent="onSubmit">
      <div class="head">
        <span class="mark" aria-hidden="true">3</span>
        <div>
          <h1 class="title">하루3분ON 관리 콘솔</h1>
          <p class="sub">관리자 계정으로 로그인하세요</p>
        </div>
      </div>

      <p v-if="expired" class="notice" role="status">
        로그인이 만료되어 로그아웃되었습니다. 다시 로그인해주세요.
      </p>

      <label class="field">
        <span class="label">아이디</span>
        <input
          ref="idInput"
          v-model="id"
          class="input"
          type="text"
          autocomplete="username"
          required
          :disabled="auth.loading"
        />
      </label>

      <label class="field">
        <span class="label">비밀번호</span>
        <input
          v-model="password"
          class="input"
          type="password"
          autocomplete="current-password"
          required
          :disabled="auth.loading"
        />
      </label>

      <p v-if="auth.error" class="hint hint-error err" role="alert">{{ auth.error }}</p>

      <button class="btn btn-primary submit" type="submit" :disabled="auth.loading">
        <span v-if="auth.loading" class="spinner" aria-hidden="true" />
        {{ auth.loading ? '확인 중…' : '로그인' }}
      </button>

      <p class="foot">
        관리자 계정이 없다면 서버에 <code>ADMIN_LOGIN_ID</code> / <code>ADMIN_PASSWORD</code> 를
        설정하고 재기동하세요.
      </p>
    </form>
  </div>
</template>

<style scoped>
.wrap {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}
.panel {
  width: 100%;
  max-width: 380px;
  padding: 26px 24px 20px;
}
.head {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 22px;
}
.mark {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: var(--blue);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 18px;
  flex-shrink: 0;
}
.title {
  font-size: 16px;
}
.sub {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--text-muted);
}
.notice {
  background: var(--amber-weak);
  color: var(--amber);
  border-radius: var(--r);
  padding: 9px 11px;
  font-size: 12.5px;
  margin: 0 0 16px;
}
.err {
  margin-top: -6px;
  margin-bottom: 12px;
}
.submit {
  width: 100%;
  height: 40px;
}
.foot {
  margin: 16px 0 0;
  font-size: 11.5px;
  color: var(--text-faint);
  line-height: 1.6;
}
code {
  font-family: var(--mono);
  font-size: 11px;
  background: var(--surface-alt);
  padding: 1px 4px;
  border-radius: 4px;
}
</style>
