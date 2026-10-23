// 학습 목표(과정) — API의 배포 카드 정본 분류별로 구성한다.
// 명시적인 과정 정보가 없는 분류에는 자격 수준을 추정하지 않는다.
export type TrackLevel = 'foundation' | 'certificate' | 'expert';

export interface LearningTrack {
  id: string;
  title: string;
  subtitle: string;
  /** 이 과정의 학습 목표 한 줄 설명 */
  goal: string;
  level?: TrackLevel;
  icon: string;
  color: string;
  /** 준비 중(향후 확장) — 잠금 표시 */
  locked?: boolean;
}

export const TRACK_LEVEL_META: Record<TrackLevel, { label: string; color: string }> = {
  foundation: { label: '기초', color: '#26A69A' },
  certificate: { label: '자격증', color: '#5C6BC0' },
  expert: { label: '기술사', color: '#F2705B' },
};
