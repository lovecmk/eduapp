// 업데이트 내역(Changelog) — OTA 업데이트 안내 모달과 연동되는 릴리스 노트.
export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-07-10',
    highlights: [
      '건물점검자 맞춤 콘텐츠 및 대·중·소분류 카테고리 체계 도입',
      '이미지 문제 지원(도해·현장 사진)',
      '실시간 "함께 학습 중" 커뮤니티 위젯 — 접속자·활동 피드·공동 목표',
      'Pretendard 폰트 적용으로 가독성·완성도 향상',
      '메인 로그인 화면 리디자인',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-07-08',
    highlights: [
      '심플 모던 디자인 시스템 전면 적용',
      '실시간 백엔드 상태 모니터링 위젯 추가',
      '알림 세분화(인앱·이메일·마케팅) 및 커스텀 스위치',
      '고객센터 문의·시스템 로그 다운로드 등 운영 기능 추가',
      'OTA 자동 업데이트 및 캐시 버스팅 지원',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-06-20',
    highlights: [
      '망각곡선 기반 복습 스케줄러 도입',
      '카드 스와이프 학습 인터랙션 개선',
      '학습 통계 대시보드 추가',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-05-30',
    highlights: ['생체인증 로그인 지원', '다크/딤 테마 추가'],
  },
];
