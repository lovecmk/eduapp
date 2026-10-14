import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 모델은 domain 으로 옮겨 서버 저장소(IReportRepository)와 공유한다.
export type { ReportReason, CardReport } from '../domain/models/CardReport';
export { REPORT_REASON_LABEL } from '../domain/models/CardReport';
import type { CardReport } from '../domain/models/CardReport';

interface ReportState {
  reports: CardReport[];
  submit: (report: Omit<CardReport, 'ts'>) => void;
  hasReported: (cardId: string) => boolean;
}

/**
 * 카드 내용 수정 요청(이의제기) 저장소.
 * 서버 접수 또는 오프라인 전송 큐 저장에 성공한 신고를 기록해 UI 상태를 유지한다.
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
