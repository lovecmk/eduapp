// 인증 상태 스토어 — PART 1.7 authStore (로그인/세션 복구)
import { create } from 'zustand';
import type { User } from '../domain/models/User';
import type { SignupInput, ProfileUpdateInput } from '../domain/repositories/IAuthRepository';
import { authRepository } from '../data/repositories';
import { setQueueOwner } from '../data/network/offlineQueue';

interface AuthState {
  user: User | null;
  loading: boolean;
  /** 앱 시작 시 토큰 기반 세션 복구가 끝났는지 */
  bootstrapped: boolean;
  error: string | null;
  login: (id: string, password: string) => Promise<boolean>;
  socialLogin: (name: string, email: string) => Promise<boolean>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
  register: (input: SignupInput) => Promise<boolean>;
  resetPassword: (username: string, email: string, newPassword: string) => Promise<boolean>;
  /** 내 정보(이름·닉네임·이메일·소속·직무) 부분 수정. 성공 시 true. */
  updateProfile: (patch: ProfileUpdateInput) => Promise<boolean>;
  clearError: () => void;
  setName: (name: string) => void;
}

/**
 * 세션이 바뀔 때마다 오프라인 큐에도 주인을 알려준다.
 *
 * 현장 태블릿은 여러 명이 돌려 쓴다. 이걸 빠뜨리면 A 가 오프라인에서 찍은 출석·채점이
 * 큐에 남아 있다가, B 가 로그인한 뒤 B 의 토큰으로 전송된다 — 안전교육 이력이
 * 엉뚱한 사람에게 붙는다. 큐는 항목마다 주인을 보고 남의 것은 건드리지 않는다.
 */
function bindSession(user: User | null): void {
  setQueueOwner(user?.id ?? null);
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
      bindSession(session.user);
      set({ user: session.user, loading: false });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '로그인에 실패했습니다', loading: false });
      return false;
    }
  },

  socialLogin: async (name, email) => {
    set({ loading: true, error: null });
    try {
      const session = await authRepository.socialLogin(name, email);
      bindSession(session.user);
      set({ user: session.user, loading: false });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '간편 로그인에 실패했습니다', loading: false });
      return false;
    }
  },

  logout: async () => {
    // 주인을 먼저 떼어 낸다. 로그아웃 도중 큐가 흐르더라도 남은 쓰기가
    // 곧 로그인할 다음 사람 앞으로 나가지 않게 하기 위해서다.
    bindSession(null);
    await authRepository.logout();
    set({ user: null });
  },

  restore: async () => {
    try {
      const user = await authRepository.restore();
      bindSession(user);
      set({ user, bootstrapped: true });
    } catch {
      bindSession(null);
      set({ user: null, bootstrapped: true });
    }
  },

  register: async (input) => {
    set({ loading: true, error: null });
    try {
      const session = await authRepository.register(input);
      bindSession(session.user);
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
