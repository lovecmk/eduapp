import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ReportReason = 'wrong_question' | 'wrong_answer' | 'typo' | 'outdated' | 'etc';

export interface CardReport {
  cardId: string;
  reason: ReportReason;
  detail: string;
  ts: number;
}

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  wrong_question: '문제 오류',
  wrong_answer: '정답 오류',
  typo: '오탈자·표현',
  outdated: '기준 변경·최신화',
  etc: '기타',
};

interface ReportState {
  reports: CardReport[];
  submit: (report: Omit<CardReport, 'ts'>) => void;
  hasReported: (cardId: string) => boolean;
}

/**
 * 카드 내용 수정 요청(이의제기) 저장소.
 * 실제 서비스에서는 서버로 전송하지만, 여기서는 로컬에 기록해 "요청됨" 상태를 유지한다.
 */
export const useReportStore = create<ReportState>()(
  persist(
    (set, get) => ({
      reports: [],
      submit: (report) => set((s) => ({ reports: [{ ...report, ts: Date.now() }, ...s.reports] })),
      hasReported: (cardId) => get().reports.some((r) => r.cardId === cardId),
    }),
    { name: 'card-reports', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
