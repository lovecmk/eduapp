import type { ISupportRepository, SubmittedInquiry, SupportInquiryInput } from '../../domain/repositories/ISupportRepository';
import { delay } from './_delay';

/** 목업 문의 저장소 — 서버 없이 화면 흐름만 확인한다(아무 데도 전달되지 않는다). */
export class MockSupportRepository implements ISupportRepository {
  async submit(_input: SupportInquiryInput): Promise<SubmittedInquiry> {
    await delay(600);
    return { id: `mock-${Date.now().toString(36)}` };
  }
}
