import type { Ionicons } from '@expo/vector-icons';

/**
 * 설정 항목 단일 색인(single source of truth).
 *
 * 설정 화면은 "간결한 2-depth"를 유지한다(설정 본문 → 상세 화면 1단계까지).
 * 대신 어떤 depth 에 있든 이 색인 하나로 전부 검색되게 해서, 사용자는 메뉴 구조를
 * 몰라도 이름·초성만으로 원하는 설정에 바로 도달할 수 있다.
 *
 * 새 설정을 추가할 때 규칙:
 *  1) 화면에 UI 를 넣고, 같은 `id` 로 이 색인에 항목을 추가한다.
 *  2) 설정 본문에 있는 항목은 `route: '/settings'` — 검색 시 그 자리로 스크롤·하이라이트된다.
 *  3) 다른 화면에 있는 항목은 그 화면 경로를 적는다 — 검색 시 `?focus=<id>` 로 이동한다.
 *  4) 라벨에 없는 동의어·영문·오타 보정어를 `keywords` 에 넣는다(검색 적중률).
 */

export type SettingsGroupId =
  | 'account'
  | 'learning'
  | 'notification'
  | 'display'
  | 'community'
  | 'support'
  | 'legal'
  | 'data';

export interface SettingsEntry {
  /** 화면의 앵커 id 와 동일해야 한다(검색 → 하이라이트 연결 키). */
  id: string;
  label: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  group: SettingsGroupId;
  /** 이 항목이 실제로 존재하는 화면 경로. */
  route: string;
  /** 검색 결과에 보여줄 위치 — '설정 › 화면'. */
  breadcrumb: string[];
  /** 검색 보조어(동의어·영문·오타). */
  keywords: string[];
  /** 조건부 노출 항목(예: 카드 수집이 꺼져 있으면 숨김) — 검색 결과에서도 같이 숨긴다. */
  requires?: 'collectionEnabled';
}

export const SETTINGS_GROUPS: Record<SettingsGroupId, { title: string; icon: keyof typeof Ionicons.glyphMap }> = {
  account: { title: '계정', icon: 'person-outline' },
  learning: { title: '학습', icon: 'school-outline' },
  notification: { title: '알림', icon: 'notifications-outline' },
  display: { title: '화면', icon: 'color-palette-outline' },
  community: { title: '커뮤니티 · 수집', icon: 'people-outline' },
  support: { title: '지원', icon: 'help-buoy-outline' },
  legal: { title: '약관 · 법적 고지', icon: 'document-text-outline' },
  data: { title: '데이터', icon: 'server-outline' },
};

const S = '설정';

export const SETTINGS_INDEX: SettingsEntry[] = [
  // ── 계정 ─────────────────────────────────────────────────────────────
  {
    id: 'profile', label: '내 프로필', description: '사진 · 한 줄 소개 편집',
    icon: 'person-circle-outline', group: 'account', route: '/profile',
    breadcrumb: [S, '계정'], keywords: ['프로필', '사진', '소개', 'bio', '아바타', 'profile'],
  },
  {
    id: 'edit-profile', label: '내 정보 수정', description: '닉네임 · 이름 · 이메일 · 소속 변경',
    icon: 'create-outline', group: 'account', route: '/edit-profile',
    breadcrumb: [S, '계정'], keywords: ['닉네임', '이름', '이메일', '소속', '변경', '수정'],
  },
  {
    id: 'privacy', label: '프로필 공개 범위', description: '진행도 · 스트릭 · 엠블럼 공개 여부',
    icon: 'eye-outline', group: 'account', route: '/privacy',
    breadcrumb: [S, '계정'], keywords: ['공개', '비공개', '프라이버시', '검색 허용', 'privacy'],
  },
  {
    id: 'privacy-searchable', label: '닉네임 검색 허용', description: '끄면 다른 사람이 나를 검색할 수 없어요',
    icon: 'search-outline', group: 'account', route: '/privacy',
    breadcrumb: [S, '계정', '프로필 공개 범위'], keywords: ['검색 허용', '닉네임', '노출', '비공개'],
  },
  {
    id: 'privacy-progress', label: '누적 학습 · 완료율 공개', description: '지금까지의 학습량과 완료율',
    icon: 'book-outline', group: 'account', route: '/privacy',
    breadcrumb: [S, '계정', '프로필 공개 범위'], keywords: ['진행도', '완료율', '학습량', '공개'],
  },
  {
    id: 'privacy-streak', label: '연속 학습(스트릭) 공개', description: '며칠 연속으로 학습했는지',
    icon: 'flame-outline', group: 'account', route: '/privacy',
    breadcrumb: [S, '계정', '프로필 공개 범위'], keywords: ['스트릭', '연속', '불꽃', '공개'],
  },
  {
    id: 'privacy-emblems', label: '엠블럼 공개', description: '분야별 실력 등급 뱃지',
    icon: 'ribbon-outline', group: 'account', route: '/privacy',
    breadcrumb: [S, '계정', '프로필 공개 범위'], keywords: ['엠블럼', '뱃지', '등급', '공개'],
  },
  {
    id: 'privacy-collection', label: '컬렉션 수 공개', description: '모은 수집 카드 개수',
    icon: 'albums-outline', group: 'account', route: '/privacy',
    breadcrumb: [S, '계정', '프로필 공개 범위'], keywords: ['컬렉션', '도감', '수집', '공개'],
  },
  {
    id: 'biometric', label: '생체인증 로그인', description: 'Face ID · 지문으로 빠른 로그인',
    icon: 'finger-print-outline', group: 'account', route: '/settings',
    breadcrumb: [S, '계정'], keywords: ['지문', '페이스아이디', 'faceid', '생체', '보안', '잠금'],
  },
  {
    id: 'logout', label: '로그아웃', description: '이 기기에서 계정 연결 해제',
    icon: 'log-out-outline', group: 'account', route: '/settings',
    breadcrumb: [S, '계정'], keywords: ['로그아웃', '나가기', 'logout', 'signout', '계정'],
  },

  // ── 학습 ─────────────────────────────────────────────────────────────
  {
    id: 'interests', label: '관심 분야', description: '통계 · 추천에 반영',
    icon: 'pricetags-outline', group: 'learning', route: '/settings',
    breadcrumb: [S, '학습'], keywords: ['관심사', '분야', '설비', '시설', '추천'],
  },
  {
    id: 'shuffle', label: '카드 순서 섞기', description: '학습할 때 카드를 무작위 순서로',
    icon: 'shuffle-outline', group: 'learning', route: '/settings',
    breadcrumb: [S, '학습'], keywords: ['셔플', '랜덤', '무작위', '순서', 'shuffle'],
  },
  {
    id: 'weak-spots', label: '약점 우선 복습', description: '자주 잊는 카드를 먼저 보여줘요',
    icon: 'barbell-outline', group: 'learning', route: '/settings',
    breadcrumb: [S, '학습'], keywords: ['복습', '약점', '취약', '우선', '오답'],
  },
  {
    id: 'keep-screen-on', label: '화면 켜짐 유지', description: '학습 중 화면 꺼짐 방지',
    icon: 'sunny-outline', group: 'learning', route: '/settings',
    breadcrumb: [S, '학습'], keywords: ['화면', '꺼짐', '절전', '잠금', '유지'],
  },
  {
    id: 'dont-know-haptic', label: "'모를 때' 진동", description: '빨간 버튼에만 미세한 진동',
    icon: 'pulse-outline', group: 'learning', route: '/settings',
    breadcrumb: [S, '학습'], keywords: ['진동', '햅틱', '피드백', 'haptic', '떨림'],
  },
  {
    id: 'offline', label: '오프라인 · 데이터 절약', description: 'Wi-Fi에서만 콘텐츠 다운로드',
    icon: 'cloud-offline-outline', group: 'learning', route: '/settings',
    breadcrumb: [S, '학습'], keywords: ['오프라인', '데이터', '절약', '와이파이', 'wifi', '다운로드'],
  },

  // ── 알림 ─────────────────────────────────────────────────────────────
  {
    id: 'notify-enabled', label: '알림 받기', description: '학습 리마인더 · 성취 · 공지',
    icon: 'notifications-outline', group: 'notification', route: '/settings',
    breadcrumb: [S, '알림'], keywords: ['알림', '푸시', '켜기', '끄기', 'push', '수신'],
  },
  {
    id: 'notify-time', label: '알림 시간', description: '매일 학습 리마인더를 받을 시각',
    icon: 'alarm-outline', group: 'notification', route: '/settings',
    breadcrumb: [S, '알림'], keywords: ['시간', '시각', '알람', '리마인더', '매일'],
  },
  {
    id: 'notify-inbox', label: '알림함 열기', description: '받은 알림 확인 · 종류별 끄기',
    icon: 'mail-outline', group: 'notification', route: '/notifications',
    breadcrumb: [S, '알림'], keywords: ['알림함', '수신함', '목록', '받은 알림'],
  },
  {
    id: 'consent-marketing', label: '혜택 · 이벤트 정보 수신', description: '광고성 정보 수신 동의 · 철회',
    icon: 'megaphone-outline', group: 'notification', route: '/legal',
    breadcrumb: [S, '약관 · 법적 고지'], keywords: ['마케팅', '광고', '이벤트', '혜택', '수신동의', '철회'],
  },

  // ── 화면 ─────────────────────────────────────────────────────────────
  {
    id: 'theme', label: '테마', description: '라이트 · 다크 · 딤 · 시스템',
    icon: 'contrast-outline', group: 'display', route: '/settings',
    breadcrumb: [S, '화면'], keywords: ['다크모드', '라이트', '야간', '밝기', 'dark', 'light', '테마'],
  },
  {
    id: 'font-scale', label: '글자 크기', description: 'XS부터 XL까지 5단계',
    icon: 'text-outline', group: 'display', route: '/settings',
    breadcrumb: [S, '화면'], keywords: ['폰트', '글씨', '크게', '작게', '텍스트', 'font'],
  },
  {
    id: 'ambient', label: '배경 테마', description: '비 · 눈 · 별 반짝 · 바람',
    icon: 'color-wand-outline', group: 'display', route: '/settings',
    breadcrumb: [S, '화면'], keywords: ['배경', '날씨', '효과', '앰비언트', '분위기', 'ambient'],
  },
  {
    id: 'high-contrast', label: '고대비 모드', description: '야외 · 저조도 가독성 강화',
    icon: 'sunny-outline', group: 'display', route: '/settings',
    breadcrumb: [S, '화면'], keywords: ['고대비', '대비', '가독성', '접근성', '시인성'],
  },

  // ── 커뮤니티 · 수집 ──────────────────────────────────────────────────
  {
    id: 'flex-prompt', label: '자랑(플렉스) 유도', description: '목표 달성 시 성취 카드 자랑 제안',
    icon: 'sparkles-outline', group: 'community', route: '/settings',
    breadcrumb: [S, '커뮤니티 · 수집'], keywords: ['자랑', '플렉스', '공유', 'flex'],
  },
  {
    id: 'achievement-badge', label: '성취 뱃지 표시', description: '닉네임 옆 최고 등급 뱃지 노출',
    icon: 'shield-checkmark-outline', group: 'community', route: '/settings',
    breadcrumb: [S, '커뮤니티 · 수집'], keywords: ['뱃지', '배지', '성취', '등급', '엠블럼'],
  },
  {
    id: 'user-search', label: '닉네임으로 친구 찾기', description: '다른 점검자의 진행도 보기',
    icon: 'search-outline', group: 'community', route: '/user-search',
    breadcrumb: [S, '커뮤니티 · 수집'], keywords: ['친구', '검색', '닉네임', '찾기', '동료'],
  },
  {
    id: 'collection', label: '카드 수집 · 카드팩 (베타)', description: '수집 시스템 사용 여부',
    icon: 'albums-outline', group: 'community', route: '/settings',
    breadcrumb: [S, '커뮤니티 · 수집'], keywords: ['수집', '카드팩', '도감', '컬렉션', '베타', '가챠'],
  },
  {
    id: 'collection-book', label: '안전 카드 컬렉션', description: '수집한 카드 · 카드팩 열기',
    icon: 'library-outline', group: 'community', route: '/collection-book',
    breadcrumb: [S, '커뮤니티 · 수집'], keywords: ['도감', '컬렉션', '수집한 카드'], requires: 'collectionEnabled',
  },
  {
    id: 'pack-rules', label: '카드팩 획득 조건', description: '학습 · 출석 · 연속 조건 보기',
    icon: 'gift-outline', group: 'community', route: '/pack-rules',
    breadcrumb: [S, '커뮤니티 · 수집'], keywords: ['카드팩', '획득', '조건', '규칙'], requires: 'collectionEnabled',
  },

  // ── 지원 ─────────────────────────────────────────────────────────────
  {
    id: 'support', label: '고객센터 문의', description: '운영진에게 1:1 문의 남기기',
    icon: 'chatbubble-ellipses-outline', group: 'support', route: '/settings',
    breadcrumb: [S, '지원'], keywords: ['문의', '고객센터', '도움말', '1:1', '지원', 'support'],
  },
  {
    id: 'faq', label: '자주 묻는 질문(FAQ)', description: '먼저 확인하면 빠른 답을 얻어요',
    icon: 'help-circle-outline', group: 'support', route: '/support',
    breadcrumb: [S, '지원'], keywords: ['faq', '질문', '도움말', '자주'],
  },
  {
    id: 'changelog', label: '업데이트 내역', description: '새 기능 · 개선 사항',
    icon: 'sparkles-outline', group: 'support', route: '/settings',
    breadcrumb: [S, '지원'], keywords: ['업데이트', '버전', '새 기능', 'changelog', '패치'],
  },
  {
    id: 'system-log', label: '시스템 로그 다운로드', description: '오류 신고 시 함께 보내주세요',
    icon: 'download-outline', group: 'support', route: '/settings',
    breadcrumb: [S, '지원'], keywords: ['로그', '디버그', '진단', '오류', 'log'],
  },
  {
    id: 'developer', label: '개발자 모드', description: '내부 테스트용 기능',
    icon: 'construct-outline', group: 'support', route: '/developer',
    breadcrumb: [S, '지원'], keywords: ['개발자', '디버그', '테스트', 'developer'],
  },
  // '관리 콘솔'은 색인에 없다 — 설정에서 항목을 내렸기 때문이다(app/settings.tsx).
  // 화면만 내리고 색인을 두면 검색으로 그 자리에 들어가고, 하이라이트할 앵커가
  // 없어 빈 화면만 스크롤된다. 운영 콘솔 자체는 브릿지 운영관리에 있다.

  // ── 약관 · 법적 고지 (모두 /legal 한 화면 안) ────────────────────────
  {
    id: 'terms', label: '서비스 이용약관', description: '사내 학습 서비스 이용 조건',
    icon: 'document-text-outline', group: 'legal', route: '/legal',
    breadcrumb: [S, '약관 · 법적 고지'], keywords: ['약관', '이용약관', '이용 조건', 'terms'],
  },
  {
    id: 'privacy-policy', label: '개인정보 처리방침', description: '수집 항목 · 보유 기간 · 파기',
    icon: 'lock-closed-outline', group: 'legal', route: '/legal',
    breadcrumb: [S, '약관 · 법적 고지'], keywords: ['개인정보', '처리방침', '수집', '보유', '파기', 'privacy policy'],
  },
  {
    id: 'permissions', label: '앱 접근 권한 안내', description: '필수 · 선택 권한과 사용 목적',
    icon: 'key-outline', group: 'legal', route: '/legal',
    breadcrumb: [S, '약관 · 법적 고지'], keywords: ['권한', '접근권한', '알림 권한', '사진', '카메라', '생체'],
  },
  {
    id: 'opensource', label: '오픈소스 라이선스', description: '사용 중인 오픈소스 고지',
    icon: 'code-slash-outline', group: 'legal', route: '/legal',
    breadcrumb: [S, '약관 · 법적 고지'], keywords: ['오픈소스', '라이선스', 'opensource', 'license', 'mit'],
  },
  {
    id: 'data-rights', label: '개인정보 열람 · 정정 · 삭제 요청', description: '정보주체 권리 행사 방법',
    icon: 'shield-checkmark-outline', group: 'legal', route: '/legal',
    breadcrumb: [S, '약관 · 법적 고지'], keywords: ['열람', '정정', '삭제', '권리', '요청', '정보주체'],
  },
  {
    id: 'account-delete', label: '계정 삭제(이용 해지) 요청', description: '계정과 학습 기록 삭제 절차',
    icon: 'person-remove-outline', group: 'legal', route: '/legal',
    breadcrumb: [S, '약관 · 법적 고지'], keywords: ['탈퇴', '계정 삭제', '해지', '삭제', '회원탈퇴'],
  },
  {
    id: 'security-policy', label: '사내 정보보안 준수 안내', description: '학습 자료 외부 반출 금지',
    icon: 'business-outline', group: 'legal', route: '/legal',
    breadcrumb: [S, '약관 · 법적 고지'], keywords: ['보안', '정보보안', '기밀', '반출', '캡처'],
  },
  {
    id: 'copyright', label: '저작권 · 콘텐츠 이용 안내', description: '학습 콘텐츠 저작권 귀속',
    icon: 'ribbon-outline', group: 'legal', route: '/legal',
    breadcrumb: [S, '약관 · 법적 고지'], keywords: ['저작권', 'copyright', '콘텐츠', '인용', '출처'],
  },
  {
    id: 'operator', label: '서비스 운영 주체 · 문의처', description: '운영 부서와 개인정보 보호책임자',
    icon: 'information-circle-outline', group: 'legal', route: '/legal',
    breadcrumb: [S, '약관 · 법적 고지'], keywords: ['운영', '주체', '담당자', '책임자', '연락처', '문의처'],
  },

  // ── 데이터 ───────────────────────────────────────────────────────────
  {
    id: 'reset', label: '데이터 초기화', description: '이 기기의 로컬 데이터 전체 삭제',
    icon: 'trash-outline', group: 'data', route: '/settings',
    breadcrumb: [S, '데이터'], keywords: ['초기화', '리셋', '삭제', 'reset', '전체 삭제'],
  },
];

/** id → 항목 조회(화면에서 라벨·설명을 색인과 어긋나지 않게 재사용하기 위함). */
export const SETTINGS_BY_ID: Record<string, SettingsEntry> = Object.fromEntries(
  SETTINGS_INDEX.map((e) => [e.id, e]),
);
