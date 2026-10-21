import raw from '../examples.json';
import { QUIZ_EXAMPLES } from '../examples';
import { answerSummary, gradeQuiz, initialQuizState, parseQuiz, quizReducer, responseIsComplete, type QuizExample, type QuizResponse } from '../quiz';

const [multiple, ordering, matching] = QUIZ_EXAMPLES;
const response = (ids: string[]): QuizResponse => ({ ids, pairs: [] });
function correctResponse(quiz: QuizExample): QuizResponse {
  return quiz.kind === 'matching' ? { ids: [], pairs: quiz.correctPairs } : response(quiz.kind === 'multiple' ? quiz.correctIds : quiz.correctOrder);
}

describe('versioned example questions', () => {
  it('ships three valid, distinct kinds with readable answers', () => {
    expect(QUIZ_EXAMPLES).toHaveLength(3);
    expect(new Set(QUIZ_EXAMPLES.map(quiz => quiz.kind)).size).toBe(3);
    for (const quiz of QUIZ_EXAMPLES) {
      expect(parseQuiz(quiz)).toEqual(quiz);
      expect(answerSummary(quiz)).toBeTruthy();
      expect(gradeQuiz(quiz, correctResponse(quiz))).toBe('correct');
      expect(gradeQuiz(quiz, initialQuizState(quiz).response)).toBe('incomplete');
    }
  });

  it.each([null, [], {}, { ...raw[0], version: 2 }, { ...raw[0], kind: 'unknown' }, { ...raw[0], title: '' }, { ...raw[0], id: '__proto__' },
    { ...raw[0], options: [{ id: 'a', text: 'A' }, { id: 'a', text: 'B' }] },
    { ...raw[0], options: [{ id: 'a', text: 'A' }, { id: 'b', text: ' A ' }] },
    { ...raw[0], correctIds: ['fuel'] }, { ...raw[0], correctIds: ['fuel', 'fuel'] }, { ...raw[0], correctIds: ['fuel', 'unknown'] },
    { ...raw[1], correctOrder: ['enter', 'check'] }, { ...raw[1], correctOrder: ['enter', 'enter', 'save'] },
    { ...raw[2], correctPairs: [['fuel', 'material']] },
    { ...raw[2], correctPairs: [['fuel', 'energy'], ['oxygen', 'energy'], ['ignition', 'support']] },
    { ...raw[2], correctPairs: [['fuel', 'energy'], ['fuel', 'material'], ['ignition', 'support']] },
    { ...raw[2], correctPairs: [['fuel', 'unknown'], ['oxygen', 'support'], ['ignition', 'energy']] },
  ])('rejects malformed/ambiguous content %j', value => {
    expect(parseQuiz(value)).toBeNull();
  });

  it('owns parsed answer keys', () => {
    const input = JSON.parse(JSON.stringify(multiple));
    const parsed = parseQuiz(input)!;
    input.correctIds[0] = 'water';
    expect(gradeQuiz(parsed, correctResponse(multiple))).toBe('correct');
  });
});

describe('exact grading and safe state transitions', () => {
  it('multiple answers ignore selection order and reject partial/extra answers', () => {
    expect(gradeQuiz(multiple, response(['ignition', 'fuel', 'oxygen']))).toBe('correct');
    expect(gradeQuiz(multiple, response(['fuel', 'oxygen']))).toBe('incorrect');
    expect(gradeQuiz(multiple, response(['fuel', 'oxygen', 'ignition', 'water']))).toBe('incorrect');
    expect(gradeQuiz(multiple, response(['fuel', 'fuel', 'oxygen']))).toBe('incomplete');
    expect(gradeQuiz(multiple, response(['fuel', 'unknown']))).toBe('incomplete');
  });

  it('ordering requires every item once and grades the exact order', () => {
    expect(gradeQuiz(ordering, response(['enter', 'save', 'check']))).toBe('incorrect');
    expect(gradeQuiz(ordering, response(['enter', 'check']))).toBe('incomplete');
    expect(gradeQuiz(ordering, response(['enter', 'enter', 'save']))).toBe('incomplete');
    let state = initialQuizState(ordering);
    for (const id of ['save', 'enter', 'save', 'check', 'save']) state = quizReducer(ordering, state, { type: 'toggle', id });
    expect(state.response.ids).toEqual(['enter', 'check', 'save']);
    expect(gradeQuiz(ordering, state.response)).toBe('correct');
  });

  it('matching allows only complete one-to-one pairs, in any row order', () => {
    const correct = correctResponse(matching);
    expect(gradeQuiz(matching, { ids: [], pairs: [...correct.pairs].reverse() })).toBe('correct');
    expect(gradeQuiz(matching, { ids: [], pairs: [['fuel', 'energy'], ['oxygen', 'support'], ['ignition', 'material']] })).toBe('incorrect');
    expect(gradeQuiz(matching, { ids: [], pairs: [['fuel', 'energy'], ['oxygen', 'energy'], ['ignition', 'material']] })).toBe('incomplete');
    expect(gradeQuiz(matching, { ids: [], pairs: [['fuel', 'material']] })).toBe('incomplete');
    let state = initialQuizState(matching);
    state = quizReducer(matching, state, { type: 'pair', id: 'material' });
    expect(state.activeLeft).toBe('oxygen');
    state = quizReducer(matching, state, { type: 'pair', id: 'material' });
    expect(state.response.pairs).toEqual([['oxygen', 'material']]);
    expect(state.activeLeft).toBe('fuel');
  });

  it.each(QUIZ_EXAMPLES)('locks $kind after submit, resets explicitly, and ignores unknown IDs', quiz => {
    const initial = initialQuizState(quiz);
    expect(quizReducer(quiz, initial, { type: 'submit' })).toBe(initial);
    expect(quizReducer(quiz, initial, { type: 'toggle', id: 'unknown' })).toBe(initial);
    expect(quizReducer(quiz, initial, { type: 'pair', id: 'unknown' })).toBe(initial);
    const ready = { ...initial, response: correctResponse(quiz) };
    const submitted = quizReducer(quiz, ready, { type: 'submit' });
    expect(submitted.submitted).toBe(true);
    expect(quizReducer(quiz, submitted, { type: 'toggle', id: 'fuel' })).toBe(submitted);
    expect(quizReducer(quiz, submitted, { type: 'pair', id: 'energy' })).toBe(submitted);
    expect(quizReducer(quiz, submitted, { type: 'submit' })).toBe(submitted);
    expect(quizReducer(quiz, submitted, { type: 'reset' })).toEqual(initial);
  });

  it.each([null, {}, { ids: 'fuel', pairs: [] }, { ids: [], pairs: [null] }, { ids: [], pairs: [['fuel']] }])('never grades an invalid runtime response %j', invalid => {
    for (const quiz of QUIZ_EXAMPLES) expect(responseIsComplete(quiz, invalid)).toBe(false);
  });
});
