// 인증 상태 스토어 — PART 1.7 authStore (로그인/세션 복구)
import { create } from 'zustand';
import type { User } from '../domain/models/User';
import type { SignupInput, ProfileUpdateInput } from '../domain/repositories/IAuthRepository';
import { authRepository } from '../data/repositories';
import { ADMIN_DEMO_USER } from '../data/auth/adminDemoAccount';
import { setQueueOwner } from '../data/network/offlineQueue';
import { applySessionOwner } from './sessionScope';
import { ApiError } from '../data/network/errors';
import { onSessionExpired } from '../data/network/sessionEvents';
import { advanceSessionEpoch, getSessionEpoch } from '../data/network/sessionEpoch';

interface AuthState {
  user: User | null;
  loading: boolean;
  /** 앱 시작 시 토큰 기반 세션 복구가 끝났는지 */
  bootstrapped: boolean;
  error: string | null;
  /**
   * 서버가 이 세션을 **거절해서** 로그아웃된 경우의 사유.
   *
   * 계정이 정지되면 서버는 다음 요청부터 403 으로 막는다. 예전에는 restore() 의
   * catch 가 그 오류를 통째로 삼켜, 사용자는 아무 설명 없이 로그인 화면으로
   * 돌아왔다 — 정지된 사실도, 왜인지도 모른 채 다시 로그인만 시도하게 된다.
   * 그건 오류를 숨긴 것이지 처리한 것이 아니다.
   *
   * 만료(401)와 정지(403)를 구분하지는 않는다. 사용자에게 필요한 것은 상태
   * 코드가 아니라 '무엇을 해야 하는가'이고, 서버가 사유를 문장으로 주면 그
   * 문장을 그대로 보여준다.
   */
  sessionEndedReason: string | null;
  /**
   * 이 세션이 **저장된 토큰으로 되살아났는가** — 생체인증 잠금의 대상.
   *
   * 방금 비밀번호로 들어온 사람에게 곧바로 지문을 또 묻는 것은 절차가 아니라
   * 소음이다. 잠금이 지키려는 것은 '주머니에서 꺼낸 폰을 남이 여는 순간'이므로,
   * 앱을 새로 켜서 세션이 복구된 경우에만 true 가 된다(BiometricLockGate).
   */
  needsUnlock: boolean;
  /** 생체인증을 통과했다 — 이 실행 동안은 다시 묻지 않는다. */
  unlock: () => void;
  login: (id: string, password: string) => Promise<boolean>;
  socialLogin: (name: string, email: string) => Promise<boolean>;
  /** 관리자 모드 진입 — 로그인 화면 로고 5번 두드리기 전용(아래 구현의 주석 참고). */
  adminLogin: () => Promise<boolean>;
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
 * 세션이 바뀔 때마다 '이 기기에 남는 것들'의 주인을 함께 갱신한다.
 *
 * 현장 태블릿은 여러 명이 돌려 쓴다. 주인 개념이 없으면
 *  · 오프라인 큐: A 가 찍은 출석이 B 의 토큰으로 전송되고,
 *  · persist 스토어: B 가 A 의 복습 스케줄·출석·하루 학습 상한을 물려받는다.
 * 둘 다 안전교육 이력이 엉뚱한 사람에게 붙는 결과라 반드시 같이 처리해야 한다.
 *
 * ⚠️ 반드시 **await 한 뒤에** user 를 set 할 것 — 정리가 끝나기 전에 화면이 바뀌면
 *    새 사용자가 앞사람 데이터를 한 프레임 보게 된다.
 */
async function bindSession(user: User | null): Promise<void> {
  setQueueOwner(user?.id ?? null);
  await applySessionOwner(user?.id ?? null);
}

/**
 * 세션이 끝난 사유를 사용자에게 보일 한 문장으로 만든다.
 *
 * 서버가 사유를 적어 보내면(정지 사유 등) 그 문장이 가장 정확하므로 그대로 쓴다.
 * 없을 때만 상태 코드에 맞는 기본 문장을 쓴다 — '오류가 발생했습니다'로 뭉개면
 * 사용자는 자기 계정에 무슨 일이 일어났는지 영영 알 수 없다.
 */
function sessionEndedMessage(err: ApiError | null): string {
  const fromServer = err?.message?.trim();
  if (fromServer && !/^\d+$/.test(fromServer)) return fromServer;
  if (err?.kind === 'forbidden') return '이용이 제한된 계정입니다. 관리자에게 문의해 주세요.';
  return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
}

/** logout() 이 진행 중인가 — 그 사이에 오는 '세션 만료' 신호는 무시한다. */
let endingSession = false;
let restoreInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  bootstrapped: false,
  error: null,
  sessionEndedReason: null,
  needsUnlock: false,

  unlock: () => set({ needsUnlock: false }),

  login: async (id, password) => {
    if (get().loading || endingSession || restoreInFlight) return false;
    const epoch = advanceSessionEpoch();
    set({ loading: true, error: null });
    try {
      const session = await authRepository.login(id, password);
      if (epoch !== getSessionEpoch()) return false;
      await bindSession(session.user);
      if (epoch !== getSessionEpoch()) return false;
      set({ user: session.user, loading: false, needsUnlock: false, sessionEndedReason: null });
      return true;
    } catch (e) {
      if (epoch !== getSessionEpoch()) return false;
      set({ error: e instanceof Error ? e.message : '로그인에 실패했습니다', loading: false });
      return false;
    }
  },

  socialLogin: async (name, email) => {
    if (get().loading || endingSession || restoreInFlight) return false;
    const epoch = advanceSessionEpoch();
    set({ loading: true, error: null });
    try {
      const session = await authRepository.socialLogin(name, email);
      if (epoch !== getSessionEpoch()) return false;
      await bindSession(session.user);
      if (epoch !== getSessionEpoch()) return false;
      set({ user: session.user, loading: false, needsUnlock: false });
      return true;
    } catch (e) {
      if (epoch !== getSessionEpoch()) return false;
      set({ error: e instanceof Error ? e.message : '간편 로그인에 실패했습니다', loading: false });
      return false;
    }
  },

  /**
   * 관리자 모드 진입 — 로그인 화면의 로고를 연속 5번 두드렸을 때만 불린다.
   *
   * 목업 모드에는 이 계정이 mockUserDb 에 실제로 심겨 있으므로 평소 로그인 경로를
   * 그대로 타고 들어간다(세션이 저장돼 앱을 다시 켜도 유지된다). 실서버 모드에는
   * 이 경로가 없어 socialLogin 이 501 로 끊기는데, 그때는 **화면만 관리자로 여는
   * 로컬 세션**을 만든다.
   *
   * 로컬 세션에는 서버 토큰이 없다 — 관리자 전용 화면이 열릴 뿐 권한이 생기지는
   * 않고, 서버가 필요한 요청은 그대로 막힌다. 그게 맞다. 권한은 서버가 쥔다.
   */
  adminLogin: async () => {
    if (get().loading || endingSession || restoreInFlight) return false;
    const epoch = advanceSessionEpoch();
    set({ loading: true, error: null });
    try {
      let user: User;
      try {
        const session = await authRepository.socialLogin(ADMIN_DEMO_USER.name, ADMIN_DEMO_USER.email);
        user = { ...session.user, isAdmin: true };
      } catch {
        user = { ...ADMIN_DEMO_USER };
      }
      if (epoch !== getSessionEpoch()) return false;
      await bindSession(user);
      if (epoch !== getSessionEpoch()) return false;
      set({ user, loading: false, needsUnlock: false });
      return true;
    } catch (e) {
      if (epoch !== getSessionEpoch()) return false;
      set({ error: e instanceof Error ? e.message : '관리자 모드 진입에 실패했습니다', loading: false });
      return false;
    }
  },

  logout: async () => {
    if (endingSession) return;
    advanceSessionEpoch();
    // 스스로 나가는 중이다 — 로그아웃 요청 자체가 401 을 받아도 그건 '만료'가 아니다.
    endingSession = true;
    set({ user: null, needsUnlock: false, loading: false });
    try {
      // 주인을 먼저 떼어 낸다. 로그아웃 도중 큐가 흐르더라도 남은 쓰기가
      // 곧 로그인할 다음 사람 앞으로 나가지 않게 하기 위해서다.
      await bindSession(null);
      await authRepository.logout();
    } finally {
      endingSession = false;
      set({ user: null, needsUnlock: false, loading: false, bootstrapped: true });
    }
  },

  restore: () => {
    if (restoreInFlight) return restoreInFlight;
    if (get().loading || endingSession) return Promise.resolve();
    const epoch = advanceSessionEpoch();
    restoreInFlight = (async () => {
      try {
        const user = await authRepository.restore();
        if (epoch !== getSessionEpoch()) return;
        await bindSession(user);
        if (epoch !== getSessionEpoch()) return;
        set({ user, bootstrapped: true, sessionEndedReason: null, needsUnlock: !!user });
      } catch (e) {
        if (epoch !== getSessionEpoch()) return;
        await bindSession(null);
        if (epoch !== getSessionEpoch()) return;
        // 서버가 거절한 세션(만료·정지)만 사유를 남긴다. 지하에서 못 닿은 것까지
        // 안내로 띄우면, 잠깐 끊긴 것이 계정 문제처럼 보인다.
        const err = e instanceof ApiError ? e : null;
        const rejected = err?.kind === 'unauthorized' || err?.kind === 'forbidden';
        set({
          user: null,
          bootstrapped: true,
          needsUnlock: false,
          sessionEndedReason: rejected ? sessionEndedMessage(err) : null,
        });
      } finally {
        restoreInFlight = null;
      }
    })();
    return restoreInFlight;
  },

  register: async (input) => {
    if (get().loading || endingSession || restoreInFlight) return false;
    const epoch = advanceSessionEpoch();
    set({ loading: true, error: null });
    try {
      const session = await authRepository.register(input);
      if (epoch !== getSessionEpoch()) return false;
      await bindSession(session.user);
      if (epoch !== getSessionEpoch()) return false;
      set({ user: session.user, loading: false, needsUnlock: false });
      return true;
    } catch (e) {
      if (epoch !== getSessionEpoch()) return false;
      set({ error: e instanceof Error ? e.message : '회원가입에 실패했습니다', loading: false });
      return false;
    }
  },

  resetPassword: async (username, email, newPassword) => {
    if (get().loading || endingSession || restoreInFlight) return false;
    const epoch = getSessionEpoch();
    set({ loading: true, error: null });
    try {
      await authRepository.resetPassword(username, email, newPassword);
      if (epoch !== getSessionEpoch()) return false;
      set({ loading: false });
      return true;
    } catch (e) {
      if (epoch !== getSessionEpoch()) return false;
      set({ error: e instanceof Error ? e.message : '비밀번호 재설정에 실패했습니다', loading: false });
      return false;
    }
  },

  updateProfile: async (patch) => {
    if (get().loading || endingSession || restoreInFlight) return false;
    const epoch = getSessionEpoch();
    const current = useAuthStore.getState().user;
    if (!current) {
      set({ error: '로그인이 필요합니다' });
      return false;
    }
    set({ loading: true, error: null });
    try {
      const updated = await authRepository.updateProfile(current.id, patch);
      if (epoch !== getSessionEpoch() || get().user?.id !== current.id) return false;
      set({ user: updated, loading: false });
      return true;
    } catch (e) {
      if (epoch !== getSessionEpoch()) return false;
      set({ error: e instanceof Error ? e.message : '정보 수정에 실패했습니다', loading: false });
      return false;
    }
  },

  clearError: () => set({ error: null, sessionEndedReason: null }),
  setName: (name) => set((s) => ({ user: s.user ? { ...s.user, name } : null })),
}));

/**
 * 앱을 쓰는 도중 서버가 세션을 끊었을 때(refresh 까지 실패) — 로그인 화면으로 돌려보낸다.
 *
 * 예전에는 ApiClient 가 토큰만 지우고 화면의 로그인 상태는 남겨 두어, 사용자는
 * 로그인된 화면에서 누르는 것마다 오류만 받았다. 여기서 세션을 닫고 사유를 남기면
 * 루트의 인증 가드(useAuthGuard)가 로그인 화면으로 보내고, 그 화면 위에 사유가 뜬다.
 * 로컬 데이터는 지우지 않는다 — 같은 사람이 다시 들어오는 경우가 대부분이다(sessionScope).
 */
onSessionExpired(() => {
  if (endingSession) return;
  if (!useAuthStore.getState().user) return;
  const epoch = advanceSessionEpoch();
  // UI/동기화 구독을 즉시 닫고 디스크 정리는 이어서 한다.
  useAuthStore.setState({ user: null, needsUnlock: false, loading: false, sessionEndedReason: sessionEndedMessage(null) });
  void bindSession(null).catch(() => {}).then(() => {
    if (epoch !== getSessionEpoch()) return;
    useAuthStore.setState({
      user: null,
      needsUnlock: false,
      sessionEndedReason: sessionEndedMessage(null),
    });
  });
});
