import type { FactionId } from '../../constants/factions';

/**
 * 진영 대항전 순위(월간) — 커뮤니티 누적 문제 수를 세 진영으로 안정적으로
 * 분배해 진영별 기여량을 만든다. 같은 입력이면 같은 결과(결정적)라 새로고침에도
 * 값이 튀지 않는다.
 *
 * **우승 진영 자체는 이 함수가 정하지 않는다.** 서버(`building[].winner`)가
 * 정본이고, 이 함수는 서버가 주지 않는 값 — 내 진영의 순위·기여량 — 만 만든다.
 * 계산 규칙은 서버(BE `service/faction.go`)가 이 파일을 그대로 옮긴 것이라 지금은
 * 두 결과가 같지만, 어느 한쪽이 바뀌는 날 같은 달을 두고 서로 다른 우승자를
 * 말하게 된다. 그래서 `winner` 를 넘겨 받아 그쪽으로 맞춘다(아래 참고).
 */
export interface FactionStanding {
  id: FactionId;
  floors: number;
  problems: number;
}

// 진영별 기본 분배 비율(합 1.0) — 월 시드로 살짝 흔들어 매달 순위가 달라진다.
const BASE_SHARE: Record<FactionId, number> = { frost: 0.35, flame: 0.34, volt: 0.31 };

/** 'YYYY-MM' → 결정적 정수 시드(대항전 분배를 달마다 흔든다). */
export function monthToSeed(month: string): number {
  return month.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
}

/**
 * 진영별 분배를 **만들어 낸다** — 목업 저장소(CommunityRepository.mock) 시연 전용.
 * 화면은 이 함수를 부르지 않는다(서버 집계 `BuildingMonth.factions` 만 그린다).
 *
 * @param winner 서버가 정한 그 달 우승 진영. 주면 1위가 반드시 이 진영이 된다
 *   (분배 결과가 다르게 나오면 1위 몫과 우승 진영의 몫을 맞바꾼다). 서버가
 *   값을 주지 않으면(구버전·집계 전) 넘기지 않는다 — 그때는 화면이 '선두'를
 *   단정하지 않는다.
 */
export function factionStandings(
  totalProblems: number,
  floorSize: number,
  monthSeed: number,
  winner?: FactionId | null,
): FactionStanding[] {
  const ids: FactionId[] = ['frost', 'flame', 'volt'];
  // 월 시드로 ±6% 내에서 비율을 흔든다(결정적).
  const jitter = (n: number) => ((Math.sin(monthSeed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  const shares = ids.map((id, i) => Math.max(0.15, BASE_SHARE[id] + (jitter(i) - 0.5) * 0.12));
  const sum = shares.reduce((a, b) => a + b, 0);
  const ranked = ids
    .map((id, i) => {
      const problems = Math.round((totalProblems * shares[i]) / sum);
      return { id, problems, floors: Math.floor(problems / Math.max(1, floorSize)) };
    })
    .sort((a, b) => b.floors - a.floors || b.problems - a.problems);

  // 서버가 우승 진영을 말해 줬는데 여기 1위가 다르면 **서버를 따른다.**
  // 몫(문제 수·층수)은 그대로 두고 두 진영의 자리만 맞바꾼다 — 합계와 분포는
  // 보존되고, 화면의 '🏆 선두'는 지난 달 기록의 색과 같은 근거를 갖게 된다.
  if (winner && ranked.length > 0 && ranked[0].id !== winner) {
    const i = ranked.findIndex((s) => s.id === winner);
    if (i > 0) {
      const displaced = ranked[0].id;
      ranked[0].id = winner;
      ranked[i].id = displaced;
    }
  }
  return ranked;
}
