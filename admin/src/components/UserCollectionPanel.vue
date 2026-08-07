<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { api } from '../api/client';
import type { UserCollection } from '../api/types';
import { useAsync } from '../composables/useAsync';
import AsyncSection from './AsyncSection.vue';
import StatusBadge from './StatusBadge.vue';

/**
 * 이 사람의 안전 카드 도감 현황.
 *
 * 왜 필요한가 — 도감은 몇 달치 학습의 결과물이고, 문의가 들어오는 지점이다
 * ("팩이 사라졌어요", "기기를 바꿨는데 카드가 없어요"). 서버에 무엇이
 * 저장돼 있는지 볼 수 없으면 답할 방법이 없다.
 *
 * ── 읽기 전용이다 ──────────────────────────────────────────────────────
 * 지급 버튼은 두지 않았다. 콘솔에서 팩을 찍어낼 수 있으면 그때부터 도감
 * 경제에 감사 추적이 필요해진다 — 누가 왜 몇 개를 줬는지 남기지 않으면
 * 나중에 아무도 되짚을 수 없다. 그 설계를 갖추기 전에는 조회만 연다.
 */
/**
 * total(도감 전체 종수)을 받지 않는 것이 의도적이다.
 *
 * 카탈로그(500종)는 앱에만 있는 데이터고 서버도 콘솔도 모른다. "N/500"을
 * 보여주려면 콘솔에 500을 적어 둬야 하는데, 앱에서 카드를 늘리는 순간
 * 조용히 어긋나 **틀린 숫자를 자신 있게 보여주는** 화면이 된다.
 * 모르는 값은 만들어 내지 않고 아는 값(수집 종수)만 보여준다.
 */
const props = defineProps<{ userId: string }>();

const col = useAsync<UserCollection>(() => api.userCollection(props.userId));

onMounted(() => void col.run());
watch(() => props.userId, () => void col.run());

const data = computed(() => col.data.value);
/** 한 번도 동기화한 적이 없으면 '아직 없음'으로 본다. */
const empty = computed(() => {
  const d = data.value;
  return !d || (d.packs_earned === 0 && d.unique_count === 0 && d.study_total === 0);
});
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2 class="panel-title">안전 카드 도감</h2>
      <StatusBadge v-if="data && !empty" tone="accent" dotless>
        {{ data.unique_count }}종 수집
      </StatusBadge>
    </div>

    <AsyncSection
      :loading="col.loading.value"
      :error="col.error.value"
      :empty="empty"
      empty-text="아직 도감 기록이 없습니다. 앱에서 학습을 시작하면 여기에 쌓입니다."
      :on-retry="col.run"
    >
      <div v-if="data" class="body">
        <dl class="grid">
          <div class="cell">
            <dt>보유 카드팩</dt>
            <dd>{{ data.pack_balance }}</dd>
            <!-- 잔액만 보여주면 "5개였는데 2개다"에 답할 수 없다. 적립과 개봉을
                 함께 보여야 어디서 줄었는지가 드러난다. -->
            <p class="sub">적립 {{ data.packs_earned }} · 개봉 {{ data.packs_opened }}</p>
          </div>
          <div class="cell">
            <dt>안전 조각</dt>
            <dd>{{ data.shard_balance }}</dd>
            <p class="sub">획득 {{ data.shards_earned }} · 사용 {{ data.shards_spent }}</p>
          </div>
          <div class="cell">
            <dt>수집 종수</dt>
            <dd>{{ data.unique_count }}</dd>
            <p class="sub">종</p>
          </div>
          <div class="cell">
            <dt>누적 학습</dt>
            <dd>{{ data.study_total }}</dd>
            <p class="sub">장</p>
          </div>
          <div class="cell">
            <dt>천장 진행</dt>
            <dd>{{ data.since_legendary }}</dd>
            <p class="sub">다이아 미획득 팩 수 · 루비 {{ data.since_epic }}</p>
          </div>
        </dl>

        <p class="foot">
          마지막 무료팩 {{ data.last_daily_pack || '받은 적 없음' }}
          <span class="muted">· 규칙 수령 {{ Object.keys(data.claimed_rules).length }}종 · 코드 {{ data.redeemed_codes.length }}개</span>
        </p>
      </div>
    </AsyncSection>
  </section>
</template>

<style scoped>
.body { display: flex; flex-direction: column; gap: 14px; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin: 0;
}
.cell {
  background: var(--surface-alt);
  border-radius: 10px;
  padding: 12px 14px;
}
.cell dt {
  font-size: 12px;
  color: var(--text-muted);
}
.cell dd {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.sub {
  margin: 4px 0 0;
  font-size: 11.5px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.foot {
  margin: 0;
  font-size: 12.5px;
  color: var(--text);
}
.muted { color: var(--text-muted); }
</style>
