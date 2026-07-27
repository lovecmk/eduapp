<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';
import ToastHost from './components/ToastHost.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 로그인 화면은 사이드바 없이 전체 화면으로 그린다. */
const bare = computed(() => route.meta.public === true);

const nav = [
  { to: '/', label: '대시보드', icon: '▦' },
  { to: '/users', label: '사용자', icon: '◍' },
  { to: '/cards', label: '문제 관리', icon: '▤' },
  { to: '/service', label: '서비스 상태', icon: '◉' },
  { to: '/audit', label: '관리 이력', icon: '≡' },
] as const;

/** 상세 화면(/users/xxx)에서도 상위 메뉴가 선택돼 보이게 한다. */
function isActive(to: string): boolean {
  if (to === '/') return route.path === '/';
  return route.path === to || route.path.startsWith(`${to}/`);
}

async function onLogout(): Promise<void> {
  await auth.logout();
  void router.replace({ name: 'login' });
}
</script>

<template>
  <RouterView v-if="bare" />

  <div v-else class="shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">3</span>
        <div>
          <div class="brand-name">하루3분ON</div>
          <div class="brand-sub">관리 콘솔</div>
        </div>
      </div>

      <nav class="nav" aria-label="주요 메뉴">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ 'nav-item-active': isActive(item.to) }"
          :aria-current="isActive(item.to) ? 'page' : undefined"
        >
          <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="who">
        <div class="who-name">{{ auth.displayName }}</div>
        <button class="btn btn-sm who-out" type="button" @click="onLogout">로그아웃</button>
      </div>
    </aside>

    <main class="main">
      <RouterView />
    </main>
  </div>

  <ToastHost />
</template>

<style scoped>
.sidebar {
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 14px 12px;
  gap: 18px;
  /* 목록을 길게 스크롤해도 메뉴는 제자리에 — 관리 중 이동이 잦다. */
  position: sticky;
  top: 0;
  height: 100vh;
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 4px 6px;
}
.brand-mark {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--blue);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 15px;
  flex-shrink: 0;
}
.brand-name {
  font-weight: 800;
  font-size: 14px;
  line-height: 1.2;
}
.brand-sub {
  font-size: 11.5px;
  color: var(--text-faint);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: var(--r);
  color: var(--text-muted);
  font-size: 13.5px;
  font-weight: 600;
  text-decoration: none;
}
.nav-item:hover {
  background: var(--surface-alt);
  text-decoration: none;
}
.nav-item-active {
  background: var(--blue-weak);
  color: var(--blue-strong);
}
.nav-icon {
  width: 16px;
  text-align: center;
  font-size: 12px;
  opacity: 0.8;
}

.who {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.who-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.who-out {
  flex-shrink: 0;
}

/* 좁은 화면에서는 사이드바를 상단 가로 막대로 바꾼다. */
@media (max-width: 860px) {
  .sidebar {
    position: static;
    height: auto;
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    border-right: none;
    border-bottom: 1px solid var(--border);
    gap: 10px;
  }
  .nav {
    flex-direction: row;
    flex-wrap: wrap;
    flex: 1 1 100%;
    order: 3;
  }
  .who {
    border-top: none;
    padding-top: 0;
    width: auto;
  }
  .who-name {
    display: none;
  }
}
</style>
