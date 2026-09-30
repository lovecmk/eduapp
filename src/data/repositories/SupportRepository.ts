import type { ISupportRepository, SubmittedInquiry, SupportInquiryInput } from '../../domain/repositories/ISupportRepository';
import { apiClient } from '../network/ApiClient';
import { env } from '../network/env';
import { sanitizeText, INPUT_LIMITS } from '../../utils/sanitize';
import { Platform } from 'react-native';

interface InquiryDTO {
  id?: string | number;
}

/**
 * 고객센터 문의(실서버) — `POST /inner/api/v1/support/inquiries` (docs/API_CONTRACT §6-5).
 *
 * 오프라인 큐(postDurable)에 태우지 않는다. 문의는 '보냈다'는 확인을 사람이 기다리는
 * 행위라, 큐에 넣고 "접수되었어요"라고 하면 연결이 돌아오기 전까지는 다시 거짓말이 된다.
 * 실패는 그대로 던지고 화면이 사유(연결 없음 / 창구 미개설)를 말하게 한다.
 */
export class SupportRepository implements ISupportRepository {
  async submit(input: SupportInquiryInput): Promise<SubmittedInquiry> {
    const dto = await apiClient.post<InquiryDTO>('/inner/api/v1/support/inquiries', {
      category: input.category,
      email: input.email.trim(),
      message: sanitizeText(input.message, { maxLength: INPUT_LIMITS.supportMessage, allowNewlines: true }),
      // 답변하는 사람이 재현할 수 있게 — 어떤 빌드·기기에서 겪은 일인가.
      app_version: env.build.version,
      build_number: env.build.buildNumber,
      platform: Platform.OS,
    });
    return { id: dto?.id != null ? String(dto.id) : '' };
  }
}
