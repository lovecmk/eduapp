/** 고객센터 문의 한 건. */
export interface SupportInquiryInput {
  /** 문의 유형(화면의 칩 라벨 그대로). */
  category: string;
  /** 답변받을 이메일. */
  email: string;
  message: string;
}

/** 서버가 접수한 문의 — 접수 번호를 사용자에게 안내할 수 있다. */
export interface SubmittedInquiry {
  id: string;
}

/**
 * 고객센터 문의 접수.
 *
 * 예전 문의 창은 저장소 없이 0.9초를 기다린 뒤 "문의가 접수되었어요 · 24시간 이내
 * 답변"을 띄웠다 — **아무 데도 보내지 않았다.** 법적 고지(LEGAL_META.contactChannel)는
 * 이 창을 1차 문의 창구로 안내하고 있어서, 계정·개인정보 문의가 조용히 사라졌다.
 * 접수 성공은 서버가 2xx 로 답했을 때만 말한다.
 */
export interface ISupportRepository {
  submit(input: SupportInquiryInput): Promise<SubmittedInquiry>;
}
