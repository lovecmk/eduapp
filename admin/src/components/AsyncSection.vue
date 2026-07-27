<script setup lang="ts">
import AppIcon from './AppIcon.vue';

/**
 * 로딩·오류·빈 상태를 한 규칙으로 처리하는 껍데기.
 *
 * 핵심 규칙: **이미 데이터가 있으면 갱신 중이어도 계속 보여준다.**
 * 새로고침마다 화면을 스피너로 비우면, 2초마다 갱신되는 관리 화면에서
 * 내용이 계속 깜빡여 읽을 수가 없다. 갱신 표시는 헤더의 작은 스피너로 충분하다.
 */
defineProps<{
  loading: boolean;
  error: string | null;
  /** 데이터가 비었는지. */
  empty?: boolean;
  emptyText?: string;
  /** 로딩 중 표시할 뼈대 줄 수. 표에서 높이가 튀지 않게 한다. */
  skeletonRows?: number;
  onRetry?: () => void;
}>();
</script>

<template>
  <div v-if="error" class="state" role="alert">
    <AppIcon name="alert" :size="18" class="state-icon" />
    <p class="state-msg">{{ error }}</p>
    <button v-if="onRetry" class="btn btn-sm" type="button" @click="onRetry">
      <AppIcon name="refresh" :size="13" />
      다시 시도
    </button>
  </div>

  <div v-else-if="loading && empty" class="skel-wrap" aria-busy="true" aria-live="polite">
    <span class="sr-only">불러오는 중</span>
    <span
      v-for="i in skeletonRows ?? 5"
      :key="i"
      class="skel"
      :style="{ width: `${[92, 74, 85, 63, 79, 88][i % 6]}%` }"
    />
  </div>

  <div v-else-if="empty" class="empty">{{ emptyText ?? '표시할 내용이 없습니다' }}</div>

  <slot v-else />
</template>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  padding: 34px 20px;
  color: var(--ink-3);
  font-size: 12.5px;
}
.state-icon {
  color: var(--danger);
}
.state-msg {
  margin: 0;
  color: var(--ink-2);
  text-align: center;
}

.skel-wrap {
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: 18px 14px;
}
</style>
