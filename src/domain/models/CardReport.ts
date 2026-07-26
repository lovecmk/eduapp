// 카드 신고(이의제기) 도메인 모델 — 서버 저장소와 로컬 스토어가 공유한다.
export type ReportReason = 'wrong_question' | 'wrong_answer' | 'typo' | 'outdated' | 'etc';

export interface CardReport {
  cardId: string;
  reason: ReportReason;
  detail: string;
  /** 접수 시각(epoch ms) */
  ts: number;
}

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  wrong_question: '문제 오류',
  wrong_answer: '정답 오류',
  typo: '오탈자·표현',
  outdated: '기준 변경·최신화',
  etc: '기타',
};
