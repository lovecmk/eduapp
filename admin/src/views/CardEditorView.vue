<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { api, ApiError } from '../api/client';
import { emptyCard, type Card, type CardType, type Difficulty } from '../api/types';
import {
  validateCard,
  hasErrors,
  normalizeCard,
  parseKeywords,
  choicesForType,
  type CardErrors,
} from '../lib/cardValidation';
import { toast } from '../lib/toast';

/**
 * 문제 만들기 / 고치기.
 *
 * 신경 쓴 것 세 가지:
 *  1. 작성 중 이탈 방지 — 긴 해설을 쓰다가 실수로 뒤로 가면 전부 날아간다.
 *  2. 미리보기 — 학습자가 볼 앞면/뒷면을 그대로 보여준다. 저장 후 앱에서 확인하는
 *     왕복을 없앤다.
 *  3. 오류를 저장 시점이 아니라 **필드를 떠날 때** 보여준다. 타이핑 중에 빨간 글씨가
 *     계속 뜨면 방해만 된다.
 */

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === 'card-new');
const cardId = computed(() => String(route.params.id ?? ''));

const card = ref<Card>(emptyCard());
const keywordsRaw = ref('');
const loading = ref(false);
const saving = ref(false);
const loadError = ref<string | null>(null);
/** 사용자가 한 번이라도 벗어난 필드만 오류를 보여준다. */
const touched = ref<Set<string>>(new Set());
const submitted = ref(false);
/** 저장되지 않은 변경이 있는지 — 이탈 경고에 쓴다. */
const dirty = ref(false);

const errors = computed<CardErrors>(() => validateCard(card.value));
const canSave = computed(() => !hasErrors(errors.value) && !saving.value);

/** 해당 필드의 오류를 지금 보여줄지(제출했거나, 그 필드를 이미 만졌을 때만). */
function showError(field: string): string | undefined {
  if (!submitted.value && !touched.value.has(field)) return undefined;
  return errors.value[field as keyof CardErrors];
}

function touch(field: string): void {
  touched.value = new Set(touched.value).add(field);
}

// 어떤 입력이든 바뀌면 '저장 안 함' 상태로 표시한다.
watch(card, () => { dirty.value = true; }, { deep: true });
watch(keywordsRaw, () => { dirty.value = true; });

/** 형식을 바꾸면 보기·정답을 그 형식에 맞게 정리한다. */
function onTypeChange(next: CardType): void {
  card.value.card_type_cd = next;
  card.value.choices = choicesForType(next, card.value.choices);
  if (next === 'EXPLANATION') {
    card.value.answer_index = null;
  } else if (card.value.answer_index === null) {
    card.value.answer_index = 0;
  }
}

function addChoice(): void {
  card.value.choices = [...(card.value.choices ?? []), ''];
}

function removeChoice(index: number): void {
  const list = [...(card.value.choices ?? [])];
  list.splice(index, 1);
  card.value.choices = list;
  // 정답이 지워졌거나 뒤로 밀렸으면 함께 조정한다 —
  // 그러지 않으면 '보기에 없는 정답'이라는 저장 불가 상태에 빠진다.
  const answer = card.value.answer_index;
  if (answer !== null) {
    if (answer === index) card.value.answer_index = list.length > 0 ? 0 : null;
    else if (answer > index) card.value.answer_index = answer - 1;
  }
}

async function load(): Promise<void> {
  if (isNew.value) {
    card.value = emptyCard();
    keywordsRaw.value = '';
    dirty.value = false;
    return;
  }
  loading.value = true;
  loadError.value = null;
  try {
    const loaded = await api.card(cardId.value);
    card.value = { ...emptyCard(), ...loaded };
    keywordsRaw.value = (loaded.keywords ?? []).join(', ');
    dirty.value = false;
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : '문제를 불러오지 못했습니다';
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  submitted.value = true;
  if (!canSave.value) {
    toast.error('입력하지 않은 항목이 있어요');
    return;
  }
  saving.value = true;
  try {
    const payload = normalizeCard({ ...card.value, keywords: parseKeywords(keywordsRaw.value) });
    if (isNew.value) {
      const created = await api.createCard(payload);
      dirty.value = false; // 이탈 경고가 뜨지 않도록 이동 전에 내린다
      toast.success('문제를 등록했습니다');
      await router.replace(`/cards/${created.id}/edit`);
    } else {
      await api.updateCard(cardId.value, payload);
      dirty.value = false;
      toast.success('문제를 수정했습니다');
    }
  } catch (e) {
    // 서버 검증이 화면 검증보다 엄격한 경우가 있다 — 이유를 그대로 보여준다.
    toast.error(e instanceof ApiError ? e.message : '저장하지 못했습니다');
  } finally {
    saving.value = false;
  }
}

/** 작성 중 이탈 경고 — 앱 내부 이동. */
onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm('저장하지 않은 변경사항이 있습니다. 이 페이지를 벗어날까요?');
});

/** 브라우저 새로고침·탭 닫기도 막는다(앱 내부 이동만 막으면 절반만 보호된다). */
function beforeUnload(e: BeforeUnloadEvent): void {
  if (!dirty.value) return;
  e.preventDefault();
  e.returnValue = '';
}

onMounted(() => {
  void load();
  window.addEventListener('beforeunload', beforeUnload);
});

// 라우트가 바뀌면(새 문제 ↔ 수정) 다시 불러온다.
watch(() => route.fullPath, () => void load());

// 컴포넌트가 사라지면 리스너를 반드시 뗀다 — 남기면 다른 화면에서도 경고가 뜬다.
onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload));

const TYPES: { value: CardType; label: string }[] = [
  { value: 'EXPLANATION', label: '설명형' },
  { value: 'OX', label: 'OX' },
  { value: 'CHOICE', label: '객관식' },
];
const DIFFS: { value: Difficulty; label: string }[] = [
  { value: 'EASY', label: '쉬움' },
  { value: 'MEDIUM', label: '보통' },
  { value: 'HARD', label: '어려움' },
];
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <RouterLink to="/cards" class="back">← 문제 목록</RouterLink>
        <h1 class="page-title">{{ isNew ? '문제 만들기' : '문제 수정' }}</h1>
        <p class="page-sub">학습자가 앱에서 보게 될 카드 한 장을 작성합니다</p>
      </div>
      <div class="row">
        <span v-if="dirty" class="badge badge-amber">저장 안 됨</span>
        <button class="btn btn-primary" type="button" :disabled="saving" @click="save">
          <span v-if="saving" class="spinner" aria-hidden="true" />
          {{ saving ? '저장 중…' : isNew ? '등록하기' : '저장하기' }}
        </button>
      </div>
    </div>

    <div v-if="loadError" class="card err-card" role="alert">
      <div class="card-body">
        <p class="err-msg">{{ loadError }}</p>
        <button class="btn btn-sm" type="button" @click="load">다시 시도</button>
      </div>
    </div>

    <div v-else-if="loading" class="card">
      <div class="card-body loading"><span class="spinner" aria-hidden="true" /> 불러오는 중…</div>
    </div>

    <div v-else class="editor">
      <!-- 입력 -->
      <form class="col" @submit.prevent="save">
        <section class="card">
          <div class="card-head"><h2 class="card-title">분류</h2></div>
          <div class="card-body">
            <div class="two">
              <label class="field">
                <span class="label">분야 <b class="req">*</b></span>
                <input
                  v-model="card.category_cd"
                  class="input"
                  :class="{ 'input-error': showError('category_cd') }"
                  placeholder="예: ELEC, 전기 위험"
                  @blur="touch('category_cd')"
                />
                <span v-if="showError('category_cd')" class="hint hint-error">
                  {{ showError('category_cd') }}
                </span>
              </label>
              <label class="field">
                <span class="label">중분류</span>
                <input v-model="card.sub_category_nm" class="input" placeholder="예: 배선설비" />
              </label>
            </div>
            <div class="two">
              <label class="field">
                <span class="label">소분류(주제)</span>
                <input v-model="card.topic_nm" class="input" placeholder="예: 누전차단기" />
              </label>
              <label class="field">
                <span class="label">키워드 (쉼표 구분)</span>
                <input v-model="keywordsRaw" class="input" placeholder="ELB, 감전, 누설전류" />
              </label>
            </div>
            <label class="field">
              <span class="label">카드명</span>
              <input v-model="card.title_txt" class="input" placeholder="예: 누전차단기의 목적" />
              <span class="hint">비워 두면 목록에 문제 내용이 대신 표시됩니다.</span>
            </label>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2 class="card-title">문제</h2></div>
          <div class="card-body">
            <div class="two">
              <div class="field">
                <span class="label">형식 <b class="req">*</b></span>
                <div class="seg-group" role="group" aria-label="문제 형식">
                  <button
                    v-for="t in TYPES"
                    :key="t.value"
                    type="button"
                    class="seg-btn"
                    :class="{ 'seg-btn-on': card.card_type_cd === t.value }"
                    :aria-pressed="card.card_type_cd === t.value"
                    @click="onTypeChange(t.value)"
                  >
                    {{ t.label }}
                  </button>
                </div>
              </div>
              <div class="field">
                <span class="label">난이도 <b class="req">*</b></span>
                <div class="seg-group" role="group" aria-label="난이도">
                  <button
                    v-for="d in DIFFS"
                    :key="d.value"
                    type="button"
                    class="seg-btn"
                    :class="{ 'seg-btn-on': card.difficulty_cd === d.value }"
                    :aria-pressed="card.difficulty_cd === d.value"
                    @click="card.difficulty_cd = d.value"
                  >
                    {{ d.label }}
                  </button>
                </div>
              </div>
            </div>

            <label class="field">
              <span class="label">상황 설명 (선택)</span>
              <textarea
                v-model="card.situation_txt"
                class="textarea"
                rows="2"
                placeholder="현장 상황을 묘사하면 문제가 더 실감 납니다"
              />
            </label>

            <label class="field">
              <span class="label">문제 내용 <b class="req">*</b></span>
              <textarea
                v-model="card.question_txt"
                class="textarea"
                :class="{ 'input-error': showError('question_txt') }"
                rows="3"
                placeholder="핵심 질문을 한 문장으로"
                @blur="touch('question_txt')"
              />
              <span v-if="showError('question_txt')" class="hint hint-error">
                {{ showError('question_txt') }}
              </span>
            </label>

            <!-- 보기 · 정답 -->
            <div v-if="card.card_type_cd !== 'EXPLANATION'" class="field">
              <span class="label">보기와 정답 <b class="req">*</b></span>
              <p class="hint choice-hint">왼쪽 동그라미를 눌러 정답을 지정하세요.</p>
              <ul class="choices">
                <li v-for="(_, i) in card.choices ?? []" :key="i">
                  <input
                    :id="`answer-${i}`"
                    v-model="card.answer_index"
                    type="radio"
                    :value="i"
                    name="answer"
                    class="radio"
                    :aria-label="`${i + 1}번을 정답으로 지정`"
                  />
                  <input
                    v-model="card.choices![i]"
                    class="input"
                    :placeholder="`보기 ${i + 1}`"
                    :readonly="card.card_type_cd === 'OX'"
                    @blur="touch('choices')"
                  />
                  <button
                    v-if="card.card_type_cd === 'CHOICE' && (card.choices?.length ?? 0) > 2"
                    class="btn btn-sm"
                    type="button"
                    :aria-label="`보기 ${i + 1} 삭제`"
                    @click="removeChoice(i)"
                  >
                    ✕
                  </button>
                </li>
              </ul>
              <button
                v-if="card.card_type_cd === 'CHOICE'"
                class="btn btn-sm add"
                type="button"
                @click="addChoice"
              >
                + 보기 추가
              </button>
              <span v-if="showError('choices')" class="hint hint-error">
                {{ showError('choices') }}
              </span>
              <span v-if="showError('choices_answer')" class="hint hint-error">
                {{ showError('choices_answer') }}
              </span>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2 class="card-title">해설 (카드 뒷면)</h2></div>
          <div class="card-body">
            <label class="field">
              <span class="label">핵심 원리 <b class="req">*</b></span>
              <textarea
                v-model="card.principle_txt"
                class="textarea"
                :class="{ 'input-error': showError('principle_txt') }"
                rows="4"
                placeholder="왜 그런지를 설명합니다. 학습자가 뒷면에서 보는 내용입니다."
                @blur="touch('principle_txt')"
              />
              <span v-if="showError('principle_txt')" class="hint hint-error">
                {{ showError('principle_txt') }}
              </span>
            </label>
            <label class="field">
              <span class="label">결론 한 줄 (선택)</span>
              <input
                v-model="card.conclusion_txt"
                class="input"
                placeholder="예: ELB=감전 보호, MCCB=과부하 보호"
              />
            </label>
            <div class="two">
              <label class="field">
                <span class="label">출처 (선택)</span>
                <input v-model="card.source_txt" class="input" placeholder="예: KEC 211" />
              </label>
              <label class="field">
                <span class="label">학습 시간(초)</span>
                <input
                  v-model.number="card.study_seconds"
                  class="input"
                  type="number"
                  min="10"
                  max="600"
                />
                <span class="hint">오늘의 학습 3분을 채우는 데 쓰입니다.</span>
              </label>
            </div>
          </div>
        </section>
      </form>

      <!-- 미리보기 -->
      <aside class="col col-aside">
        <section class="card">
          <div class="card-head">
            <h2 class="card-title">미리보기</h2>
            <span class="hint">학습자가 보는 화면</span>
          </div>
          <div class="card-body">
            <div class="preview">
              <div class="pv-tag">{{ card.category_cd || '분야' }}</div>
              <p v-if="card.situation_txt" class="pv-situation">{{ card.situation_txt }}</p>
              <p class="pv-question">{{ card.question_txt || '문제 내용이 여기 표시됩니다' }}</p>
              <ul v-if="card.card_type_cd !== 'EXPLANATION'" class="pv-choices">
                <li
                  v-for="(c, i) in card.choices ?? []"
                  :key="i"
                  :class="{ 'pv-answer': card.answer_index === i }"
                >
                  {{ c || `보기 ${i + 1}` }}
                  <span v-if="card.answer_index === i" class="pv-check">정답</span>
                </li>
              </ul>
            </div>

            <div class="preview pv-back">
              <div class="pv-tag pv-tag-back">해설</div>
              <p class="pv-principle">
                {{ card.principle_txt || '해설이 여기 표시됩니다' }}
              </p>
              <p v-if="card.conclusion_txt" class="pv-conclusion">{{ card.conclusion_txt }}</p>
              <p v-if="card.source_txt" class="pv-source">출처 · {{ card.source_txt }}</p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.back {
  font-size: 12.5px;
  font-weight: 600;
  display: inline-block;
  margin-bottom: 5px;
}
.editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 16px;
  align-items: start;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
/*
 * 미리보기 고정.
 * sticky 는 '그리드 아이템' 에 걸어야 한다. 안쪽 카드에 걸면 부모(.col)가
 * 콘텐츠 높이라 붙어 있을 여유가 없어 그냥 함께 스크롤돼 버린다.
 * 그리드 아이템은 align-items:start 여도 자기 그리드 영역(행 높이) 안에서 붙는다.
 */
.col-aside {
  position: sticky;
  top: 16px;
}
.two {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 0 12px;
}
.req {
  color: var(--red);
  font-weight: 700;
}
.loading {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text-muted);
}
.err-card {
  border-color: var(--red);
}
.err-msg {
  margin: 0 0 10px;
  color: var(--red);
  font-weight: 600;
}

.seg-group {
  display: inline-flex;
  border: 1px solid var(--border-strong);
  border-radius: var(--r);
  overflow: hidden;
}
.seg-btn {
  border: none;
  background: var(--surface);
  padding: 7px 14px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  border-right: 1px solid var(--border);
}
.seg-btn:last-child {
  border-right: none;
}
.seg-btn-on {
  background: var(--blue);
  color: #fff;
}

.choices {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.choices li {
  display: flex;
  align-items: center;
  gap: 9px;
}
.radio {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  accent-color: var(--blue);
  cursor: pointer;
}
.choice-hint {
  margin-top: -2px;
  margin-bottom: 7px;
}
.add {
  margin-bottom: 4px;
}

.preview {
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 14px;
  background: var(--surface-alt);
}
.pv-back {
  margin-top: 10px;
  background: var(--blue-weak);
  border-color: transparent;
}
.pv-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  color: var(--blue-strong);
  background: #fff;
  border-radius: 999px;
  padding: 2px 9px;
  margin-bottom: 9px;
}
.pv-tag-back {
  color: var(--violet);
}
.pv-situation {
  margin: 0 0 7px;
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.6;
}
.pv-question {
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
  line-height: 1.6;
}
.pv-choices {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pv-choices li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 8px 11px;
  font-size: 13px;
}
.pv-answer {
  border-color: var(--green);
  background: var(--green-weak);
  font-weight: 700;
}
.pv-check {
  font-size: 10.5px;
  font-weight: 800;
  color: var(--green);
  flex-shrink: 0;
}
.pv-principle {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
}
.pv-conclusion {
  margin: 10px 0 0;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--blue-strong);
}
.pv-source {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--text-faint);
}

@media (max-width: 1020px) {
  .editor {
    grid-template-columns: 1fr;
  }
  .col-aside {
    position: static;
  }
}
</style>
