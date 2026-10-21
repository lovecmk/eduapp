/** These formats reuse CHOICE; answer text is the canonical selected label. */
export const SINGLE_CHOICE_FORMATS = ['현장판단형', '선택비교형'] as const;
export const BASE_CARD_FORMATS = ['기초용어형', '상황형', 'OX형', '빈칸형'] as const;
/** Missing capability is an old server. Never generate unsupported formats. */
export function supportedCardFormats(reported: unknown): string[] {
  const enabled = Array.isArray(reported) ? reported : [];
  return [...BASE_CARD_FORMATS, ...SINGLE_CHOICE_FORMATS.filter(format => enabled.includes(format))];
}
export function isSingleChoiceFormat(format: string): boolean {
  return (SINGLE_CHOICE_FORMATS as readonly string[]).includes(format);
}
export function choiceCount(format: string): number {
  return format === '현장판단형' ? 3 : 2;
}
export function choiceQuestionError(format: string, choices: readonly string[], answer: string, situation = ''): string {
  if (!isSingleChoiceFormat(format)) return '';
  if (format === '현장판단형' && !situation.trim()) return '현장판단형에는 상황설명을 입력해 주세요';
  if (choices.length !== choiceCount(format) || choices.some(value => !value.trim())) return `${format} 보기는 비어 있지 않은 ${choiceCount(format)}개여야 합니다`;
  if (choices.some(value => /[\r\n]/.test(value))) return '각 보기는 한 줄로 입력해 주세요';
  if (new Set(choices.map(value => value.trim())).size !== choices.length) return '보기는 서로 달라야 합니다';
  if (!choices.some(value => value.trim() === answer.trim())) return '정답은 보기 중 하나와 같아야 합니다';
  return '';
}
export function choiceQuizFields(format: string, choiceText: string, answer: string) {
  if (!isSingleChoiceFormat(format)) return {};
  const choices = choiceText.replace(/\r\n/g, '\n').split('\n').map(value => value.trim());
  const index = choices.indexOf(answer.trim());
  return { choices, answer_index: index < 0 ? null : index };
}
