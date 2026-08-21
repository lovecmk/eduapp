// 서비스 운영 상태(/inner/api/v1/config) 매핑 — 관리 콘솔이 바꾼 값이 앱까지 오는 길.
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

// 운영값을 기억하는 스토어가 persist(AsyncStorage) 를 쓴다 — 로직 테스트는 RN 런타임
// 없이 도는 node 환경이라 저장소를 메모리로 대신한다.
jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});

import { ServiceConfigRepository } from '../ServiceConfigRepository';
import { MockServiceConfigRepository } from '../ServiceConfigRepository.mock';
import { DAILY_MIN_CARDS, DAILY_MAX_CARDS } from '../../../constants/learning';
import { MIN_DAILY_CARDS, MAX_DAILY_CARDS } from '../../../domain/dailyPlan';
import { useServerPolicyStore } from '../../../store/serverPolicyStore';

describe('ServiceConfigRepository — 서버 응답 → 도메인', () => {
  beforeEach(() => {
    get.mockReset();
    useServerPolicyStore.setState({ dailyMinCards: DAILY_MIN_CARDS, dailyMaxCards: DAILY_MAX_CARDS });
  });

  it('서버가 준 값을 그대로 옮긴다', async () => {
    get.mockResolvedValue({
      maintenance_yn: true,
      maintenance_msg: '  설비 교체 중  ',
      signup_enabled: false,
      daily_new_limit: 2,
      daily_min_cards: 1,
      daily_max_cards: 2,
      notice_txt: '  금요일 안전교육  ',
      notice_level: 'WARN',
      version: 'v1.2.3',
    });

    const cfg = await new ServiceConfigRepository().get();

    expect(get).toHaveBeenCalledWith('/inner/api/v1/config');
    expect(cfg).toEqual({
      maintenance: true,
      maintenanceMessage: '설비 교체 중',
      signupEnabled: false,
      dailyNewLimit: 2,
      dailyMinCards: 1,
      dailyMaxCards: 2,
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
    expect(cfg.dailyNewLimit).toBe(DAILY_MIN_CARDS);
  });

  it('상한이 0 이하이면 앱 상수로 되돌린다', async () => {
    // 0 은 '무제한'이 아니라 실수다. 그대로 쓰면 학습이 통째로 잠긴다.
    get.mockResolvedValue({ daily_new_limit: 0 });
    expect((await new ServiceConfigRepository().get()).dailyNewLimit).toBe(DAILY_MIN_CARDS);
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

// 하루 출제 범위는 운영자가 재배포 없이 바꾸는 값이라 서버 쪽이 권위다.
// 여기서 어긋나면 증상이 조용하다 — 운영자는 "3장으로 줄였다"고 믿는데 앱은
// 컴파일된 상수 그대로 5장을 낸다. 아무도 오류를 보지 못한다.
describe('ServiceConfigRepository — 하루 출제 범위', () => {
  beforeEach(() => {
    get.mockReset();
    useServerPolicyStore.setState({ dailyMinCards: DAILY_MIN_CARDS, dailyMaxCards: DAILY_MAX_CARDS });
  });

  it('운영값을 받으면 그것을 쓰고, 다음 오프라인 편성을 위해 기억한다', async () => {
    get.mockResolvedValue({ daily_min_cards: 2, daily_max_cards: 3 });

    const cfg = await new ServiceConfigRepository().get();

    expect([cfg.dailyMinCards, cfg.dailyMaxCards]).toEqual([2, 3]);
    expect(useServerPolicyStore.getState().dailyMinCards).toBe(2);
    expect(useServerPolicyStore.getState().dailyMaxCards).toBe(3);
  });

  it('구형 서버(daily_new_limit 만 주는)에서는 그것을 최대치로 읽는다', async () => {
    // 서버는 두 값을 같게 내보낸다(docs/PLATFORM_SPLIT.md §5).
    get.mockResolvedValue({ daily_new_limit: 4 });
    const cfg = await new ServiceConfigRepository().get();
    expect(cfg.dailyMaxCards).toBe(4);
    expect(cfg.dailyMinCards).toBe(DAILY_MIN_CARDS);
  });

  it('범위를 주지 않는 서버에서는 앱 기본 범위를 쓴다', async () => {
    get.mockResolvedValue({});
    const cfg = await new ServiceConfigRepository().get();
    expect([cfg.dailyMinCards, cfg.dailyMaxCards]).toEqual([DAILY_MIN_CARDS, DAILY_MAX_CARDS]);
  });

  it('0·음수는 값이 아니라 실수다 — 앱 기본값으로 되돌린다', async () => {
    // 그대로 쓰면 "오늘 0장"이 되어 학습이 통째로 잠긴다.
    get.mockResolvedValue({ daily_min_cards: 0, daily_max_cards: -3 });
    const cfg = await new ServiceConfigRepository().get();
    expect([cfg.dailyMinCards, cfg.dailyMaxCards]).toEqual([DAILY_MIN_CARDS, DAILY_MAX_CARDS]);
  });

  it('min > max 로 뒤집혀 오면 적게 내는 쪽(max)을 따른다', async () => {
    get.mockResolvedValue({ daily_min_cards: 9, daily_max_cards: 2 });
    const cfg = await new ServiceConfigRepository().get();
    expect([cfg.dailyMinCards, cfg.dailyMaxCards]).toEqual([2, 2]);
  });

  it('편성기가 감당하는 한계를 넘는 값은 잘라 낸다', async () => {
    // 운영값은 사람이 손으로 넣는다. 0 하나 더 붙은 값에 '하루 3분'이 무너지면 안 된다.
    get.mockResolvedValue({ daily_min_cards: 1, daily_max_cards: 500 });
    const cfg = await new ServiceConfigRepository().get();
    expect(cfg.dailyMaxCards).toBe(MAX_DAILY_CARDS);
    expect(cfg.dailyMinCards).toBeGreaterThanOrEqual(MIN_DAILY_CARDS);
  });
});

describe('MockServiceConfigRepository', () => {
  it('기본은 평상시 — 데모 화면에 뜻 없는 배너를 띄우지 않는다', async () => {
    const cfg = await new MockServiceConfigRepository().get();
    expect(cfg.maintenance).toBe(false);
    expect(cfg.noticeText).toBe('');
    expect(cfg.dailyNewLimit).toBe(DAILY_MIN_CARDS);
  });
});
