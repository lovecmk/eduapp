<script setup lang="ts">
/**
 * 로딩·오류·빈 상태를 한 규칙으로 처리하는 껍데기.
 *
 * 특히 신경 쓴 것: **이미 데이터가 있을 때는 갱신 중이어도 데이터를 계속 보여준다.**
 * 새로고침 때마다 화면을 스피너로 비우면, 2초마다 갱신되는 관리 화면에서
 * 내용이 계속 깜빡여 읽을 수가 없다.
 */
defineProps<{
  loading: boolean;
  error: string | null;
  /** 데이터가 비었는지. true 면 빈 상태 문구를 보여준다. */
  empty?: boolean;
  emptyText?: string;
  /** 다시 시도 버튼을 누르면 호출된다. 없으면 버튼을 그리지 않는다. */
  onRetry?: () => void;
}>();
</script>

<template>
  <div v-if="error" class="state state-error" role="alert">
    <div class="state-title">{{ error }}</div>
    <button v-if="onRetry" class="btn btn-sm" type="button" @click="onRetry">다시 시도</button>
  </div>

  <div v-else-if="loading && empty" class="state">
    <div class="spinner" aria-hidden="true" />
    <span>불러오는 중…</span>
  </div>

  <div v-else-if="empty" class="empty">{{ emptyText ?? '표시할 내용이 없어요' }}</div>

  <slot v-else />
</template>

<style scoped>
.state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 36px 20px;
  color: var(--text-muted);
  font-size: 13px;
}
.state-error {
  flex-direction: column;
  color: var(--red);
}
.state-title {
  font-weight: 600;
}
</style>
