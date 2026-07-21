// 성취 카드 희소 등급(Rarity) — 레벨·완료율·연속기록으로 등급을 매겨
// 랩드 카드에 차등 시각효과(무지개 테두리·별가루·글로우)를 부여한다.
import type { AchievementSnapshot } from './achievement';

export type RarityTier = 'common' | 'rare' | 'epic' | 'legendary';

export interface Rarity {
  tier: RarityTier;
  /** 카드에 표기할 라벨 */
  label: string;
  /** 테두리/글로우에 쓰는 색 배열(2색 이상이면 그라데이션) */
  colors: string[];
  /** 글로우 색 */
  glow: string;
  /** 떠다니는 별가루 파티클 수(0이면 없음) */
  sparkles: number;
  /** 등급 뱃지 배경 */
  badgeBg: string;
}

// 등급 라벨은 "안전요원 승급" 테마 — 게임틱한 노멀/레어/에픽/레전드 대신
// 새싹 → 정예 → 특급 → 수호신. 라벨의 단일 출처(모든 화면이 이걸 참조).
export const RARITY_META: Record<RarityTier, Omit<Rarity, 'tier'>> = {
  common: { label: '새싹', colors: ['rgba(255,255,255,0.14)'], glow: 'transparent', sparkles: 0, badgeBg: 'rgba(255,255,255,0.12)' },
  rare: { label: '정예', colors: ['#38BDF8', '#3B82F6'], glow: '#38BDF8', sparkles: 4, badgeBg: 'rgba(56,189,248,0.22)' },
  epic: { label: '특급', colors: ['#A855F7', '#EC4899'], glow: '#C084FC', sparkles: 7, badgeBg: 'rgba(192,132,252,0.24)' },
  legendary: { label: '수호신', colors: ['#F59E0B', '#EC4899', '#8B5CF6', '#22D3EE', '#F59E0B'], glow: '#FBBF24', sparkles: 11, badgeBg: 'rgba(251,191,36,0.26)' },
};

/** 등급 오름차순 정렬용 순위(공용). */
export const RARITY_RANK: Record<RarityTier, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
/** 낮은→높은 등급 순서(공용). */
export const RARITY_ORDER: RarityTier[] = ['common', 'rare', 'epic', 'legendary'];

/** 성취 스냅샷에서 희소 등급을 산출한다. */
export function getRarity(s: AchievementSnapshot): Rarity {
  const level = s.level ?? 1;
  const comp = s.completionPct ?? 0;
  const streak = s.bestStreak ?? 0;

  let tier: RarityTier;
  if (level >= 8 || comp >= 90 || streak >= 30) tier = 'legendary';
  else if (level >= 6 || comp >= 70 || streak >= 18) tier = 'epic';
  else if (level >= 4 || comp >= 45 || streak >= 7) tier = 'rare';
  else tier = 'common';

  return { tier, ...RARITY_META[tier] };
}
