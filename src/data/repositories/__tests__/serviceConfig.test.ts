// 서비스 운영 상태(/api/config) 매핑 — 관리 콘솔이 바꾼 값이 앱까지 오는 길.
//
// 여기서 어긋나면 증상이 조용하다. 배너가 안 뜨거나(관리자는 올렸다고 믿는다),
// 반대로 아무 일 없는 날 화면이 빨개진다. 서버 필드 이름 하나만 바뀌어도
// 그렇게 되므로 매핑을 못박아 둔다.

const get = jest.fn();

jest.mock('../../network/ApiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args) as unknown,
  },
}));

import { ServiceConfigRepository } from '../ServiceConfigRepository';
import { MockServiceConfigRepository } from '../ServiceConfigRepository.mock';
import { DAILY_NEW_LIMIT } from '../../../constants/learning';

describe('ServiceConfigRepository — 서버 응답 → 도메인', () => {
  beforeEach(() => get.mockReset());

  it('서버가 준 값을 그대로 옮긴다', async () => {
    get.mockResolvedValue({
      maintenance_yn: true,
      maintenance_msg: '  설비 교체 중  ',
      signup_enabled: false,
      daily_new_limit: 2,
      notice_txt: '  금요일 안전교육  ',
      notice_level: 'WARN',
      version: 'v1.2.3',
    });

    const cfg = await new ServiceConfigRepository().get();

    expect(get).toHaveBeenCalledWith('/api/config');
    expect(cfg).toEqual({
      maintenance: true,
      maintenanceMessage: '설비 교체 중',
      signupEnabled: false,
      dailyNewLimit: 2,
      noticeText: '금요일 안전교육',
      noticeLevel: 'warn',
      serverVersion: 'v1.2.3',
    });
  });

  it('필드를 주지 않는 서버(옛 배포)에서는 평상시로 본다', async () => {
    // 없는 차단을 만들어 내면, 구버전 서버에 붙은 앱이 이유 없이 가입을 막는다.
    get.mockResolvedValue({});
    const cfg = await new ServiceConfigRepository().get();
    expect(cfg.maintenance).toBe(false);
    expect(cfg.signupEnabled).toBe(true);
    expect(cfg.noticeText).toBe('');
    expect(cfg.dailyNewLimit).toBe(DAILY_NEW_LIMIT);
  });

  it('상한이 0 이하이면 앱 상수로 되돌린다', async () => {
    // 0 은 '무제한'이 아니라 실수다. 그대로 쓰면 학습이 통째로 잠긴다.
    get.mockResolvedValue({ daily_new_limit: 0 });
    expect((await new ServiceConfigRepository().get()).dailyNewLimit).toBe(DAILY_NEW_LIMIT);
  });

  it('모르는 공지 단계는 가장 약한 단계로 떨어진다', async () => {
    // 서버에 코드 하나 추가한 것만으로 전 사용자 화면이 빨개지면 안 된다.
    get.mockResolvedValue({ notice_txt: '안내', notice_level: 'LOUD' });
    expect((await new ServiceConfigRepository().get()).noticeLevel).toBe('info');
  });

  it('점검 단계 코드는 대소문자와 무관하게 해석한다', async () => {
    get.mockResolvedValue({ notice_txt: '안내', notice_level: 'danger' });
    expect((await new ServiceConfigRepository().get()).noticeLevel).toBe('danger');
  });
});

describe('MockServiceConfigRepository', () => {
  it('기본은 평상시 — 데모 화면에 뜻 없는 배너를 띄우지 않는다', async () => {
    const cfg = await new MockServiceConfigRepository().get();
    expect(cfg.maintenance).toBe(false);
    expect(cfg.noticeText).toBe('');
    expect(cfg.dailyNewLimit).toBe(DAILY_NEW_LIMIT);
  });
});
