import raw from './examples.json';
import { parseQuiz, type QuizExample } from './quiz';

/** Bundled examples only; never upload/seed these into the card repository. */
export const QUIZ_EXAMPLES: QuizExample[] = raw.flatMap(value => {
  const quiz = parseQuiz(value);
  return quiz ? [quiz] : [];
});
