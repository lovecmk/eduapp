import type { User } from '../../domain/models/User';

/**
 * 관리자 모드 데모 계정 — 로그인 화면의 로고를 연속 5번 두드리면 이 계정으로 들어온다.
 *
 * 왜 숨겨 두는가: 시연·현장 점검에서 관리자 전용 화면(문제 등록·개발자 도구·점검
 * 모드 우회)을 곧바로 열어 봐야 하는데, 그걸 로그인 화면에 버튼으로 내놓으면
 * 일반 사용자 눈에도 보인다. 눌러도 소용없는 버튼을 띄우느니 아는 사람만 쓰는
 * 제스처로 둔다.
 *
 * ⚠️ 이것은 **권한이 아니라 화면 열쇠**다. 실제 차단은 서버가 하고 있고(관리자가
 * 아니면 403), 이 세션에는 서버 토큰이 없으므로 서버가 필요한 기능은 그대로 막힌다.
 * `User.isAdmin` 은 "눌러 봐야 실패할 버튼을 미리 치운다"는 용도 그대로다.
 */
export const ADMIN_DEMO_USER: User = {
  id: 'u-leeyongjae',
  loginId: '이용재',
  name: '이용재',
  nickname: '이용재',
  email: 'lee@example.com',
  org: '안전관리본부',
  jobTitle: '운영 관리자',
  membership: 'vip',
  createdAt: new Date('2025-01-01'),
  isActive: true,
  isAdmin: true,
};

/** 로고를 몇 번 두드려야 관리자 모드로 들어가는가. */
export const ADMIN_TAP_COUNT = 5;

/**
 * 두드림 사이의 최대 간격. 이보다 오래 쉬면 처음부터 다시 센다 —
 * 로고를 무심코 한 번씩 누른 것이 며칠에 걸쳐 쌓여 관리자 모드가 열리면 안 된다.
 */
export const ADMIN_TAP_WINDOW_MS = 1_500;
