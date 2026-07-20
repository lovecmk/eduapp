// 인증 상태 스토어 — PART 1.7 authStore (로그인/세션 복구)
import { create } from 'zustand';
import type { User } from '../domain/models/User';
import type { SignupInput, ProfileUpdateInput } from '../domain/repositories/IAuthRepository';
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
  register: (input: SignupInput) => Promise<boolean>;
  resetPassword: (username: string, email: string, newPassword: string) => Promise<boolean>;
  /** 내 정보(이름·닉네임·이메일·소속·직무) 부분 수정. 성공 시 true. */
  updateProfile: (patch: ProfileUpdateInput) => Promise<boolean>;
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

  register: async (input) => {
    set({ loading: true, error: null });
    try {
      const session = await authRepository.register(input);
      set({ user: session.user, loading: false });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '회원가입에 실패했습니다', loading: false });
      return false;
    }
  },

  resetPassword: async (username, email, newPassword) => {
    set({ loading: true, error: null });
    try {
      await authRepository.resetPassword(username, email, newPassword);
      set({ loading: false });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '비밀번호 재설정에 실패했습니다', loading: false });
      return false;
    }
  },

  updateProfile: async (patch) => {
    const current = useAuthStore.getState().user;
    if (!current) {
      set({ error: '로그인이 필요합니다' });
      return false;
    }
    set({ loading: true, error: null });
    try {
      const updated = await authRepository.updateProfile(current.id, patch);
      set({ user: updated, loading: false });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '정보 수정에 실패했습니다', loading: false });
      return false;
    }
  },

  clearError: () => set({ error: null }),
  setName: (name) => set((s) => ({ user: s.user ? { ...s.user, name } : null })),
}));
