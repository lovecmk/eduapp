<script setup lang="ts">
import { computed } from 'vue';
import { sparklinePath } from '../lib/chart';

/**
 * 지표 타일 안의 아주 작은 추세선.
 *
 * 눈금도 축도 값도 없다. 일부러 그렇다 — 읽을 것이 하나뿐이어야 한다.
 * **"지금 어느 쪽으로 가고 있나."** 크기는 바로 옆 숫자가 이미 말하고 있다.
 *
 * 그래서 마우스를 올려도 아무 일이 일어나지 않는다. 여기에 값 풍선을 달면
 * 사람들이 이 그림에서 정확한 값을 읽으려 하게 되는데, 눈금 없는 40px 짜리
 * 그림은 그 질문에 답할 수 없다. 정확한 값은 아래의 요청량 그래프가 맡는다.
 *
 * 색은 타일의 tone 을 따라간다(currentColor). 오류율이 위험 구간이면 값도
 * 선도 함께 빨개져야 둘이 같은 것을 말한다는 게 보인다.
 */
const props = withDefaults(
  defineProps<{
    values: number[];
    width?: number;
    height?: number;
  }>(),
  { width: 64, height: 18 },
);

const d = computed(() => sparklinePath(props.values, props.width, props.height));
</script>

<template>
  <!--
    aria-hidden 인 이유: 이 그림이 말하는 것은 옆의 숫자와 그 아래 설명이
    이미 글자로 말하고 있다. 화면 낭독기에 "그래픽"을 하나 더 읽히면
    같은 사실을 두 번 듣게 될 뿐이다.
  -->
  <svg
    v-if="d"
    class="spark"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="d" fill="none" stroke="currentColor" stroke-width="1.25"
      stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

<style scoped>
.spark {
  display: block;
  /* 선 자체는 값 글자보다 조용해야 한다 — 주인공은 숫자다. */
  opacity: 0.55;
  overflow: visible;
}
</style>
