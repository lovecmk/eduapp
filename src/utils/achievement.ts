// 공유(자랑) 카드용 성취 데이터 + 칭호 계산 — 통계/카드 상태에서 파생한다.
// 스포티파이 랩드 스타일 카드가 이 스냅샷 하나만 받아 렌더링하도록 단일화한다.
import { ALL_CATEGORIES } from '../constants/categories';
import { EMBLEM_DEFS } from './emblems';
import type { LearningCard, CardCategory } from '../domain/models/LearningCard';
import type { StudyStats } from '../domain/models/StudyStats';

const EMOJI: Record<string, string> = Object.fromEntries(EMBLEM_DEFS.map((d) => [d.category, d.emoji]));

export interface Persona {
  emoji: string;
  title: string;
  desc: string;
}

/**
 * 카테고리별 마스터 비율(value)로 학습 페르소나(칭호)를 만든다.
 * LearningPersonaCard 와 공유 카드가 동일한 칭호를 쓰도록 한 곳에서 계산한다.
 */
export function buildPersona(values: { cat: CardCategory; value: number; total: number }[]): Persona {
  const withData = values.filter((v) => v.total > 0);
  const learned = withData.filter((v) => v.value > 0);
  if (learned.length === 0) return { emoji: '🐣', title: '새내기 점검가', desc: '이제 막 학습을 시작했어요. 함께 채워가요!' };

  const sorted = [...withData].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const spread = top.value - sorted[sorted.length - 1].value;
  const masteredCats = withData.filter((v) => v.value >= 0.6).length;

  if (masteredCats >= 4) return { emoji: '🧭', title: '올라운드 마스터', desc: '전 분야를 고르게 마스터한 만능 점검가예요!' };
  if (spread < 0.18) return { emoji: '⚖️', title: '균형잡힌 점검가', desc: '어느 한쪽에 치우치지 않고 골고루 학습하고 있어요.' };
  return { emoji: EMOJI[top.cat] ?? '🎯', title: `${top.cat} 스페셜리스트`, desc: `${top.cat} 분야에 특히 강해요. 든든한 전문가!` };
}

/** 카드 배열에서 카테고리별 마스터 비율을 구한다(페르소나 입력). */
export function categoryValues(cards: LearningCard[]) {
  return ALL_CATEGORIES.map((cat) => {
    const inCat = cards.filter((x) => x.category === cat);
    const mastered = inCat.filter((x) => x.status === 'mastered').length;
    const value = inCat.length > 0 ? mastered / inCat.length : 0;
    return { cat, value, total: inCat.length, mastered };
  });
}

/** 공유 카드 한 장을 렌더링하는 데 필요한 모든 성취 데이터의 스냅샷. */
export interface AchievementSnapshot {
  /** 칭호(페르소나) */
  title: string;
  emoji: string;
  /** 누적 학습 카드 수 */
  totalLearned: number;
  /** 마스터한 카드 수 */
  masteredCount: number;
  /** 전체 카드 수 */
  totalCards: number;
  /** 완료율(%) */
  completionPct: number;
  /** 정답률(%) */
  accuracyPct: number;
  /** 연속 학습 일수 */
  streakDays: number;
  /** 최고 연속 기록 */
  bestStreak: number;
  /** 학습 레벨 */
  level: number;
  /** 레벨 칭호 */
  levelTitle: string;
  /** 대표 강점 분야(없으면 null) */
  topCategory: string | null;
  /** 대표 분야 이모지 */
  topEmoji: string;
  /** 대표 분야 마스터 비율(%) */
  topCategoryPct: number;
  /** 'YYYY.MM' 형태의 생성 시점 라벨 */
  periodLabel: string;
}

/** 통계 + 전체 카드로 공유 카드용 성취 스냅샷을 만든다. */
export function computeAchievement(cards: LearningCard[], stats?: StudyStats | null): AchievementSnapshot {
  const values = categoryValues(cards);
  const persona = buildPersona(values);

  const withData = values.filter((v) => v.total > 0);
  const top = [...withData].sort((a, b) => b.value - a.value)[0];

  const masteredCount = cards.filter((x) => x.status === 'mastered').length;
  const totalCards = stats?.totalCards ?? cards.length;
  const totalLearned = stats?.totalLearned ?? masteredCount;
  const completionPct = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0;

  const now = new Date();
  const periodLabel = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`;

  return {
    title: persona.title,
    emoji: persona.emoji,
    totalLearned,
    masteredCount,
    totalCards,
    completionPct,
    accuracyPct: Math.round((stats?.accuracy ?? 0) * 100),
    streakDays: stats?.streakDays ?? 0,
    bestStreak: stats?.bestStreak ?? 0,
    level: stats?.insights?.level ?? 1,
    levelTitle: stats?.insights?.levelTitle ?? '학습 새싹',
    topCategory: top && top.value > 0 ? top.cat : null,
    topEmoji: top ? EMOJI[top.cat] ?? '🎯' : '🎯',
    topCategoryPct: top ? Math.round(top.value * 100) : 0,
    periodLabel,
  };
}
