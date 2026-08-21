// 계정 설정 매핑 — 서버가 모르는 필드가 기기 설정을 지우지 않는지.
//
// 여기서 가장 위험한 실수는 "없는 값을 false 로 채우는 것"이다. 서버가 알림
// 항목 하나만 알고 있는 배포에서 나머지를 false 로 만들어 내려보내면, 사용자가
// 켜 둔 알림이 로그인 한 번으로 조용히 전부 꺼진다.

const get = jest.fn();
const postDurable = jest.fn();

jest.mock('../../network/ApiClient', () => ({
  apiClient: {
    get: (...a: unknown[]) => get(...a) as unknown,
    postDurable: (...a: unknown[]) => postDurable(...a) as unknown,
  },
}));

import { SettingsRepository } from '../SettingsRepository';
import { MockSettingsRepository } from '../SettingsRepository.mock';
import {
  DEFAULT_ACCOUNT_SETTINGS,
  normalizeAccountSettings,
  type AccountSettings,
} from '../../../domain/models/UserSettings';

const repo = new SettingsRepository();

beforeEach(() => {
  get.mockReset();
  postDurable.mockReset();
});

describe('SettingsRepository — pull', () => {
  it('서버가 준 값만 patch 로 옮긴다(나머지 필드는 아예 없다)', async () => {
    get.mockResolvedValue({
      daily_target: 12,
      notifications: { marketing_yn: true },
      updated_at: '2026-08-14T00:00:00.000Z',
    });
    const snap = await repo.pull();
    expect(snap.present).toBe(true);
    expect(snap.updatedAt).toBe('2026-08-14T00:00:00.000Z');
    expect(snap.settings.dailyTarget).toBe(12);
    expect(snap.settings.notifications).toEqual({
      enabled: undefined,
      dailyReminderTime: undefined,
      reviewAlerts: undefined,
      weeklyReport: undefined,
      inApp: undefined,
      email: undefined,
      marketing: true,
    });
    expect('bio' in snap.settings).toBe(false);
  });

  it('빈 응답은 "서버에 기록 없음"이다 — 기기 값이 권위를 갖는다', async () => {
    get.mockResolvedValue({});
    expect(await repo.pull()).toEqual({ settings: {}, updatedAt: null, present: false });
    get.mockResolvedValue(null);
    expect((await repo.pull()).present).toBe(false);
  });

  it('일부만 온 응답을 기기 값에 얹어도 나머지가 꺼지지 않는다', async () => {
    const local: AccountSettings = {
      ...DEFAULT_ACCOUNT_SETTINGS,
      notifications: { ...DEFAULT_ACCOUNT_SETTINGS.notifications, reviewAlerts: true, email: true },
    };
    get.mockResolvedValue({ notifications: { marketing_yn: true } });
    const snap = await repo.pull();
    const merged = normalizeAccountSettings(snap.settings, local);
    expect(merged.notifications.marketing).toBe(true);
    expect(merged.notifications.reviewAlerts).toBe(true);
    expect(merged.notifications.email).toBe(true);
  });
});

describe('SettingsRepository — push', () => {
  it('전체 스냅샷을 보내고, 멱등키에 변경 시각을 담는다(재전송 안전)', async () => {
    postDurable.mockResolvedValue('sent');
    const at = new Date('2026-08-14T01:02:03.000Z');
    await repo.push({ ...DEFAULT_ACCOUNT_SETTINGS, dailyTarget: 9, bio: '소개' }, at);

    const [path, body, key] = postDurable.mock.calls[0] as [string, Record<string, unknown>, string];
    expect(path).toBe('/inner/api/v1/settings');
    expect(body.daily_target).toBe(9);
    expect(body.bio_txt).toBe('소개');
    expect(body.updated_at).toBe(at.toISOString());
    expect(key).toBe('settings:2026-08-14T01:02:03.000Z');
  });
});

describe('MockSettingsRepository', () => {
  it('보관하는 척하지 않는다 — present:false 로 답한다', async () => {
    const snap = await new MockSettingsRepository().pull();
    expect(snap).toEqual({ settings: {}, updatedAt: null, present: false });
  });
});
