<script setup lang="ts">
import { ref, useId } from 'vue';
import { useOverlay } from '../composables/useOverlay';
import AppIcon from './AppIcon.vue';

/**
 * 상세 서랍 — 오른쪽에서 밀려 나오는 판.
 *
 * 이것이 필요한 이유는 하나다. **목록을 잃지 않기 위해서.**
 *
 * 지금까지 사용자 한 명을 자세히 보려면 /users/:id 로 화면을 통째로 갈아 끼웠다.
 * 그러면 방금 건 필터, 스크롤 위치, 몇 번째 줄을 보던 중이었는지가 전부 날아간다.
 * 열 명을 차례로 확인하는 일(정지 후보를 훑는 등)이 스무 번의 화면 전환이 된다.
 * 서랍은 목록을 뒤에 그대로 둔 채 상세만 얹는다.
 *
 * 서랍에 두는 것과 두지 않는 것:
 *  · 둔다   — 확인, 조회, 실시간 로그. 즉, **읽는 일**과 되돌릴 수 있는 동작.
 *  · 안 둔다 — 되돌릴 수 없는 일. 그건 서랍 위에 모달(AppDialog)로 다시 묻는다.
 *
 * 접근성 처리(포커스 가둠·Esc·스크롤 잠금·포커스 복귀)는 useOverlay 가 맡는다.
 */

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    /** 제목 위 한 줄 — '사용자', '문제' 처럼 무엇의 상세인지. */
    eyebrow?: string;
    /** 내용이 넓어야 할 때(로그·표). */
    wide?: boolean;
  }>(),
  { eyebrow: '', wide: false },
);

const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);

const titleId = useId();

const { onKeydown } = useOverlay({
  open: () => props.open,
  panel,
  onClose: () => emit('close'),
  /*
   * 열면 닫기 버튼에 포커스를 둔다.
   *
   * 본문 첫 링크에 두지 않는 이유: 서랍은 훑어보려고 여는 것이라 곧바로 닫는
   * 경우가 많다. 열자마자 Enter/Space 로 닫히는 자리에 있는 편이 빠르고,
   * 실수로 링크를 따라가 목록을 잃는 일도 없다.
   */
  initialFocus: () => closeBtn.value,
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="drawer-scrim"
      @mousedown.self="emit('close')"
      @keydown="onKeydown"
    >
      <aside
        ref="panel"
        class="drawer"
        :class="{ 'drawer-wide': wide }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <header class="drawer-head">
          <div class="drawer-head-text">
            <div v-if="eyebrow" class="drawer-eyebrow">{{ eyebrow }}</div>
            <h2 :id="titleId" class="drawer-title">{{ title }}</h2>
          </div>

          <!-- 머리 오른쪽 — 배지나 보조 동작을 화면이 채운다. -->
          <div class="drawer-head-actions">
            <slot name="head" />
            <button
              ref="closeBtn"
              class="btn btn-ghost btn-sm btn-icon"
              type="button"
              aria-label="닫기 (Esc)"
              title="닫기 (Esc)"
              @click="emit('close')"
            >
              <AppIcon name="x" :size="15" />
            </button>
          </div>
        </header>

        <div class="drawer-body">
          <slot />
        </div>

        <footer v-if="$slots.foot" class="drawer-foot">
          <slot name="foot" />
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-head-text {
  flex: 1;
  min-width: 0;
}
.drawer-head-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
</style>
