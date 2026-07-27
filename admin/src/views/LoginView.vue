<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import ThemeSwitch from '../components/ThemeSwitch.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const id = ref('');
const password = ref('');
const idInput = ref<HTMLInputElement | null>(null);

/** 세션 만료로 튕겨 온 경우 이유를 알린다(설명 없이 로그인 화면이 뜨면 버그로 보인다). */
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
    <ThemeSwitch class="theme-btn" />

    <form class="box" @submit.prevent="onSubmit">
      <div class="head">
        <span class="mark" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 13V9M9 2h6" />
          </svg>
        </span>
        <div>
          <h1 class="title">하루3분ON</h1>
          <p class="sub">관리 콘솔</p>
        </div>
      </div>

      <p v-if="expired" class="callout callout-warn notice" role="status">
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

      <p v-if="auth.error" class="callout callout-danger err" role="alert">{{ auth.error }}</p>

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
  position: relative;
}
.theme-btn {
  position: absolute;
  top: 14px;
  right: 14px;
}

.box {
  width: 100%;
  max-width: 340px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-3);
  padding: 22px 20px 16px;
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}
.mark {
  width: 32px;
  height: 32px;
  border-radius: var(--r-2);
  background: var(--accent);
  color: #fff;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.title {
  font-size: 15px;
  line-height: 1.2;
}
.sub {
  margin: 1px 0 0;
  font-size: 11.5px;
  color: var(--ink-4);
}

.notice {
  margin: 0 0 15px;
}
.err {
  margin: -4px 0 12px;
}

.submit {
  width: 100%;
  height: 34px;
  margin-top: 3px;
}

.foot {
  margin: 15px 0 0;
  font-size: 11px;
  color: var(--ink-4);
  line-height: 1.65;
}
code {
  font-family: var(--mono);
  font-size: 10.5px;
  background: var(--surface-3);
  padding: 1px 4px;
  border-radius: var(--r-1);
}
</style>
