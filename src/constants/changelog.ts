// 업데이트 내역(Changelog) — OTA 업데이트 안내 모달과 연동되는 릴리스 노트.
export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '2026-07-10',
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
