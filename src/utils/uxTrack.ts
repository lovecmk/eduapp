import type { User } from '../domain/models/User';

// 투트랙 UI — 계정별로 학습 카드 UX를 다르게 제공한다.
//  - 'swipe'  : 원진섭 계정 — 뒤집기 버튼 없이 카드 탭으로 뒤집고, 좌우 스와이프로 분류.
//  - 'classic': 그 외(이용재 포함) — 기존 버튼 기반 UX 유지.
export type UxTrack = 'swipe' | 'classic';

// 스와이프 트랙(원진섭)에 매칭되는 로그인 식별자 목록.
// mock 로그인은 입력한 아이디를 user.name 으로 사용하므로 이름으로 판별한다.
const SWIPE_TRACK_IDS = ['원진섭', 'wonjinseop', 'wonjs', 'wjs'];

export function getUxTrack(user: Pick<User, 'name'> | null | undefined): UxTrack {
  const name = (user?.name ?? '').trim().toLowerCase();
  if (!name) return 'classic';
  const hit = SWIPE_TRACK_IDS.some((id) => {
    const key = id.toLowerCase();
    return name === key || name.includes(key);
  });
  return hit ? 'swipe' : 'classic';
}
