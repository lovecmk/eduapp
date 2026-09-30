import type { AchievementSnapshot } from '../../utils/achievement';

/**
 * 자랑 피드('오늘의 플렉스') — 성취 카드를 앱 안에서 서로 보여 주는 곳.
 *
 * 카드는 **스냅샷(숫자 묶음)** 으로 오간다. 기기에서 래스터화한 이미지(imageUri)는 그
 * 기기에서만 쓰는 사본이다 — 서버에는 올리지 않는다. 같은 스냅샷이면 어느 기기에서나
 * WrappedShareCard 가 같은 카드를 다시 그린다. 이미지 업로드(멀티파트·저장소·용량)를
 * 서버에 요구하지 않으려는 선택이다.
 */

/** 퀵 리액션 종류 — 👏 응원 / 🔥 열정 / 👍 좋아요. */
export type ReactionKind = 'clap' | 'fire' | 'up';
export const REACTION_KINDS: ReactionKind[] = ['clap', 'fire', 'up'];
export const REACTION_EMOJI: Record<ReactionKind, string> = { clap: '👏', fire: '🔥', up: '👍' };

export interface ShareCardPost {
  id: string;
  author: string;
  /** 아바타 색상 */
  color: string;
  /** 이 기기에서 래스터화한 카드 이미지(uri). 서버 글·웹에서는 null → 스냅샷으로 렌더. */
  imageUri: string | null;
  /** 이미지 종횡비(width/height) — 원본 비율 유지용 */
  aspect: number;
  /** 카드에 박제된 성취 데이터(이미지가 없을 때 폴백 렌더에 사용) */
  snapshot: AchievementSnapshot;
  likes: number;
  likedByMe: boolean;
  /** 퀵 리액션 집계 */
  reactions: Record<ReactionKind, number>;
  /** 내가 누른 리액션들 */
  myReactions: ReactionKind[];
  mine?: boolean;
  /** 상대 시간(분) — 시드 글 전용 고정값. 그 밖의 글은 createdAt 으로 계산한다. */
  minutesAgo: number;
  /**
   * 올린 시각(ms). 예전에는 내 글도 `minutesAgo: 0` 으로 저장해, 며칠이 지나도
   * 피드에 **'방금'** 으로 떴다. 저장값이 시간이 흘러도 바뀌지 않기 때문이다.
   */
  createdAt?: number;
}

/** 피드에 올릴 것. */
export interface ShareCardUpload {
  author: string;
  color: string;
  imageUri: string | null;
  aspect: number;
  snapshot: AchievementSnapshot;
}

/** 이 글이 올라온 지 몇 분 — 올린 시각이 있으면 지금 기준으로 센다. */
export function postMinutesAgo(p: { minutesAgo: number; createdAt?: number }, now = Date.now()): number {
  return typeof p.createdAt === 'number' ? Math.max(0, Math.floor((now - p.createdAt) / 60_000)) : p.minutesAgo;
}

/** 리액션 하나를 켜거나 끈 결과 — 목록 캐시의 낙관적 갱신과 로컬 저장소가 같은 규칙을 쓴다. */
export function withReaction(p: ShareCardPost, kind: ReactionKind, on: boolean): ShareCardPost {
  const had = p.myReactions.includes(kind);
  if (had === on) return p;
  return {
    ...p,
    reactions: { ...p.reactions, [kind]: Math.max(0, (p.reactions[kind] ?? 0) + (on ? 1 : -1)) },
    myReactions: on ? [...p.myReactions, kind] : p.myReactions.filter((k) => k !== kind),
  };
}
