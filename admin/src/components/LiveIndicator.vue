<script setup lang="ts">
import { computed } from 'vue';
import { timeAgo } from '../lib/format';
import { useNow } from '../composables/useNow';

/**
 * 실시간 연결 표시등.
 *
 * 이 표시가 있어야 하는 이유: 스트림이 끊겨도 화면에는 마지막 숫자가 그대로 남는다.
 * 관리자가 그걸 현재 값으로 착각하면, 장애가 났는데 "정상"으로 읽는 최악의 상황이 된다.
 * 끊긴 사실은 반드시 눈에 보여야 한다.
 */
const props = defineProps<{ live: boolean; lastUpdate: Date | null }>();

// 상대 시각이 화면에 굳지 않도록 시계를 함께 돌린다.
const now = useNow();
const ago = computed(() =>
  props.lastUpdate ? timeAgo(props.lastUpdate.toISOString(), now.value) : null,
);
</script>

<template>
  <div class="live" :class="{ off: !live }">
    <span
      class="status-dot"
      :class="live ? 'status-ok pulse' : 'status-danger'"
      aria-hidden="true"
    />
    <span>{{ live ? '실시간' : '연결 끊김 · 재연결 중' }}</span>
    <span v-if="ago && live" class="live-ago num">{{ ago }}</span>
  </div>
</template>

<style scoped>
.live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--ink-3);
  white-space: nowrap;
}
.live.off {
  color: var(--danger);
  font-weight: 500;
}
.live-ago {
  color: var(--ink-4);
  font-size: 11px;
}
</style>
