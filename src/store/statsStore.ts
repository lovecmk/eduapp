// 학습 통계 스토어 — PART 1.5
import { create } from 'zustand';
import type { StudyStats } from '../domain/models/StudyStats';
import { statsRepository } from '../data/repositories';

interface StatsState {
  stats: StudyStats | null;
  loading: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;
  reset: () => void;
}

export const useStatsStore = create<StatsState>((set) => ({
  stats: null,
  loading: false,
  error: null,
  fetchStats: async () => {
    set({ loading: true, error: null });
    try {
      const stats = await statsRepository.getStudyStats();
      set({ stats, loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '통계 불러오기 실패', loading: false });
    }
  },
  reset: () => set({ stats: null, loading: false, error: null }),
}));
