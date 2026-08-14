// 계정 설정 vs 기기 설정 — 공용 태블릿에서 앞사람의 것이 남지 않는지.
//
// 이 앱은 현장 공용 기기에서 돌아간다. 계정 설정(관심 분야·한 줄 소개·공개 범위)이
// 다음 사람에게 넘어가면 남의 소개가 내 프로필에 붙는다. 반대로 기기 취향(테마·글자
// 크기)까지 지우면, 사람이 바뀔 때마다 화면이 초기화되는 쓸모없는 안전장치가 된다.

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

import { selectAccountSettings, useSettingsStore } from '../settingsStore';
import { DEFAULT_ACCOUNT_SETTINGS } from '../../domain/models/UserSettings';

/** 앞사람이 자기 취향대로 맞춰 둔 상태를 만든다. */
function seedPreviousUser() {
  useSettingsStore.setState({
    ...DEFAULT_ACCOUNT_SETTINGS,
    bio: '앞사람 소개',
    interests: ['전기시설'],
    dailyTarget: 12,
    themeMode: 'dark',
    fontScale: 'large',
    accountOwnerId: 'user-a',
    accountUpdatedAt: 1_000,
  });
}

describe('resetAccountSettings — 다른 사람이 로그인했을 때', () => {
  it('계정 설정만 기본값으로 되돌린다', () => {
    seedPreviousUser();
    useSettingsStore.getState().resetAccountSettings('user-b');

    const s = useSettingsStore.getState();
    expect(s.bio).toBe('');
    expect(s.interests).toEqual([]);
    expect(s.dailyTarget).toBe(DEFAULT_ACCOUNT_SETTINGS.dailyTarget);
    expect(s.accountOwnerId).toBe('user-b');
    // 아직 아무도 정하지 않은 상태 — 서버에 남아 있는 이 사람의 진짜 설정이 이겨야 한다.
    expect(s.accountUpdatedAt).toBe(0);
  });

  it('기기 취향(테마·글자 크기)은 그대로 둔다', () => {
    seedPreviousUser();
    useSettingsStore.getState().resetAccountSettings('user-b');

    const s = useSettingsStore.getState();
    expect(s.themeMode).toBe('dark');
    expect(s.fontScale).toBe('large');
  });
});

describe('applyAccountSettings — 서버 값 반영', () => {
  it('서버가 준 필드만 덮고 나머지는 기기 값을 남긴다', () => {
    seedPreviousUser();
    useSettingsStore.getState().applyAccountSettings(
      { dailyTarget: 5, notifications: { marketing: true } },
      2_000,
      'user-a',
    );

    const s = useSettingsStore.getState();
    expect(s.dailyTarget).toBe(5);
    expect(s.notifications.marketing).toBe(true);
    // 서버가 말하지 않은 값은 그대로.
    expect(s.bio).toBe('앞사람 소개');
    expect(s.notifications.enabled).toBe(DEFAULT_ACCOUNT_SETTINGS.notifications.enabled);
    expect(s.accountUpdatedAt).toBe(2_000);
  });

  it('빈 패치는 주인·시각만 확정한다(값은 건드리지 않는다)', () => {
    seedPreviousUser();
    const before = selectAccountSettings(useSettingsStore.getState());
    useSettingsStore.getState().applyAccountSettings({}, 3_000, 'user-a');

    expect(selectAccountSettings(useSettingsStore.getState())).toEqual(before);
    expect(useSettingsStore.getState().accountUpdatedAt).toBe(3_000);
  });
});

describe('resetAll — 사용자가 직접 초기화', () => {
  it('변경 시각을 지금으로 찍는다(서버의 옛 설정이 되살아나지 않게)', () => {
    seedPreviousUser();
    useSettingsStore.getState().resetAll();

    const s = useSettingsStore.getState();
    expect(s.bio).toBe('');
    expect(s.themeMode).toBe('system');
    expect(s.accountUpdatedAt).toBeGreaterThan(1_000);
  });
});

describe('selectAccountSettings — 무엇이 서버로 올라가는가', () => {
  it('기기 전용 설정은 포함하지 않는다', () => {
    seedPreviousUser();
    const picked = selectAccountSettings(useSettingsStore.getState()) as unknown as Record<string, unknown>;
    for (const deviceOnly of ['themeMode', 'fontScale', 'highContrast', 'keepScreenOn',
      'biometricLoginEnabled', 'dontKnowHaptic', 'profileImage', 'ambientTheme']) {
      expect(deviceOnly in picked).toBe(false);
    }
    expect(Object.keys(picked).sort()).toEqual(Object.keys(DEFAULT_ACCOUNT_SETTINGS).sort());
  });
});
