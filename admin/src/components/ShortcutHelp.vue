<script setup lang="ts">
/**
 * 단축키 도움말(`?`).
 *
 * 단축키를 만들어 놓고 알려주지 않으면 아무도 안 쓴다. 팔레트 하단과 이 시트,
 * 두 곳에서 발견할 수 있게 했다.
 */
defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const GROUPS: { title: string; items: { keys: string[]; desc: string }[] }[] = [
  {
    title: '전체',
    items: [
      { keys: ['⌘', 'K'], desc: '명령 팔레트 (이동·검색)' },
      { keys: ['/'], desc: '이 화면의 검색창으로' },
      { keys: ['?'], desc: '이 도움말' },
      { keys: ['Esc'], desc: '열린 창 닫기' },
    ],
  },
  {
    title: '이동 — G 를 누른 뒤',
    items: [
      { keys: ['G', 'D'], desc: '대시보드' },
      { keys: ['G', 'U'], desc: '사용자' },
      { keys: ['G', 'C'], desc: '문제 관리' },
      { keys: ['G', 'S'], desc: '서비스 상태' },
      { keys: ['G', 'A'], desc: '관리 이력' },
    ],
  },
  {
    title: '목록',
    items: [
      { keys: ['↑', '↓'], desc: '팔레트에서 항목 이동' },
      { keys: ['⏎'], desc: '선택' },
    ],
  },
];
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="scrim" @mousedown.self="emit('close')" @keydown.esc="emit('close')">
      <div class="modal help" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div class="modal-head">
          <h2 id="help-title" class="modal-title">키보드 단축키</h2>
        </div>
        <div class="help-body">
          <section v-for="g in GROUPS" :key="g.title" class="help-group">
            <h3 class="help-group-title">{{ g.title }}</h3>
            <div v-for="item in g.items" :key="item.desc" class="help-row">
              <span class="help-desc">{{ item.desc }}</span>
              <span class="help-keys">
                <kbd v-for="k in item.keys" :key="k" class="kbd">{{ k }}</kbd>
              </span>
            </div>
          </section>
        </div>
        <div class="modal-foot">
          <button class="btn" type="button" autofocus @click="emit('close')">닫기</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.help {
  max-width: 400px;
}
.help-body {
  padding: 6px 16px 14px;
}
.help-group + .help-group {
  margin-top: 16px;
}
.help-group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-4);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 6px;
}
.help-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 26px;
  font-size: 12.5px;
}
.help-desc {
  color: var(--ink-2);
}
.help-keys {
  display: inline-flex;
  gap: 3px;
  flex-shrink: 0;
}
</style>
