<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/client';
import { themeMode, THEME_LABEL, type ThemeMode } from '../composables/useTheme';
import AppIcon from './AppIcon.vue';
import type { IconName } from './icons';

/**
 * 명령 팔레트 (⌘K / Ctrl+K).
 *
 * 화면이 다섯 개뿐인데 왜 필요한가 — 이동 때문이 아니라 **검색** 때문이다.
 * "이 사용자 지금 상태가 뭐지", "이 문제 누가 만들었지" 를 확인하려면 지금은
 * 목록 → 검색 → 클릭 세 단계를 거쳐야 한다. 여기서는 이름 몇 글자로 바로 간다.
 *
 * 서버 검색은 타이핑이 멎은 뒤에만 부른다(글자마다 요청하면 서버가 헛돈다).
 */

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const query = ref('');
const cursor = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const searching = ref(false);

interface Item {
  id: string;
  icon: IconName;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

/** 항상 있는 항목 — 이동과 몇 가지 동작. */
const staticItems = computed<Item[]>(() => [
  { id: 'go-dash', icon: 'grid', label: '대시보드', hint: 'G D', group: '이동', run: () => go('/') },
  { id: 'go-users', icon: 'users', label: '사용자', hint: 'G U', group: '이동', run: () => go('/users') },
  { id: 'go-cards', icon: 'cards', label: '문제 관리', hint: 'G C', group: '이동', run: () => go('/cards') },
  { id: 'go-reports', icon: 'flag', label: '신고 관리', hint: 'G R', group: '이동', run: () => go('/reports') },
  { id: 'go-service', icon: 'pulse', label: '서비스 상태', hint: 'G S', group: '이동', run: () => go('/service') },
  { id: 'go-audit', icon: 'history', label: '관리 이력', hint: 'G A', group: '이동', run: () => go('/audit') },
  { id: 'new-card', icon: 'plus', label: '새 문제 만들기', group: '동작', run: () => go('/cards/new') },
  { id: 'send-notice', icon: 'bell', label: '공지 보내기', group: '동작', run: () => go('/reports') },
  // 테마는 세 가지를 각각 항목으로 둔다 — '전환' 한 줄이면 눌러 보기 전엔
  // 무엇이 될지 알 수 없다. 팔레트는 닫지 않아 연속으로 눌러 비교할 수 있다.
  ...(['light', 'dark', 'auto'] as ThemeMode[])
    .filter((mode) => mode !== themeMode.value)
    .map<Item>((mode) => ({
      id: `theme-${mode}`,
      icon: mode === 'dark' ? 'moon' : mode === 'light' ? 'sun' : 'monitor',
      label: `테마: ${THEME_LABEL[mode]}`,
      group: '동작',
      run: () => {
        themeMode.value = mode;
      },
    })),
]);

/** 검색으로 찾은 사용자·문제. */
const found = ref<Item[]>([]);

const filtered = computed<Item[]>(() => {
  const q = query.value.trim().toLowerCase();
  const statics = q
    ? staticItems.value.filter((i) => i.label.toLowerCase().includes(q))
    : staticItems.value;
  return [...statics, ...found.value];
});

/** 그룹 머리글을 붙이기 위해 앞 항목과 그룹이 달라지는 지점을 표시한다. */
const rows = computed(() =>
  filtered.value.map((item, i) => ({
    item,
    showGroup: i === 0 || filtered.value[i - 1]!.group !== item.group,
  })),
);

let searchTimer: ReturnType<typeof setTimeout> | null = null;

watch(query, (q) => {
  cursor.value = 0;
  if (searchTimer) clearTimeout(searchTimer);
  const term = q.trim();
  if (term.length < 2) {
    found.value = [];
    searching.value = false;
    return;
  }
  searching.value = true;
  searchTimer = setTimeout(() => void runSearch(term), 220);
});

async function runSearch(term: string): Promise<void> {
  try {
    const [users, cards] = await Promise.all([
      api.users({ search: term, limit: 5 }),
      api.cards({ search: term, limit: 5 }),
    ]);
    // 입력이 그 사이 또 바뀌었으면 이 결과는 버린다(늦게 온 응답이 화면을 되돌리지 않게).
    if (query.value.trim() !== term) return;
    found.value = [
      ...users.items.map<Item>((u) => ({
        id: `u-${u.id}`,
        icon: 'users',
        label: u.user_nm || u.login_id,
        hint: u.login_id,
        group: '사용자',
        run: () => go(`/users/${u.id}`),
      })),
      ...cards.items.map<Item>((c) => ({
        id: `c-${c.id}`,
        icon: 'cards',
        label: c.title_txt || c.question_txt,
        hint: c.category_cd,
        group: '문제',
        run: () => go(`/cards/${c.id}/edit`),
      })),
    ];
  } catch {
    found.value = []; // 검색 실패는 조용히 — 팔레트에 오류 박스를 띄우면 방해만 된다
  } finally {
    if (query.value.trim() === term) searching.value = false;
  }
}

function go(path: string): void {
  emit('close');
  void router.push(path);
}

function choose(item: Item): void {
  item.run();
}

function move(delta: number): void {
  const n = filtered.value.length;
  if (n === 0) return;
  // 끝에서 반대편으로 감싼다 — 목록 끝에서 막히면 다시 위로 스크롤해야 한다.
  cursor.value = (cursor.value + delta + n) % n;
  void nextTick(() => {
    listEl.value
      ?.querySelector(`[data-idx="${cursor.value}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  });
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    move(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    move(-1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const item = filtered.value[cursor.value];
    if (item) choose(item);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    emit('close');
  }
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    // 열 때마다 처음 상태로 — 지난 검색어가 남아 있으면 매번 지워야 한다.
    query.value = '';
    found.value = [];
    cursor.value = 0;
    await nextTick();
    inputEl.value?.focus();
  },
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="scrim palette-scrim" @mousedown.self="emit('close')">
      <div class="palette" role="dialog" aria-modal="true" aria-label="명령 팔레트">
        <div class="palette-input">
          <AppIcon name="search" :size="15" class="muted" />
          <input
            ref="inputEl"
            v-model="query"
            type="text"
            placeholder="화면 이동, 사용자·문제 검색…"
            aria-label="명령 또는 검색어"
            autocomplete="off"
            spellcheck="false"
            @keydown="onKeydown"
          />
          <span v-if="searching" class="spinner" aria-hidden="true" />
          <kbd class="kbd">esc</kbd>
        </div>

        <div v-if="filtered.length === 0" class="palette-empty">
          {{ query.trim().length < 2 ? '두 글자 이상 입력하면 검색합니다' : '결과가 없습니다' }}
        </div>

        <ul v-else ref="listEl" class="palette-list" role="listbox">
          <template v-for="(row, i) in rows" :key="row.item.id">
            <li v-if="row.showGroup" class="palette-group" role="presentation">
              {{ row.item.group }}
            </li>
            <li
              :data-idx="i"
              class="palette-item"
              :class="{ 'palette-item-on': i === cursor }"
              role="option"
              :aria-selected="i === cursor"
              @mousemove="cursor = i"
              @click="choose(row.item)"
            >
              <AppIcon :name="row.item.icon" :size="15" class="palette-icon" />
              <span class="palette-label">{{ row.item.label }}</span>
              <span v-if="row.item.hint" class="palette-hint num">{{ row.item.hint }}</span>
            </li>
          </template>
        </ul>

        <div class="palette-foot">
          <span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> 이동</span>
          <span><kbd class="kbd">⏎</kbd> 선택</span>
          <span><kbd class="kbd">?</kbd> 단축키 도움말</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.palette-scrim {
  padding-top: 14vh;
  z-index: 70;
}
.palette {
  width: 100%;
  max-width: 520px;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-3);
  box-shadow: var(--pop);
  overflow: hidden;
  animation: rise 0.14s ease-out;
}

.palette-input {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  height: 44px;
  border-bottom: 1px solid var(--line);
}
.palette-input input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
}
.palette-input input::placeholder {
  color: var(--ink-4);
}

.palette-list {
  list-style: none;
  margin: 0;
  padding: 5px;
  max-height: 340px;
  overflow-y: auto;
}

.palette-group {
  padding: 7px 8px 4px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--ink-4);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 32px;
  padding: 0 8px;
  border-radius: var(--r-2);
  cursor: pointer;
  font-size: 13px;
}
.palette-item-on {
  background: var(--accent-bg);
  color: var(--accent-ink);
}
.palette-icon {
  color: var(--ink-4);
}
.palette-item-on .palette-icon {
  color: var(--accent);
}
.palette-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.palette-hint {
  color: var(--ink-4);
  font-size: 11px;
  flex-shrink: 0;
}
.palette-item-on .palette-hint {
  color: var(--accent);
}

.palette-empty {
  padding: 26px 16px;
  text-align: center;
  color: var(--ink-4);
  font-size: 12.5px;
}

.palette-foot {
  display: flex;
  gap: 14px;
  padding: 7px 12px;
  border-top: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 11px;
  color: var(--ink-4);
}
.palette-foot span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
