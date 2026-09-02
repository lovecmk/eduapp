import { buildPersona, categoryValues, computeAchievement } from '../achievement';
import { ALL_CATEGORIES } from '../../constants/categories';
import type { LearningCard, CardCategory } from '../../domain/models/LearningCard';
import type { StudyStats } from '../../domain/models/StudyStats';

/**
 * 자랑(공유) 카드에 찍히는 숫자와 칭호를 만드는 곳인데 커버리지가 0% 였다.
 *
 * 여기서 틀리면 사용자가 그 화면을 **밖으로 공유한다.** 조용히 틀리고 끝나는
 * 계산이 아니라, 틀린 채로 다른 사람에게 전달되는 계산이다.
 */

const [CAT_A, CAT_B, CAT_C, CAT_D, CAT_E] = ALL_CATEGORIES as CardCategory[];

function card(category: CardCategory, status: LearningCard['status']): LearningCard {
  return {
    id: `${category}-${status}-${Math.random()}`,
    category,
    subCategory: '',
    topic: '',
    keywords: [],
    title: 't',
    question: 'q',
    difficulty: 'easy',
    type: 'explanation',
    status,
    studySeconds: 10,
    situation: '',
    principle: '',
    conclusion: '',
    hasImage: false,
    dueAt: null,
  };
}

/** 한 분야에 total 장 중 mastered 장을 마스터한 카드 묶음. */
function deck(category: CardCategory, total: number, mastered: number): LearningCard[] {
  return Array.from({ length: total }, (_, i) => card(category, i < mastered ? 'mastered' : 'new'));
}

describe('categoryValues', () => {
  it('빈 배열을 줘도 모든 분야를 0 으로 돌려준다', () => {
    // 신규 사용자는 카드가 하나도 없다. 여기서 빈 배열이 나오면 화면이 깨진다.
    const values = categoryValues([]);
    expect(values).toHaveLength(ALL_CATEGORIES.length);
    expect(values.every((v) => v.value === 0 && v.total === 0)).toBe(true);
  });

  it('분야별 마스터 비율을 구한다', () => {
    const values = categoryValues(deck(CAT_A!, 4, 1));
    const a = values.find((v) => v.cat === CAT_A)!;
    expect(a.total).toBe(4);
    expect(a.mastered).toBe(1);
    expect(a.value).toBe(0.25);
  });

  it('카드가 없는 분야는 0 으로 나누지 않는다', () => {
    const values = categoryValues(deck(CAT_A!, 2, 2));
    const other = values.find((v) => v.cat !== CAT_A)!;
    expect(other.value).toBe(0);
    expect(Number.isNaN(other.value)).toBe(false);
  });
});

describe('buildPersona', () => {
  it('학습 이력이 없으면 새내기다', () => {
    expect(buildPersona([]).title).toBe('새내기 점검가');
    expect(buildPersona(categoryValues([])).title).toBe('새내기 점검가');
  });

  it('카드는 있지만 하나도 마스터하지 않았어도 새내기다', () => {
    expect(buildPersona(categoryValues(deck(CAT_A!, 5, 0))).title).toBe('새내기 점검가');
  });

  it('4개 분야 이상을 60% 넘게 마스터하면 올라운드 마스터다', () => {
    const cards = [
      ...deck(CAT_A!, 10, 7),
      ...deck(CAT_B!, 10, 7),
      ...deck(CAT_C!, 10, 7),
      ...deck(CAT_D!, 10, 7),
    ];
    expect(buildPersona(categoryValues(cards)).title).toBe('올라운드 마스터');
  });

  it('분야 간 차이가 작으면 균형잡힌 점검가다', () => {
    // 최고와 최저의 차이가 0.18 미만.
    const cards = [...deck(CAT_A!, 10, 3), ...deck(CAT_B!, 10, 2)];
    expect(buildPersona(categoryValues(cards)).title).toBe('균형잡힌 점검가');
  });

  it('한 분야가 도드라지면 그 분야 스페셜리스트다', () => {
    const cards = [...deck(CAT_A!, 10, 9), ...deck(CAT_B!, 10, 1)];
    const persona = buildPersona(categoryValues(cards));
    expect(persona.title).toBe(`${CAT_A} 스페셜리스트`);
    expect(persona.desc).toContain(CAT_A!);
  });

  /**
   * 차이(spread)만 보면 **아무것도 안 한 사람이 가장 균형 잡힌 사람이 된다** —
   * 네 분야가 모두 1% 면 차이도 1% 라 문턱을 통과한다. 칭호는 공유 카드로 남에게
   * 보여 주는 것이라, 부풀린 이름은 그 카드 전체를 믿을 수 없게 만든다.
   */
  it('막 시작한 사람에게 균형이라는 칭호를 붙이지 않는다', () => {
    // 네 분야 모두 100장 중 2장(2%) — 차이는 0 이지만 쌓인 것이 없다.
    const cards = ALL_CATEGORIES.flatMap((cat) => deck(cat, 100, 2));
    expect(buildPersona(categoryValues(cards)).title).toBe('새내기 점검가');
  });

  it('카드가 있는 분야가 하나뿐이면 균형이 아니라 그 분야 스페셜리스트다', () => {
    // 점 하나에는 폭이 없다 — 차이가 0 인 것은 고르다는 뜻이 아니다.
    const persona = buildPersona(categoryValues(deck(CAT_A!, 4, 2)));
    expect(persona.title).toBe(`${CAT_A} 스페셜리스트`);
  });

  it('어떤 경우에도 이모지와 설명이 비어 있지 않다', () => {
    const cases = [
      [],
      categoryValues([]),
      categoryValues(deck(CAT_A!, 10, 9)),
      categoryValues([...deck(CAT_A!, 10, 9), ...deck(CAT_E!, 10, 1)]),
    ];
    for (const values of cases) {
      const p = buildPersona(values);
      expect(p.emoji.length).toBeGreaterThan(0);
      expect(p.desc.length).toBeGreaterThan(0);
    }
  });
});

describe('computeAchievement', () => {
  it('통계가 없어도(null) 카드만으로 스냅샷을 만든다', () => {
    // 통계 요청이 실패하면 stats 는 undefined/null 로 들어온다.
    // 그때 공유 카드가 통째로 못 뜨면 안 된다.
    const snap = computeAchievement(deck(CAT_A!, 4, 2), null);
    expect(snap.masteredCount).toBe(2);
    expect(snap.totalCards).toBe(4);
    expect(snap.completionPct).toBe(50);
    expect(snap.accuracyPct).toBe(0);
    expect(snap.streakDays).toBe(0);
    expect(snap.level).toBe(1);
    expect(snap.levelTitle).toBe('학습 새싹');
  });

  it('카드도 통계도 없으면 0 으로 나누지 않는다', () => {
    const snap = computeAchievement([], null);
    expect(snap.completionPct).toBe(0);
    expect(Number.isNaN(snap.completionPct)).toBe(false);
    expect(snap.topCategory).toBeNull();
    expect(snap.topCategoryPct).toBe(0);
  });

  it('통계가 있으면 카드 수보다 통계를 우선한다', () => {
    // 서버가 아는 누적치가 로컬 카드 목록보다 정확하다.
    const stats = {
      totalCards: 100,
      totalLearned: 42,
      accuracy: 0.876,
      streakDays: 5,
      bestStreak: 9,
      insights: { level: 3, levelTitle: '안전 정예' },
    } as unknown as StudyStats;
    const snap = computeAchievement(deck(CAT_A!, 4, 2), stats);
    expect(snap.totalCards).toBe(100);
    expect(snap.totalLearned).toBe(42);
    expect(snap.accuracyPct).toBe(88); // 반올림
    expect(snap.streakDays).toBe(5);
    expect(snap.bestStreak).toBe(9);
    expect(snap.level).toBe(3);
    expect(snap.levelTitle).toBe('안전 정예');
  });

  it('마스터한 것이 없으면 대표 분야를 만들어 내지 않는다', () => {
    // value 가 0 인 분야를 '강점'이라고 내보내면 거짓말이 된다.
    expect(computeAchievement(deck(CAT_A!, 5, 0), null).topCategory).toBeNull();
  });

  it('가장 잘하는 분야를 대표로 뽑는다', () => {
    const snap = computeAchievement([...deck(CAT_A!, 10, 8), ...deck(CAT_B!, 10, 2)], null);
    expect(snap.topCategory).toBe(CAT_A);
    expect(snap.topCategoryPct).toBe(80);
  });

  it('periodLabel 은 YYYY.MM 형식이다', () => {
    expect(computeAchievement([], null).periodLabel).toMatch(/^\d{4}\.\d{2}$/);
  });

  it('stats 를 아예 넘기지 않아도 동작한다', () => {
    expect(() => computeAchievement(deck(CAT_A!, 2, 1))).not.toThrow();
  });
});
