<script setup lang="ts">
import { computed } from 'vue';

/**
 * 상태 배지.
 *
 * 지금까지는 화면마다 `<span class="badge badge-ok">` 에 라벨을 직접 써 왔다.
 * 같은 '정지'가 어디선 노랑, 어디선 빨강으로 나오기 시작하면 색이 뜻을 잃는다.
 * 상태 → 색의 대응을 여기 한 곳에만 둔다.
 *
 * ── 색만으로 말하지 않는다 ────────────────────────────────────────────
 * 이 콘솔의 초록(--ok)과 빨강(--danger)은 2형 색각에서 거의 같은 색이다
 * (base.css 의 차트 토큰 주석 참고). 그래서 배지는 **항상 글자를 함께 둔다** —
 * 색은 훑을 때 빠르게 짚어 주는 보조 신호일 뿐, 정보를 지고 있지 않다.
 *
 * ── 맥동(pulse)을 언제 켜는가 ──────────────────────────────────────────
 * '지금 이 순간에도 값이 바뀌고 있다'는 뜻일 때만 켠다(실시간 연결, 처리 중).
 * 그냥 '정상'에 맥동을 달면 화면 곳곳이 계속 깜빡여, 정작 움직여야 할 것이
 * 묻힌다. 움직임도 잉크다 — 아껴 써야 값이 있다.
 */

type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'accent' | 'neutral';

const props = withDefaults(
  defineProps<{
    tone?: Tone;
    /** 점을 깜빡여 '살아 움직이는 중'임을 알린다. */
    pulse?: boolean;
    /**
     * 점 없이 글자만. 이미 뜻이 분명한 라벨(관리자 등)에 쓴다 —
     * 점은 '상태'를 뜻하므로 상태가 아닌 것에 붙이면 잘못된 신호가 된다.
     */
    dotless?: boolean;
  }>(),
  { tone: 'neutral', pulse: false, dotless: false },
);

const dotClass = computed(() => {
  const map: Record<Tone, string> = {
    ok: 'status-ok',
    warn: 'status-warn',
    danger: 'status-danger',
    info: 'status-info',
    accent: 'status-accent',
    neutral: 'status-idle',
  };
  return map[props.tone];
});
</script>

<template>
  <span class="badge" :class="`badge-${tone}`">
    <span
      v-if="!dotless"
      class="status-dot"
      :class="[dotClass, { pulse }]"
      aria-hidden="true"
    />
    <slot />
  </span>
</template>

<style scoped>
/* 배지 안의 점은 글자 크기에 맞춰 조금 작게. base.css 의 6px 은 표 안에서
   홀로 설 때의 크기고, 글자 옆에서는 그보다 작아야 둘의 무게가 맞는다. */
.status-dot {
  width: 5px;
  height: 5px;
  vertical-align: 0;
}
</style>
