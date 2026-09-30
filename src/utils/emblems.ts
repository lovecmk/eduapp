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

export const EMBLEM_DEFS: EmblemDef[] = [
  { category: '전기 위험', emoji: '⚡', label: '전기 안전' },
  { category: '공정 위험', emoji: '🎨', label: '공정 안전' },
  { category: '위험물', emoji: '🔥', label: '위험물 관리' },
  { category: '현장 점검', emoji: '📸', label: '현장 점검' },
];

const LEVEL_THRESHOLDS = [0, 30, 60, 90];
const LEVEL_ICON = ['⬜', '🥉', '🥈', '🥇'];

export function calcEmblems(
  cardMap: Map<string, { total: number; mastered: number }>,
): EmblemProgress[] {
  const catIndex: Record<string, number> = { '전기 위험': 0, '공정 위험': 1, 위험물: 2, '현장 점검': 3 };

  return EMBLEM_DEFS.map((def) => {
    const stat = cardMap.get(def.category) ?? { total: 0, mastered: 0 };
    const pct = stat.total > 0 ? Math.round((stat.mastered / stat.total) * 100) : 0;
    let level = 0;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (pct >= LEVEL_THRESHOLDS[i]) { level = i; break; }
    }
    const idx = catIndex[def.category] ?? 0;
    const topPct = [8, 15, 22, 12][idx];

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
