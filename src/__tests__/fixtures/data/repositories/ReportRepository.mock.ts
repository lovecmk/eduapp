import type { IReportRepository, ReportInput } from '../../../../domain/repositories/IReportRepository';
import { useReportStore } from '../../../../store/reportStore';
import { delay } from '../../../../data/repositories/_delay';

/** 목업 신고 저장소 — 로컬에 접수 기록만 남긴다(운영자 전달은 실서버에서). */
export class MockReportRepository implements IReportRepository {
  async submit(input: ReportInput): Promise<void> {
    await delay(250);
    useReportStore.getState().submit({
      cardId: input.cardId,
      reason: input.reason,
      detail: input.detail ?? '',
    });
  }

  async listMine(): Promise<string[]> {
    await delay(80);
    return useReportStore.getState().reports.map((r) => r.cardId);
  }
}
