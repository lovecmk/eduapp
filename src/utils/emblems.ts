export interface EmblemDef {
  category: string;
  emoji: string;
  label: string;
}

export interface EmblemProgress {
  category: string;
  emoji: string;
  label: string;
  mastered: number;
  total: number;
  pct: number;
  level: number;
  topPct: number;
}

export interface EmblemRankEntry {
  rank: number;
  nickname: string;
  score: number;
  pct: number;
}

export const EMBLEM_DEFS: EmblemDef[] = [
  { category: '소방', emoji: '🔥', label: '화재안전' },
  { category: '전기', emoji: '⚡', label: '전기안전' },
  { category: '추락', emoji: '⛑️', label: '고소작업' },
  { category: '화학', emoji: '🧪', label: '화학물질취급' },
  { category: '기계', emoji: '⚙️', label: '기계안전' },
];

const LEVEL_THRESHOLDS = [0, 30, 60, 90];
const LEVEL_ICON = ['⬜', '🥉', '🥈', '🥇'];

const NAME_POOL = ['김안전', '박현장', '최예방', '이방호', '정점검', '한관리', '오대비', '강예방', '조점검', '신안전'];

export function calcEmblems(
  cardMap: Map<string, { total: number; mastered: number }>,
): EmblemProgress[] {
  const catIndex: Record<string, number> = { 소방: 0, 전기: 1, 추락: 2, 화학: 3, 기계: 4 };

  return EMBLEM_DEFS.map((def) => {
    const stat = cardMap.get(def.category) ?? { total: 0, mastered: 0 };
    const pct = stat.total > 0 ? Math.round((stat.mastered / stat.total) * 100) : 0;
    let level = 0;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (pct >= LEVEL_THRESHOLDS[i]) { level = i; break; }
    }
    const idx = catIndex[def.category] ?? 0;
    const topPct = [8, 15, 22, 30, 12][idx];

    return {
      category: def.category,
      emoji: def.emoji,
      label: def.label,
      mastered: stat.mastered,
      total: stat.total,
      pct,
      level,
      topPct,
    };
  });
}

export function getEmblemIcon(level: number): string {
  return LEVEL_ICON[level] ?? '⬜';
}

export function getAcquiredEmblems(emblems: EmblemProgress[]): EmblemProgress[] {
  return emblems.filter((e) => e.level > 0);
}

export function emblemRankingMock(category: string): EmblemRankEntry[] {
  const idx = EMBLEM_DEFS.findIndex((d) => d.category === category);
  const seeded = [...NAME_POOL].sort((a, b) => {
    const ha = (idx + a.charCodeAt(0)) % 13;
    const hb = (idx + b.charCodeAt(0)) % 13;
    return hb - ha;
  });
  return seeded.slice(0, 5).map((nickname, i) => ({
    rank: i + 1,
    nickname,
    score: Math.round(94 - i * 9),
    pct: Math.round(88 - i * 13),
  }));
}
