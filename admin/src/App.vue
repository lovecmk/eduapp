<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useShortcuts } from './composables/useShortcuts';

import ToastHost from './components/ToastHost.vue';
import CommandPalette from './components/CommandPalette.vue';
import ShortcutHelp from './components/ShortcutHelp.vue';
import AppHeader from './components/AppHeader.vue';
import AppIcon from './components/AppIcon.vue';
import type { IconName } from './components/icons';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 로그인 화면은 사이드바 없이 단독으로 그린다. */
const bare = computed(() => route.meta.public === true);

const paletteOpen = ref(false);
const helpOpen = ref(false);

const NAV: { to: string; label: string; icon: IconName; goKey: string }[] = [
  { to: '/', label: '대시보드', icon: 'grid', goKey: 'd' },
  { to: '/insight', label: '분석', icon: 'pulse', goKey: 'i' },
  { to: '/users', label: '사용자', icon: 'users', goKey: 'u' },
  { to: '/cards', label: '문제 관리', icon: 'cards', goKey: 'c' },
  { to: '/reports', label: '신고 관리', icon: 'flag', goKey: 'r' },
  { to: '/service', label: '서비스 상태', icon: 'pulse', goKey: 's' },
  { to: '/audit', label: '관리 이력', icon: 'history', goKey: 'a' },
];

/** 상세 화면(/users/xxx)에서도 상위 메뉴가 켜져 보이게 한다. */
function isActive(to: string): boolean {
  if (to === '/') return route.path === '/';
  return route.path === to || route.path.startsWith(`${to}/`);
}

useShortcuts({
  onPalette: () => {
    if (bare.value) return; // 로그인 화면에서는 팔레트를 열 이유가 없다
    helpOpen.value = false;
    paletteOpen.value = !paletteOpen.value;
  },
  onHelp: () => {
    if (bare.value) return;
    paletteOpen.value = false;
    helpOpen.value = !helpOpen.value;
  },
  onEscape: () => {
    paletteOpen.value = false;
    helpOpen.value = false;
  },
  onSearch: () => {
    // 각 화면의 검색창을 찾아 포커스한다. 없으면 아무 일도 하지 않는다.
    document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
  },
  onGoto: (key) => {
    const target = NAV.find((n) => n.goKey === key);
    if (target && route.path !== target.to) void router.push(target.to);
  },
});

async function onLogout(): Promise<void> {
  await auth.logout();
  void router.replace({ name: 'login' });
}
</script>

<template>
  <RouterView v-if="bare" />

  <div v-else class="shell">
    <aside class="side">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 13V9M9 2h6" />
          </svg>
        </span>
        <div class="brand-text">
          <span class="brand-name">하루3분ON</span>
          <span class="brand-sub">관리 콘솔</span>
        </div>
      </div>

      <nav class="nav" aria-label="주요 메뉴">
        <RouterLink
          v-for="item in NAV"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ on: isActive(item.to) }"
          :aria-current="isActive(item.to) ? 'page' : undefined"
        >
          <AppIcon :name="item.icon" :size="15" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

    </aside>

    <main class="main">
      <AppHeader @palette="paletteOpen = true">
        <template #account>
          <button
            class="btn btn-ghost btn-sm btn-icon"
            type="button"
            title="단축키 (?)"
            aria-label="키보드 단축키 보기"
            @click="helpOpen = true"
          >
            <AppIcon name="keyboard" :size="15" />
          </button>
          <span class="who" :title="auth.displayName">{{ auth.displayName }}</span>
          <button
            class="btn btn-ghost btn-sm btn-icon"
            type="button"
            title="로그아웃"
            aria-label="로그아웃"
            @click="onLogout"
          >
            <AppIcon name="logout" :size="15" />
          </button>
        </template>
      </AppHeader>

      <RouterView />
    </main>
  </div>

  <CommandPalette :open="paletteOpen" @close="paletteOpen = false" />
  <ShortcutHelp :open="helpOpen" @close="helpOpen = false" />
  <ToastHost />
</template>

<style scoped>
.side {
  background: var(--surface);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  padding: 12px 10px;
  gap: 12px;
  /* 목록을 길게 내려도 메뉴는 제자리에 — 관리 중 화면 이동이 잦다. */
  position: sticky;
  top: 0;
  height: 100vh;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 6px 0;
}
.brand-mark {
  width: 26px;
  height: 26px;
  border-radius: var(--r-2);
  background: var(--accent);
  color: #fff;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}
.brand-name {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.brand-sub {
  font-size: 10.5px;
  color: var(--ink-4);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 30px;
  padding: 0 8px;
  border-radius: var(--r-2);
  color: var(--ink-2);
  font-size: 12.5px;
  font-weight: 500;
  text-decoration: none;
}
.nav-item:hover {
  background: var(--surface-3);
  color: var(--ink);
  text-decoration: none;
}
.nav-item.on {
  background: var(--accent-bg);
  color: var(--accent-ink);
  font-weight: 600;
}

/* 로그인한 사람 이름 — 상단 바의 계정 자리에 들어간다.
   이름은 늘리지 않는다. 긴 이름 하나 때문에 옆의 버튼들이 밀리면 안 된다. */
.who {
  max-width: 120px;
  font-size: 11.5px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 2px;
}

/* 좁은 화면에서는 사이드바를 상단 가로 막대로 바꾼다.
   이제 사이드바에는 이동만 남았으므로 브랜드 한 줄 + 메뉴 한 줄이면 된다. */
@media (max-width: 900px) {
  .side {
    position: static;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--line);
    gap: 8px;
    padding: 8px 12px;
  }
  .nav {
    flex-direction: row;
    overflow-x: auto;
    gap: 2px;
    padding-bottom: 2px;
  }
  .nav-item {
    white-space: nowrap;
  }
  /* 좁은 화면에서 이름까지 넣을 자리는 없다 — 로그아웃 버튼만 남긴다. */
  .who {
    display: none;
  }
}
</style>
