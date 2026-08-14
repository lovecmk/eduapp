// 계정 설정 정규화·동기화 판단 — 서버와 기기 중 누가 이기는가.
//
// 여기가 틀리면 증상이 조용하고 고약하다. 사용자가 방금 끈 알림이 다음 실행에서
// 되살아나거나(서버가 이기면 안 될 때 이겨서), 기기를 바꿨는데 관심 분야·수신
// 동의가 따라오지 않는다(기기가 이기면 안 될 때 이겨서).

import {
  DEFAULT_ACCOUNT_SETTINGS,
  DAILY_TARGET_MAX,
  BIO_MAX,
  decideSettingsSync,
  normalizeAccountSettings,
  sameAccountSettings,
  type AccountSettings,
} from '../models/UserSettings';

const base: AccountSettings = {
  ...DEFAULT_ACCOUNT_SETTINGS,
  dailyTarget: 7,
  bio: '현장 점검 8년차',
  interests: ['전기시설'],
};

describe('normalizeAccountSettings — 서버 값 받아들이기', () => {
  it('서버가 모르는 필드는 기기 값을 남긴다(빈 응답이 설정을 지우지 않는다)', () => {
    const out = normalizeAccountSettings({}, base);
    expect(out).toEqual(base);
  });

  it('서버가 준 값으로 덮어쓴다', () => {
    const out = normalizeAccountSettings({ dailyTarget: 12, bio: '바뀐 소개' }, base);
    expect(out.dailyTarget).toBe(12);
    expect(out.bio).toBe('바뀐 소개');
    // 건드리지 않은 값은 그대로.
    expect(out.interests).toEqual(['전기시설']);
  });

  it('알림 설정은 항목 단위로 병합한다(일부만 온 응답이 나머지를 끄지 않는다)', () => {
    const out = normalizeAccountSettings({ notifications: { marketing: true } }, base);
    expect(out.notifications.marketing).toBe(true);
    expect(out.notifications.enabled).toBe(base.notifications.enabled);
    expect(out.notifications.dailyReminderTime).toBe(base.notifications.dailyReminderTime);
  });

  it('범위를 벗어난 값은 거절이 아니라 절삭이다(나머지 설정을 살린다)', () => {
    const out = normalizeAccountSettings({ dailyTarget: 9999, bio: 'x'.repeat(500) }, base);
    expect(out.dailyTarget).toBe(DAILY_TARGET_MAX);
    expect(out.bio).toHaveLength(BIO_MAX);
  });

  it('모르는 관심 분야 값은 걸러낸다', () => {
    const out = normalizeAccountSettings({ interests: ['전기시설', '없는분야'] }, base);
    expect(out.interests).toEqual(['전기시설']);
  });

  it('잘못된 시각 표기는 무시하고 기기 값을 유지한다', () => {
    const out = normalizeAccountSettings({ notifications: { dailyReminderTime: '25:99' } }, base);
    expect(out.notifications.dailyReminderTime).toBe(base.notifications.dailyReminderTime);
    expect(
      normalizeAccountSettings({ notifications: { dailyReminderTime: '07:30' } }, base)
        .notifications.dailyReminderTime,
    ).toBe('07:30');
  });
});

describe('decideSettingsSync — 마지막 쓰기 우선', () => {
  it('서버에 기록이 없으면 기기 값을 올린다(라우트 미배포·신규 계정)', () => {
    expect(decideSettingsSync({ present: false, serverAt: 0, localAt: 0, identical: false }))
      .toBe('push-local');
  });

  it('내용이 같으면 아무것도 하지 않는다(켤 때마다 쓰기가 나가지 않게)', () => {
    expect(decideSettingsSync({ present: true, serverAt: 100, localAt: 50, identical: true }))
      .toBe('in-sync');
  });

  it('기기에서 한 번도 바꾼 적이 없으면 서버를 따른다(기기 변경 후 복원)', () => {
    expect(decideSettingsSync({ present: true, serverAt: 10, localAt: 0, identical: false }))
      .toBe('apply-server');
  });

  it('서버가 더 나중이면 서버가 이긴다', () => {
    expect(decideSettingsSync({ present: true, serverAt: 200, localAt: 100, identical: false }))
      .toBe('apply-server');
  });

  it('기기가 더 나중이면 기기가 이긴다(방금 끈 알림이 되살아나지 않는다)', () => {
    expect(decideSettingsSync({ present: true, serverAt: 100, localAt: 200, identical: false }))
      .toBe('push-local');
  });
});

describe('sameAccountSettings', () => {
  it('같은 값이면 같다고 본다', () => {
    expect(sameAccountSettings(base, { ...base, notifications: { ...base.notifications } })).toBe(true);
  });

  it('한 항목만 달라도 다르다고 본다', () => {
    expect(sameAccountSettings(base, { ...base, dailyTarget: 8 })).toBe(false);
  });
});
