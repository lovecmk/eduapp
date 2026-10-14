import type { ReportReason } from '../models/CardReport';

export interface ReportInput {
  cardId: string;
  reason: ReportReason;
  /** 사용자가 적은 상세 설명(선택) */
  detail?: string;
}

export interface SubmittedReport extends ReportInput {
  /** 서버가 부여한 접수 번호 — 사용자에게 안내할 수 있다. */
  id: string;
  submittedAt: string;
}

/**
 * 카드 신고 접수.
 *
 * 신고는 '운영자가 반드시 봐야 하는' 데이터라 로컬 보관으로는 의미가 없다.
 * 네트워크가 끊긴 현장에서 접수해도 유실되지 않도록 오프라인 큐를 태운다.
 */
export type ReportSubmission = 'sent' | 'queued';

export interface IReportRepository {
  submit(input: ReportInput): Promise<ReportSubmission>;
  /** 내가 이미 신고한 카드 id 목록(중복 신고 방지·UI 표시용). */
  listMine(): Promise<string[]>;
}
