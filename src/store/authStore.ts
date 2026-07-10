// 인증 상태 스토어 — PART 1.7 authStore (로그인/세션 복구)
import { create } from 'zustand';
import type { User } from '../domain/models/User';
import { authRepository } from '../data/repositories';

interface AuthState {
  user: User | null;
  loading: boolean;
  /** 앱 시작 시 토큰 기반 세션 복구가 끝났는지 */
  bootstrapped: boolean;
  error: string | null;
  login: (id: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
  clearError: () => void;
  setName: (name: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  bootstrapped: false,
  error: null,

  login: async (id, password) => {
    set({ loading: true, error: null });
    try {
      const session = await authRepository.login(id, password);
      set({ user: session.user, loading: false });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '로그인에 실패했습니다', loading: false });
      return false;
    }
  },

  logout: async () => {
    await authRepository.logout();
    set({ user: null });
  },

  restore: async () => {
    try {
      const user = await authRepository.restore();
      set({ user, bootstrapped: true });
    } catch {
      set({ user: null, bootstrapped: true });
    }
  },

  clearError: () => set({ error: null }),
  setName: (name) => set((s) => ({ user: s.user ? { ...s.user, name } : null })),
}));
