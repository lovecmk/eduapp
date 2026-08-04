import { describe, it, expect } from 'vitest';
import { changedFields, isDirty, toDraft, EDITABLE_SETTINGS } from './settings';
import type { OpsSettings } from '../api/types';

/**
 * 이 화면의 유일한 위험은 **보내지 않아야 할 것을 보내는 것**이다.
 *
 * 전체를 보내면 화면이 열릴 때 받은 낡은 값이 남의 변경을 덮는다 —
 * 아무도 끄지 않았는데 점검 모드가 꺼지는 식이다. 눈으로는 절대 안 잡히는
 * 종류의 버그라 검사로 못박아 둔다.
 */

function base(): OpsSettings {
  return {
    maintenance_yn: false,
    maintenance_msg: '',
    signup_enabled: true,
    daily_new_limit: 5,
    notice_txt: '',
    notice_level: 'INFO',
    updated_at: '2026-08-01T00:00:00Z',
    updated_by: 'u_admin',
    updated_by_name: '관리자',
  };
}

describe('toDraft — 편집 가능한 부분만 떼어낸다', () => {
  it('서버 메타(누가·언제 바꿨나)는 초안에 담지 않는다', () => {
    const draft = toDraft(base());
    expect(draft).not.toHaveProperty('updated_at');
    expect(draft).not.toHaveProperty('updated_by');
    expect(draft).not.toHaveProperty('updated_by_name');
  });

  it('편집 대상 필드는 하나도 빠뜨리지 않는다', () => {
    const draft = toDraft(base());
    for (const key of EDITABLE_SETTINGS) {
      expect(draft).toHaveProperty(key);
    }
  });
});

describe('changedFields — 바꾼 것만 보낸다', () => {
  it('아무것도 안 고치면 빈 객체', () => {
    const s = base();
    expect(changedFields(s, toDraft(s))).toEqual({});
    expect(isDirty(s, toDraft(s))).toBe(false);
  });

  it('고친 필드 하나만 담는다', () => {
    const s = base();
    const draft = { ...toDraft(s), daily_new_limit: 3 };
    expect(changedFields(s, draft)).toEqual({ daily_new_limit: 3 });
    expect(isDirty(s, draft)).toBe(true);
  });

  it('false 로 끄는 것도 변경이다(빠뜨리면 스위치가 안 꺼진다)', () => {
    // 값이 falsy 라는 이유로 걸러내면 '가입 받기'를 꺼도 저장이 안 된다.
    const s = base();
    const draft = { ...toDraft(s), signup_enabled: false };
    expect(changedFields(s, draft)).toEqual({ signup_enabled: false });
  });

  it('빈 문자열로 지우는 것도 변경이다(공지 배너 내리기)', () => {
    const s = { ...base(), notice_txt: '정전 예정' };
    const draft = { ...toDraft(s), notice_txt: '' };
    expect(changedFields(s, draft)).toEqual({ notice_txt: '' });
  });

  it('건드리지 않은 필드는 절대 실리지 않는다', () => {
    // 점검 모드가 켜진 서버에서 공지 문구만 고쳤다 — 점검 모드가 꺼지면 안 된다.
    const s = { ...base(), maintenance_yn: true, maintenance_msg: '점검 중' };
    const draft = { ...toDraft(s), notice_txt: '안내' };
    const patch = changedFields(s, draft);
    expect(patch).toEqual({ notice_txt: '안내' });
    expect(patch).not.toHaveProperty('maintenance_yn');
  });

  it('초안에 없는 필드는 "바꾸지 않음"으로 본다', () => {
    // 화면이 아직 그리지 않은 항목이 undefined 로 남아 있다고 해서
    // 그것을 '지움'으로 해석하면, 저장 한 번에 그 값이 초기화된다.
    const s = { ...base(), notice_txt: '살아 있어야 한다' };
    expect(changedFields(s, { daily_new_limit: 7 })).toEqual({ daily_new_limit: 7 });
  });
});
