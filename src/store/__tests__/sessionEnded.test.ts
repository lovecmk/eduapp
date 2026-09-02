/**
 * 서버가 세션을 거절했을 때, 사용자가 그 사실을 알 수 있는가.
 *
 * 계정이 정지되면 서버는 다음 요청부터 403 으로 막는다. 예전에는 restore() 의
 * catch 가 오류를 통째로 삼켜, 사용자는 아무 설명 없이 로그인 화면으로 돌아왔다 —
 * 정지된 사실도, 왜인지도 모른 채 같은 시도를 반복하다 앱을 지운다.
 *
 * 반대쪽 함정도 같이 막는다. 이 앱은 지하에서 켜지는 일이 흔한데, **닿지 못한 것**
 * 까지 안내로 띄우면 잠깐 끊긴 것이 계정 문제처럼 보인다.
 */
import type { User } from '../../domain/models/User';

const restore = jest.fn<Promise<User | null>, []>();

jest.mock('../../data/repositories', () => ({
  authRepository: { restore: () => restore() },
}));
jest.mock('../../data/network/offlineQueue', () => ({ setQueueOwner: () => {} }));
jest.mock('../sessionScope', () => ({ applySessionOwner: async () => {} }));

import { useAuthStore } from '../authStore';
import { ApiError } from '../../data/network/errors';

beforeEach(() => {
  restore.mockReset();
  useAuthStore.setState({ user: null, bootstrapped: false, error: null, sessionEndedReason: null });
});

describe('세션이 끝난 사유', () => {
  it('정지된 계정(403)은 서버가 적어 보낸 사유를 그대로 전한다', async () => {
    restore.mockRejectedValue(new ApiError(403, '반복 신고로 이용이 제한되었습니다.'));

    await useAuthStore.getState().restore();

    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.bootstrapped).toBe(true);
    expect(s.sessionEndedReason).toBe('반복 신고로 이용이 제한되었습니다.');
  });

  it('사유가 비어 있어도 뭉개지 않는다 — 무엇을 해야 하는지는 말해 준다', async () => {
    restore.mockRejectedValue(new ApiError(403, ''));

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().sessionEndedReason).toContain('관리자');
  });

  it('토큰 만료(401)는 다시 로그인하라고 안내한다', async () => {
    restore.mockRejectedValue(new ApiError(401, ''));

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().sessionEndedReason).toContain('다시 로그인');
  });

  it('서버에 닿지 못한 것(0)은 안내하지 않는다 — 계정 문제가 아니다', async () => {
    restore.mockRejectedValue(new ApiError(0, '연결 없음'));

    await useAuthStore.getState().restore();

    const s = useAuthStore.getState();
    expect(s.bootstrapped).toBe(true);
    expect(s.sessionEndedReason).toBeNull();
  });

  it('세션이 살아 있으면 남아 있던 안내를 걷는다', async () => {
    useAuthStore.setState({ sessionEndedReason: '이용이 제한된 계정입니다.' });
    restore.mockResolvedValue({ id: 'u1', name: '홍길동' } as User);

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().sessionEndedReason).toBeNull();
  });

  it('다시 로그인하려고 입력을 시작하면(clearError) 안내가 걷힌다', () => {
    useAuthStore.setState({ sessionEndedReason: '이용이 제한된 계정입니다.' });
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().sessionEndedReason).toBeNull();
  });
});
