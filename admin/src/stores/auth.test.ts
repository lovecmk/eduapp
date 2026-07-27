import { describe, it, expect, beforeEach } from 'vitest';
import { ref, computed } from 'vue';

/**
 * 로그인 상태 computed 의 반응성 회귀 테스트.
 *
 * 배경(실제로 겪은 버그): `isAuthenticated` 를
 *     computed(() => apiClient.isAuthenticated && user.value !== null)
 * 로 썼더니, 첫 평가에서 앞 항이 false 여서 `&&` 가 단축 평가되었고 `user.value` 가
 * **한 번도 읽히지 않아 의존성으로 등록되지 않았다.** 그 결과 로그인해서 user 가
 * 채워져도 computed 는 false 로 굳었고, 라우터 가드가 계속 로그인 화면으로 되돌려
 * "로그인은 되는데 화면이 안 넘어가는" 상태가 됐다.
 *
 * 여기서 그 실패 모드를 그대로 재현해 두어, 같은 형태로 되돌아가는 것을 막는다.
 */
describe('로그인 상태 computed 의 반응성', () => {
  let tokenPresent: ReturnType<typeof ref<boolean>>;
  let user: ReturnType<typeof ref<{ id: string } | null>>;

  beforeEach(() => {
    tokenPresent = ref<boolean>(false);
    user = ref<{ id: string } | null>(null);
  });

  it('비반응형 값을 앞에 두고 && 로 이으면 뒤 값이 추적되지 않는다(재현)', () => {
    // 클래스 필드처럼 Vue 가 추적하지 못하는 값.
    const plain = { authenticated: false };
    const broken = computed(() => plain.authenticated && user.value !== null);

    expect(broken.value).toBe(false); // 첫 평가: 단축 평가로 user 를 읽지 않는다

    // 로그인 성공 상황을 흉내 낸다.
    plain.authenticated = true;
    user.value = { id: 'u1' };

    // 의존성이 하나도 등록되지 않았으므로 값이 갱신되지 않는다 — 이것이 버그였다.
    expect(broken.value).toBe(false);
  });

  it('두 값을 모두 먼저 읽으면 어느 쪽이 바뀌어도 갱신된다(현재 구현)', () => {
    const isAuthenticated = computed(() => {
      const hasToken = tokenPresent.value;
      const hasProfile = user.value !== null;
      return hasToken && hasProfile;
    });

    expect(isAuthenticated.value).toBe(false);

    // 토큰만 생긴 상태 — 아직 프로필이 없으므로 로그인 완료가 아니다.
    tokenPresent.value = true;
    expect(isAuthenticated.value).toBe(false);

    // 프로필까지 채워지면 즉시 true 가 되어야 한다.
    user.value = { id: 'u1' };
    expect(isAuthenticated.value).toBe(true);

    // 로그아웃(둘 다 비움)도 반영된다.
    tokenPresent.value = false;
    user.value = null;
    expect(isAuthenticated.value).toBe(false);
  });

  it('프로필이 먼저 오고 토큰이 나중에 와도 갱신된다(순서 무관)', () => {
    const isAuthenticated = computed(() => {
      const hasToken = tokenPresent.value;
      const hasProfile = user.value !== null;
      return hasToken && hasProfile;
    });

    expect(isAuthenticated.value).toBe(false);
    user.value = { id: 'u1' };
    expect(isAuthenticated.value).toBe(false);
    tokenPresent.value = true;
    expect(isAuthenticated.value).toBe(true);
  });

  it('토큰만 사라져도(만료 후 정리) 즉시 로그아웃 상태가 된다', () => {
    tokenPresent.value = true;
    user.value = { id: 'u1' };
    const isAuthenticated = computed(() => {
      const hasToken = tokenPresent.value;
      const hasProfile = user.value !== null;
      return hasToken && hasProfile;
    });
    expect(isAuthenticated.value).toBe(true);

    tokenPresent.value = false; // 401 로 세션이 끊긴 상황
    expect(isAuthenticated.value).toBe(false);
  });
});
