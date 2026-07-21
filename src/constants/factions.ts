// 진영(팀) 정의 — 포켓몬 GO의 '프리저·썬더·파이어' 3진영 선택을 모티브로,
// 현장안전 학습 커뮤니티를 세 진영으로 나눠 '함께 짓는 안전 빌딩'을 두고 대항하게 한다.
// 회원가입 직후 한 번 진영을 고르며, 이후 커뮤니티 빌딩이 진영 색·형태로 표시된다.
import type { Ionicons } from '@expo/vector-icons';

export type FactionId = 'frost' | 'flame' | 'volt';

/** 빌딩 실루엣 형태 — 진영마다 다르게 자라난다. */
export type BuildingVariant = 'tower' | 'blaze' | 'bolt';

export interface Faction {
  id: FactionId;
  /** 진영명(별칭 포함) */
  name: string;
  /** 짧은 별칭(상징 새) */
  emblem: string;
  emoji: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** 대표 색(라이트/다크 모두에서 무난한 채도) */
  color: string;
  /** 살짝 어두운 강조색(그래프·테두리용) */
  accent: string;
  /** 진영 슬로건 */
  tagline: string;
  /** 진영 소개 한 줄 */
  description: string;
  /** 커뮤니티 빌딩 형태 */
  building: BuildingVariant;
}

export const FACTIONS: Record<FactionId, Faction> = {
  frost: {
    id: 'frost',
    name: '프로스트',
    emblem: '수호대',
    emoji: '❄️',
    icon: 'snow',
    color: '#2F6FED',
    accent: '#1E4FB8',
    tagline: '차갑게 관찰하고, 완벽하게 지킨다',
    description: '침착한 점검과 원칙으로 사고를 얼려버리는 파란 진영.',
    building: 'tower',
  },
  flame: {
    id: 'flame',
    name: '플레임',
    emblem: '불꽃대',
    emoji: '🔥',
    icon: 'flame',
    color: '#F0463C',
    accent: '#C22E27',
    tagline: '뜨거운 열정으로 앞장선다',
    description: '가장 먼저 배우고 가장 앞에서 이끄는 붉은 진영.',
    building: 'blaze',
  },
  volt: {
    id: 'volt',
    name: '볼트',
    emblem: '번개대',
    emoji: '⚡',
    icon: 'flash',
    color: '#F2A310',
    accent: '#C77E00',
    tagline: '빠르게 배우고, 번뜩이게 대응한다',
    description: '순발력과 감각으로 위험을 먼저 눈치채는 노란 진영.',
    building: 'bolt',
  },
};

export const FACTION_LIST: Faction[] = [FACTIONS.frost, FACTIONS.flame, FACTIONS.volt];

export function getFaction(id: FactionId | null | undefined): Faction | null {
  if (!id) return null;
  return FACTIONS[id] ?? null;
}

/**
 * 진영 대항전 순위(월간) — 서버가 없으므로 커뮤니티 누적 문제 수를 세 진영으로
 * 안정적으로 분배해 '대항전'이 살아있는 것처럼 보이게 한다. 같은 입력이면 같은
 * 결과(결정적)라 새로고침에도 값이 튀지 않는다.
 */
export interface FactionStanding {
  id: FactionId;
  floors: number;
  problems: number;
}

// 진영별 기본 분배 비율(합 1.0) — 월 시드로 살짝 흔들어 매달 순위가 달라진다.
const BASE_SHARE: Record<FactionId, number> = { frost: 0.35, flame: 0.34, volt: 0.31 };

export function factionStandings(
  totalProblems: number,
  floorSize: number,
  monthSeed: number,
): FactionStanding[] {
  const ids: FactionId[] = ['frost', 'flame', 'volt'];
  // 월 시드로 ±6% 내에서 비율을 흔든다(결정적).
  const jitter = (n: number) => ((Math.sin(monthSeed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  const shares = ids.map((id, i) => Math.max(0.15, BASE_SHARE[id] + (jitter(i) - 0.5) * 0.12));
  const sum = shares.reduce((a, b) => a + b, 0);
  return ids
    .map((id, i) => {
      const problems = Math.round((totalProblems * shares[i]) / sum);
      return { id, problems, floors: Math.floor(problems / Math.max(1, floorSize)) };
    })
    .sort((a, b) => b.floors - a.floors || b.problems - a.problems);
}
