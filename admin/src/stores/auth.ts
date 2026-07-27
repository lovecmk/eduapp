import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, ApiError, hasAccessToken } from '../api/client';
import type { AuthUser } from '../api/types';

const PROFILE_KEY = 'eduadmin.profile';

/**
 * 관리자 세션 상태.
 *
 * 로그인 성공만으로는 관리자인지 알 수 없다 — 로그인 API 는 모든 사용자에게 열려 있고,
 * 권한 판정은 서버의 /api/admin/* 가 한다. 그래서 로그인 직후 관리 API 를 한 번 찔러
 * **실제로 들어갈 수 있는지** 확인한 뒤에야 콘솔로 들여보낸다. 그러지 않으면 일반
 * 사용자가 로그인해 콘솔 껍데기에 들어온 뒤 화면마다 403 을 보는 이상한 경험이 된다.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(loadProfile());
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * 로그인 상태 = 토큰이 있고 + 프로필을 아는 것.
   *
   * 두 값을 각각 지역 변수로 **먼저 읽는다.** `a.value && b.value` 로 바로 이으면
   * 앞이 false 일 때 뒤가 읽히지 않아 그 의존성이 등록되지 않는다. 그러면 뒤 값이
   * 나중에 바뀌어도 computed 가 다시 계산되지 않고 false 로 굳는다.
   * (초기 렌더에서 토큰이 없어 user 가 추적되지 않았고, 로그인 후에도
   *  "로그인은 됐는데 화면이 안 넘어가는" 상태가 됐던 실제 버그다.)
   */
  const isAuthenticated = computed(() => {
    const tokenPresent = hasAccessToken.value;
    const profilePresent = user.value !== null;
    return tokenPresent && profilePresent;
  });
  const displayName = computed(() => user.value?.user_nm || user.value?.login_id || '관리자');

  function loadProfile(): AuthUser | null {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      // 저장된 값이 깨졌다면 로그인 상태가 아닌 것으로 본다.
      return null;
    }
  }

  function saveProfile(u: AuthUser | null): void {
    user.value = u;
    if (u) localStorage.setItem(PROFILE_KEY, JSON.stringify(u));
    else localStorage.removeItem(PROFILE_KEY);
  }

  async function login(id: string, password: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const result = await api.login(id, password);

      // 관리자인지 확인 — 가장 가벼운 관리 API 로 권한만 검사한다.
      try {
        await api.status();
      } catch (e) {
        await api.logout(); // 토큰을 남겨 두면 다음 방문에 반쯤 로그인된 상태가 된다
        saveProfile(null);
        if (e instanceof ApiError && e.isForbidden) {
          error.value = '관리자 권한이 없는 계정입니다';
        } else {
          error.value = e instanceof ApiError ? e.message : '관리 콘솔에 접속할 수 없습니다';
        }
        return false;
      }

      saveProfile(result.user);
      return true;
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : '로그인에 실패했습니다';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function logout(): Promise<void> {
    await api.logout();
    saveProfile(null);
  }

  /** 토큰이 만료되어 서버가 세션을 끊었을 때 클라이언트 상태를 정리한다. */
  function clearSession(): void {
    api.clearTokens();
    saveProfile(null);
  }

  return { user, loading, error, isAuthenticated, displayName, login, logout, clearSession };
});
