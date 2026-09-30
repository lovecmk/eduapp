/** 카드별 현장 팁 — 실무자가 남기는 짧은 노하우. */
export interface CardTip {
  id: string;
  cardId: string;
  author: string;
  color: string;
  body: string;
  likes: number;
  likedByMe: boolean;
  mine?: boolean;
  /** 서버 시각이 없는 옛 로컬 팁 전용 고정값. */
  minutesAgo: number;
  /** 올린 시각(ms). 예전엔 0 으로 저장돼 영원히 '방금'이었다. */
  createdAt?: number;
}

/** 이 팁이 올라온 지 몇 분. */
export function tipMinutesAgo(t: { minutesAgo: number; createdAt?: number }, now = Date.now()): number {
  return typeof t.createdAt === 'number' ? Math.max(0, Math.floor((now - t.createdAt) / 60_000)) : t.minutesAgo;
}

/** 목록 순서 — 공감이 많은 것, 같으면 최근 것. 서버와 로컬이 같은 순서를 쓴다. */
export function sortTips(tips: CardTip[]): CardTip[] {
  return [...tips].sort((a, b) => b.likes - a.likes || tipMinutesAgo(a) - tipMinutesAgo(b));
}
