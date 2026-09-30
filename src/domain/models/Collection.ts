// 도감 스냅샷 — 앱과 서버가 주고받는 수집 기록의 모양.
//
// ── 왜 잔액이 없나 ──────────────────────────────────────────────────────
// 카드팩과 조각은 늘기도 줄기도 하는 **잔액**이다. 잔액을 그대로 동기화하면
// 오프라인 앱에서 반드시 깨진다:
//
//   기기A(오프라인): 팩 5개를 벌어 3개를 연다 → 잔액 2
//   기기B(온라인)  : 팩 1개를 연다            → 잔액 4
//   → 나중에 붙은 쪽이 이기면 상대의 적립이나 개봉이 통째로 사라진다.
//
// 그래서 잔액 대신 **줄어들지 않는 두 카운터**를 주고받는다. 잔액은 뺄셈으로
// 나온다. 두 값 모두 단조 증가라 병합이 최댓값 하나로 끝나고, 같은 요청이
// 두 번 가도 결과가 같다(서버의 domain.Collection 과 짝을 이룬다).

export interface CollectionSnapshot {
  /** 카드 id → 보유 장수(중복 포함) */
  owned: Record<string, number>;
  /** 지금까지 지급받은 카드팩 총량 */
  packsEarned: number;
  /** 지금까지 연 카드팩 총량 */
  packsOpened: number;
  /** 중복으로 얻은 안전 조각 총량 */
  shardsEarned: number;
  /** 교환에 쓴 안전 조각 총량 */
  shardsSpent: number;
  /** 누적 학습 장수 */
  studyTotal: number;
  /** 획득 규칙 id → 수령 횟수 */
  claimedRules: Record<string, number>;
  /** 이미 쓴 가챠 코드 */
  /**
   * 예전 이벤트 쿠폰 교환 기록. 쿠폰 기능은 걷어 냈지만(코드 표가 앱 번들에 들어 있어
   * 누구나 꺼내 쓸 수 있었다) 서버 계약(`redeemed_codes`, 합집합)과 이미 교환한 사람의
   * 기록을 지키려고 필드는 그대로 주고받는다. 새로 쌓이지는 않는다.
   */
  redeemedCodes: string[];
  /** 마지막으로 일일 무료팩을 받은 날(YYYY-MM-DD) */
  lastDailyPack: string;
  /** 상위 등급 천장 진행도 */
  sinceEpic: number;
  sinceLegendary: number;
}

export const EMPTY_SNAPSHOT: CollectionSnapshot = {
  owned: {},
  packsEarned: 0,
  packsOpened: 0,
  shardsEarned: 0,
  shardsSpent: 0,
  studyTotal: 0,
  claimedRules: {},
  redeemedCodes: [],
  lastDailyPack: '',
  sinceEpic: 0,
  sinceLegendary: 0,
};

const maxOf = (a: number, b: number) => (a > b ? a : b);

function mergeCounts(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v > (out[k] ?? 0)) out[k] = v;
  }
  return out;
}

/**
 * 두 스냅샷을 합친다 — 서버와 **같은 규칙**이어야 한다.
 *
 * 앱에도 병합이 필요한 이유: 동기화 응답이 돌아오는 사이에도 사용자는 팩을
 * 연다. 응답을 그대로 덮어쓰면 그 몇 초 동안의 개봉이 사라진다. 여기서 다시
 * 한 번 합치면 그 창이 닫힌다.
 *
 * 모든 값이 단조 증가라 최댓값이 곧 정답이다(교환법칙·멱등 둘 다 성립).
 */
export function mergeSnapshots(a: CollectionSnapshot, b: CollectionSnapshot): CollectionSnapshot {
  return {
    owned: mergeCounts(a.owned, b.owned),
    packsEarned: maxOf(a.packsEarned, b.packsEarned),
    packsOpened: maxOf(a.packsOpened, b.packsOpened),
    shardsEarned: maxOf(a.shardsEarned, b.shardsEarned),
    shardsSpent: maxOf(a.shardsSpent, b.shardsSpent),
    studyTotal: maxOf(a.studyTotal, b.studyTotal),
    claimedRules: mergeCounts(a.claimedRules, b.claimedRules),
    // 코드는 합집합 — 한 기기에서만 쓴 코드도 다시 쓸 수 없어야 한다.
    redeemedCodes: [...new Set([...a.redeemedCodes, ...b.redeemedCodes])].sort(),
    // 날짜 키가 고정폭(YYYY-MM-DD)이라 문자열 비교가 곧 날짜 비교다.
    lastDailyPack: a.lastDailyPack > b.lastDailyPack ? a.lastDailyPack : b.lastDailyPack,
    // 천장은 '더 오래 못 받은 쪽'을 인정한다 — 반대로 잡으면 기기를 바꿔 가며
    // 천장을 초기화해 상위 등급을 계속 앞당길 수 있다.
    sinceEpic: maxOf(a.sinceEpic, b.sinceEpic),
    sinceLegendary: maxOf(a.sinceLegendary, b.sinceLegendary),
  };
}

/** 지금 열 수 있는 카드팩 수. 음수는 나오지 않는다. */
export const packBalance = (s: Pick<CollectionSnapshot, 'packsEarned' | 'packsOpened'>) =>
  Math.max(0, s.packsEarned - s.packsOpened);

/** 지금 쓸 수 있는 안전 조각 수. */
export const shardBalance = (s: Pick<CollectionSnapshot, 'shardsEarned' | 'shardsSpent'>) =>
  Math.max(0, s.shardsEarned - s.shardsSpent);
