<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useLiveMetrics } from '../composables/useLiveMetrics';
import {
  pendingReports,
  storeHealthy,
  maintenanceOn,
  alertsLoaded,
  startAlertPolling,
  stopAlertPolling,
} from '../stores/alerts';
import { num } from '../lib/format';
import LiveIndicator from './LiveIndicator.vue';
import ThemeSwitch from './ThemeSwitch.vue';
import AppIcon from './AppIcon.vue';

/**
 * 상단 바 — 화면이 무엇이든 늘 같은 자리에 있는 것들.
 *
 * 여기 올릴 것을 고르는 기준은 하나다. **화면과 무관하게 항상 참인가.**
 *  · 실시간 연결이 살아 있는지 — 이게 끊기면 화면의 모든 숫자가 옛것이다
 *  · 처리할 신고가 쌓여 있는지 — 어느 화면에 있든 급한 일은 급하다
 *  · 저장소가 죽었는지 — 가장 급하다
 *  · 지금 서비스가 점검 중인지 — 켜 놓고 잊으면 몇 시간씩 닫혀 있게 된다
 *  · 검색·이동(⌘K), 테마, 계정
 *
 * 반대로 화면 제목·설명·그 화면의 동작은 여기 두지 않는다. 그건 각 화면의
 * page-head 가 맡는다. 상단 바가 화면마다 달라지기 시작하면, 상단 바를 보는
 * 습관 자체가 무너진다.
 *
 * ── 왜 사이드바에서 옮겼나 ────────────────────────────────────────────
 * 검색·테마·계정은 원래 사이드바 아래에 있었다. 옮긴 이유는 사이드바를
 * **이동만 하는 곳**으로 비우기 위해서다. 이동과 상태·계정이 한 기둥에 섞여
 * 있으면, 메뉴를 찾을 때마다 관련 없는 것들을 눈으로 걸러 내야 한다.
 */

const emit = defineEmits<{ palette: [] }>();

const { live, lastUpdate } = useLiveMetrics();

onMounted(startAlertPolling);
onUnmounted(stopAlertPolling);

/** 배지에 999건을 그대로 쓰면 자리를 다 먹는다 — 셋을 넘으면 어차피 '많다'는 뜻이다. */
const reportLabel = computed(() =>
  pendingReports.value > 99 ? '99+' : num(pendingReports.value),
);

const hasReports = computed(() => alertsLoaded.value && pendingReports.value > 0);
</script>

<template>
  <header class="topbar">
    <!-- 검색은 왼쪽 끝. 사이드바의 메뉴 기둥과 같은 줄에서 시작해 시선이
         왼쪽 위에서 자연스럽게 이어진다. -->
    <button class="cmd-open" type="button" @click="emit('palette')">
      <AppIcon name="search" :size="14" />
      <span>검색 · 이동</span>
      <kbd class="kbd">⌘K</kbd>
    </button>

    <span class="spacer" />

    <!-- 저장소 장애는 다른 무엇보다 앞선다. 평소에는 아예 없다가,
         문제가 생겼을 때만 나타나 자리를 차지한다. -->
    <RouterLink v-if="alertsLoaded && !storeHealthy" to="/service" class="store-down">
      <AppIcon name="alert" :size="14" />
      <span>저장소 연결 끊김</span>
    </RouterLink>

    <!-- 점검 중은 '지금 사용자가 아무도 못 쓴다'는 뜻이다. 켜 놓고 다른 화면으로
         넘어가 잊어버리는 것이 이 기능의 유일한 위험이라, 어느 화면에 있든
         눈에 걸리게 두고 누르면 곧장 설정으로 간다. -->
    <RouterLink v-if="maintenanceOn" to="/settings" class="maint">
      <AppIcon name="alert" :size="14" />
      <span>점검 중</span>
    </RouterLink>

    <LiveIndicator :live="live" :last-update="lastUpdate" />

    <!--
      종에 숫자를 붙인다.
      점만 찍는 방식(빨간 점 하나)을 쓰지 않는 이유: 3건과 300건은 완전히 다른
      상황인데 점은 둘을 같게 보이게 한다. 관리자는 누르기 전에 얼마나 급한지
      알아야 한다.
      할 일이 없으면 배지를 감춘다 — '0' 을 띄워 두면 눈이 매번 확인하게 된다.
    -->
    <RouterLink
      to="/reports"
      class="bell"
      :class="{ on: hasReports }"
      :aria-label="
        hasReports ? `처리되지 않은 신고 ${reportLabel}건` : '신고 관리 (처리할 신고 없음)'
      "
      :title="hasReports ? `처리되지 않은 신고 ${reportLabel}건` : '신고 관리'"
    >
      <AppIcon name="bell" :size="16" />
      <span v-if="hasReports" class="bell-count num">{{ reportLabel }}</span>
    </RouterLink>

    <span class="divider" aria-hidden="true" />

    <ThemeSwitch />

    <slot name="account" />
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 14px 0 12px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  /* 목록을 길게 내려도 연결 상태와 알림은 늘 보여야 한다. */
  position: sticky;
  top: 0;
  z-index: 20;
}

.spacer {
  flex: 1;
}

/* 검색 버튼 — 검색창처럼 생겨야 눌러 볼 생각이 든다. */
.cmd-open {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 240px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-2);
  background: var(--surface-2);
  color: var(--ink-4);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.1s, color 0.1s;
}
.cmd-open:hover {
  border-color: var(--n-300);
  color: var(--ink-2);
}
.cmd-open span {
  flex: 1;
  text-align: left;
}

.store-down {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border-radius: var(--r-1);
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}
.store-down:hover {
  text-decoration: none;
  filter: brightness(0.97);
}

/* 점검 중 — 저장소 장애와 같은 모양이되 색만 다르다(장애가 아니라 '우리가 켠 것').
   두 배지가 동시에 뜰 수 있으므로 생김새를 맞춰 나란히 읽히게 한다. */
.maint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border-radius: var(--r-1);
  background: var(--warn-bg);
  color: var(--warn);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}
.maint:hover {
  text-decoration: none;
  filter: brightness(0.97);
}

.bell {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--ctl-h);
  height: var(--ctl-h);
  border-radius: var(--r-2);
  color: var(--ink-3);
}
.bell:hover {
  background: var(--surface-3);
  color: var(--ink);
  text-decoration: none;
}
/* 할 일이 있을 때만 종 자체도 진해진다. */
.bell.on {
  color: var(--warn);
}

.bell-count {
  position: absolute;
  top: 1px;
  right: 0;
  min-width: 15px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  /* 배경(surface)과 같은 색 테두리로 종 그림에서 배지를 떼어 놓는다. */
  border: 1.5px solid var(--surface);
  background: var(--warn);
  color: var(--n-0);
  font-size: 9.5px;
  font-weight: 700;
  line-height: 11px;
  text-align: center;
}
:root[data-theme='dark'] .bell-count {
  color: var(--n-25);
}

.divider {
  width: 1px;
  height: 18px;
  background: var(--line);
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .topbar {
    height: 42px;
    padding: 0 10px;
  }
  .cmd-open {
    width: auto;
    flex: 1;
    max-width: 200px;
  }
  /* 좁은 화면에서는 글자를 지우고 표시등만 남긴다 — 자리가 없다. */
  .store-down span,
  .maint span {
    display: none;
  }
}
</style>
