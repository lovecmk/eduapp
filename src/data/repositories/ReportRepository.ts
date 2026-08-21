import type { IReportRepository, ReportInput } from '../../domain/repositories/IReportRepository';
import { apiClient } from '../network/ApiClient';
import { sanitizeText, INPUT_LIMITS } from '../../utils/sanitize';

interface MyReportsDTO {
  card_ids?: string[];
}

/**
 * 카드 신고 접수 저장소(실서버).
 *  · POST /inner/api/v1/reports        → 신고 접수
 *  · GET  /inner/api/v1/reports/mine   → 내가 신고한 카드 id 목록
 *
 * 신고는 운영자가 반드시 확인해야 하는 데이터라 유실되면 안 된다 →
 * postDurable 로 오프라인에서도 큐에 쌓아 뒀다가 재전송한다.
 */
export class ReportRepository implements IReportRepository {
  async submit(input: ReportInput): Promise<void> {
    // 사용자 입력은 서버로 보내기 전에 정제한다(제어문자·과도한 길이 차단).
    const detail = input.detail
      ? sanitizeText(input.detail, { maxLength: INPUT_LIMITS.reportDetail, allowNewlines: true })
      : undefined;
    await apiClient.postDurable(
      '/inner/api/v1/reports',
      { card_id: input.cardId, reason: input.reason, detail },
      // 같은 카드에 대한 같은 사유의 신고는 한 번만 접수되게 한다.
      `report:${input.cardId}:${input.reason}`,
    );
  }

  async listMine(): Promise<string[]> {
    const dto = await apiClient.get<MyReportsDTO>('/inner/api/v1/reports/mine');
    return dto.card_ids ?? [];
  }
}
