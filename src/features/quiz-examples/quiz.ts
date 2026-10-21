/** Versioned example contract. No persistence or learning/SRS side effects. */
export type QuizOption = { id: string; text: string };
type QuizBase = { version: 1; id: string; title: string; question: string; explanation: string };
export type QuizExample = QuizBase & (
  | { kind: 'multiple'; options: QuizOption[]; correctIds: string[] }
  | { kind: 'ordering'; options: QuizOption[]; correctOrder: string[] }
  | { kind: 'matching'; left: QuizOption[]; right: QuizOption[]; correctPairs: [string, string][] }
);
export type QuizResponse = { ids: string[]; pairs: [string, string][] };
export type QuizState = { response: QuizResponse; submitted: boolean; activeLeft: string | null };
export type QuizAction =
  | { type: 'toggle'; id: string }
  | { type: 'left'; id: string }
  | { type: 'pair'; id: string }
  | { type: 'submit' }
  | { type: 'reset' };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 2000;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,39}$/.test(value);
const unique = (items: string[]): boolean => new Set(items).size === items.length;
function options(value: unknown): value is QuizOption[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 8 &&
    value.every(item => record(item) && id(item.id) && text(item.text)) &&
    unique(value.map(item => item.id)) && unique(value.map(item => item.text.trim()));
}
function subset(value: unknown, all: string[]): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && all.includes(item)) && unique(value);
}

/** Reject malformed IDs, duplicate labels and ambiguous/incomplete answer keys. */
export function parseQuiz(value: unknown): QuizExample | null {
  if (!record(value) || value.version !== 1 || !id(value.id) || !text(value.title) || !text(value.question) || !text(value.explanation)) return null;
  if (value.kind === 'multiple' || value.kind === 'ordering') {
    if (!options(value.options)) return null;
    const ids = value.options.map(item => item.id);
    const answer = value.kind === 'multiple' ? value.correctIds : value.correctOrder;
    if (!subset(answer, ids) || (value.kind === 'multiple' ? answer.length < 2 : answer.length !== ids.length)) return null;
  } else if (value.kind === 'matching') {
    if (!options(value.left) || !options(value.right) || value.left.length !== value.right.length || !Array.isArray(value.correctPairs)) return null;
    const left = value.left.map(item => item.id), right = value.right.map(item => item.id);
    if (value.correctPairs.length !== left.length || !value.correctPairs.every(pair => Array.isArray(pair) && pair.length === 2 && left.includes(pair[0]) && right.includes(pair[1]))) return null;
    if (!unique(value.correctPairs.map(pair => pair[0])) || !unique(value.correctPairs.map(pair => pair[1]))) return null;
  } else return null;
  // Own the data: later edits to an imported object must not change its answer key.
  return JSON.parse(JSON.stringify(value)) as QuizExample;
}

export function initialQuizState(quiz: QuizExample): QuizState {
  return { response: { ids: [], pairs: [] }, submitted: false, activeLeft: quiz.kind === 'matching' ? quiz.left[0].id : null };
}

export function responseIsComplete(quiz: QuizExample, response: unknown): response is QuizResponse {
  if (!record(response) || !Array.isArray(response.ids) || !Array.isArray(response.pairs)) return false;
  if (quiz.kind !== 'matching') {
    return response.pairs.length === 0 && subset(response.ids, quiz.options.map(item => item.id)) &&
      (quiz.kind === 'multiple' ? response.ids.length > 0 : response.ids.length === quiz.options.length);
  }
  const left = quiz.left.map(item => item.id), right = quiz.right.map(item => item.id);
  return response.ids.length === 0 && response.pairs.length === left.length &&
    response.pairs.every(pair => Array.isArray(pair) && pair.length === 2 && left.includes(pair[0]) && right.includes(pair[1])) &&
    unique(response.pairs.map(pair => pair[0])) && unique(response.pairs.map(pair => pair[1]));
}

/** No partial credit: all and only the correct choices/order/pairs must match. */
export function gradeQuiz(quiz: QuizExample, response: QuizResponse): 'correct' | 'incorrect' | 'incomplete' {
  if (!responseIsComplete(quiz, response)) return 'incomplete';
  const correct = quiz.kind === 'multiple'
    ? response.ids.length === quiz.correctIds.length && quiz.correctIds.every(answer => response.ids.includes(answer))
    : quiz.kind === 'ordering'
      ? quiz.correctOrder.every((answer, index) => response.ids[index] === answer)
      : quiz.correctPairs.every(([left, right]) => response.pairs.some(pair => pair[0] === left && pair[1] === right));
  return correct ? 'correct' : 'incorrect';
}

export function quizReducer(quiz: QuizExample, state: QuizState, action: QuizAction): QuizState {
  if (action.type === 'reset') return initialQuizState(quiz);
  if (state.submitted) return state;
  if (action.type === 'submit') return responseIsComplete(quiz, state.response) ? { ...state, submitted: true } : state;
  if (action.type === 'toggle' && quiz.kind !== 'matching' && quiz.options.some(option => option.id === action.id)) {
    const ids = state.response.ids.includes(action.id) ? state.response.ids.filter(item => item !== action.id) : [...state.response.ids, action.id];
    return { ...state, response: { ids, pairs: [] } };
  }
  if (quiz.kind === 'matching') {
    if (action.type === 'left' && quiz.left.some(option => option.id === action.id)) return { ...state, activeLeft: action.id };
    if (action.type === 'pair' && state.activeLeft && quiz.left.some(option => option.id === state.activeLeft) && quiz.right.some(option => option.id === action.id)) {
      // Reusing a right-hand item unpairs its previous owner instead of duplicating it.
      const pairs: [string, string][] = [...state.response.pairs.filter(([left, right]) => left !== state.activeLeft && right !== action.id), [state.activeLeft, action.id]];
      return { ...state, response: { ids: [], pairs }, activeLeft: quiz.left.find(option => !pairs.some(pair => pair[0] === option.id))?.id ?? state.activeLeft };
    }
  }
  return state;
}

export const QUIZ_KIND_LABEL = { multiple: '복수정답', ordering: '순서맞추기', matching: '연결하기' } as const;
export const QUIZ_INSTRUCTION = {
  multiple: '정답을 모두 고른 뒤 정답 확인을 눌러 주세요. 일부만 맞으면 오답입니다.',
  ordering: '보기를 순서대로 눌러 주세요. 선택한 항목을 다시 누르면 취소할 수 있어요.',
  matching: '왼쪽 항목을 고른 뒤 오른쪽 설명을 눌러 주세요. 같은 설명을 다시 쓰면 이전 연결이 해제됩니다.',
} as const;

export function answerSummary(quiz: QuizExample): string {
  if (quiz.kind === 'matching') return quiz.correctPairs.map(([left, right]) => `${quiz.left.find(item => item.id === left)!.text} → ${quiz.right.find(item => item.id === right)!.text}`).join('\n');
  const ids = quiz.kind === 'multiple' ? quiz.correctIds : quiz.correctOrder;
  return ids.map(id => quiz.options.find(item => item.id === id)!.text).join(quiz.kind === 'multiple' ? ', ' : ' → ');
}
