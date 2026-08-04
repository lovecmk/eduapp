import type { OpsSettings, SettingsPatch } from '../api/types';

/**
 * 운영 설정에서 편집 가능한 필드들.
 *
 * 목록을 한 곳에 두는 이유 — 화면·차이 계산·초안 만들기 세 곳이 각자 필드를
 * 나열하면, 새 설정을 추가할 때 한 곳을 빠뜨린다. 그러면 그 값은 화면에는
 * 보이는데 저장되지 않거나(차이 계산 누락), 저장은 되는데 되돌리기가 안 된다.
 */
export const EDITABLE_SETTINGS = [
  'maintenance_yn',
  'maintenance_msg',
  'signup_enabled',
  'daily_min_cards',
  'daily_max_cards',
  'adaptive_difficulty',
  'notice_txt',
  'notice_level',
] as const;

/** 서버 응답에서 편집 가능한 부분만 떼어 초안을 만든다. */
export function toDraft(s: OpsSettings): SettingsPatch {
  const out: SettingsPatch = {};
  for (const key of EDITABLE_SETTINGS) {
    // 키마다 타입이 달라 한 줄로는 좁혀지지 않는다. 대상 타입이 같은 필드들의
    // 부분집합이라는 것은 EDITABLE_SETTINGS 가 보장한다.
    (out as Record<string, unknown>)[key] = s[key];
  }
  return out;
}

/**
 * 저장할 것 = **달라진 필드만**.
 *
 * 전체를 보내면 화면이 열릴 때 받은 낡은 값이 남의 변경을 덮는다. 공지 문구를
 * 고치는 사이 다른 관리자가 점검 모드를 켰다면, 통째로 저장하는 순간 그것이
 * 꺼진다 — 아무도 끄지 않았는데 서비스가 열리는 것이다.
 *
 * 서버도 같은 규칙으로 받는다(보내지 않은 필드는 건드리지 않는다).
 */
export function changedFields(current: OpsSettings, draft: SettingsPatch): SettingsPatch {
  const out: SettingsPatch = {};
  for (const key of EDITABLE_SETTINGS) {
    const next = (draft as Record<string, unknown>)[key];
    // 초안에 아예 없는 필드는 '바꾸지 않음'이다. undefined 를 '값을 지움'으로
    // 해석하면 화면이 아직 안 그린 항목이 저장 때 초기화된다.
    if (next === undefined) continue;
    if (next !== (current as unknown as Record<string, unknown>)[key]) {
      (out as Record<string, unknown>)[key] = next;
    }
  }
  return out;
}

/** 저장할 것이 있는가. */
export function isDirty(current: OpsSettings, draft: SettingsPatch): boolean {
  return Object.keys(changedFields(current, draft)).length > 0;
}
