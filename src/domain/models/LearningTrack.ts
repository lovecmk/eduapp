import type { CardCategory } from './LearningCard';

// 학습 목표(과정) — 여러 카드를 하나의 "목표"로 묶는 커리큘럼 레이어.
// 카드 분류(대>중>소)에 깊이를 더하지 않고, 카테고리를 묶는 얕은 그룹으로 설계.
// 예: [소방·피난 기초] 과정 → 난이도(초/중/고)별 문제. 향후 [소방기술사] 등 자격 과정으로 확장.
export type TrackLevel = 'foundation' | 'certificate' | 'expert';

export interface LearningTrack {
  id: string;
  title: string;
  subtitle: string;
  /** 이 과정의 학습 목표 한 줄 설명 */
  goal: string;
  level: TrackLevel;
  icon: string;
  color: string;
  /** 이 과정에 포함되는 대분류(카드 소속 결정) */
  categories: CardCategory[];
  /** 준비 중(향후 확장) — 잠금 표시 */
  locked?: boolean;
}

export const TRACK_LEVEL_META: Record<TrackLevel, { label: string; color: string }> = {
  foundation: { label: '기초', color: '#26A69A' },
  certificate: { label: '자격증', color: '#5C6BC0' },
  expert: { label: '기술사', color: '#F2705B' },
};
