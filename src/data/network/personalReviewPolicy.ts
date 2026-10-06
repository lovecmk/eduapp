import { getSessionEpoch } from './sessionEpoch';
import { MASTERED_BOX, type Grade, type SrsCardState } from '../../domain/srs';

export interface PersonalReviewPolicy { first_days: number; repeat_days: number }
let policy: PersonalReviewPolicy | null = null;
let epoch = -1;
export function setPersonalReviewPolicy(value: PersonalReviewPolicy | null) {
  epoch = getSessionEpoch();
  policy = value && Number.isInteger(value.first_days) && Number.isInteger(value.repeat_days) && value.first_days >= 1 && value.repeat_days >= 1 && value.first_days <= 365 && value.repeat_days <= 365 ? value : null;
}
export function applyPersonalReviewPolicy(previous: SrsCardState, next: SrsCardState, grade: Grade): SrsCardState {
  if (!policy || epoch !== getSessionEpoch()) return next;
  const at = next.lastReviewedAt ?? Date.now();
  if (grade !== 'again' && grade !== 'hard') return { ...next, box: Math.max(MASTERED_BOX, next.box), dueAt: at + 36500 * 86400000 };
  const days = previous.lastGrade === 'again' || previous.lastGrade === 'hard' ? policy.repeat_days : policy.first_days;
  // KST calendar midnight is independent of the phone's timezone and DST.
  const kstMidnight = Math.floor((at + 9 * 3600000) / 86400000) * 86400000 - 9 * 3600000;
  return { ...next, dueAt: kstMidnight + days * 86400000 };
}

export function personalReviewHint(previous: SrsCardState, grade: Grade): string | null {
  if (!policy || epoch !== getSessionEpoch()) return null;
  if (grade !== 'again' && grade !== 'hard') return '복습 완료';
  return `${previous.lastGrade === 'again' || previous.lastGrade === 'hard' ? policy.repeat_days : policy.first_days}일 후 복습`;
}
