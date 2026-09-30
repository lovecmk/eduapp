import type { ICommunityRepository } from '../../domain/repositories/ICommunityRepository';
import type { CommunitySnapshot } from '../../domain/models/Community';
import { apiClient } from '../network/ApiClient';

interface ActivityDTO {
  id: string;
  user_nm: string;
  action_cd: string;
  category_cd?: string;
  seconds_ago: number;
}
interface BuildingMonthDTO {
  month: string;
  label: string;
  problems: number;
  floors: number;
  winner?: string;
  /** 진영별 그 달 기여 문제 수(docs/BACKEND_TODO §5). 없으면 앱은 대항전을 '집계 준비 중'으로. */
  factions?: { faction_cd: string; problems: number }[];
}

const FACTION_IDS = ['frost', 'flame', 'volt'] as const;
type FactionCode = (typeof FACTION_IDS)[number];

function mapFactions(list: BuildingMonthDTO['factions'], floorSize: number) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const rows = list
    .filter((f): f is { faction_cd: FactionCode; problems: number } => (FACTION_IDS as readonly string[]).includes(f?.faction_cd))
    .map((f) => {
      const problems = Math.max(0, Math.trunc(f.problems ?? 0));
      return { id: f.faction_cd, problems, floors: Math.floor(problems / Math.max(1, floorSize)) };
    })
    .sort((a, b) => b.floors - a.floors || b.problems - a.problems);
  return rows.length > 0 ? rows : undefined;
}
interface CommunityDTO {
  online_now: number;
  studied_today: number;
  total_minutes_today: number;
  daily_goal_minutes: number;
  companions: { id: string; user_nm: string; color: string; category_cd?: string }[];
  activities: ActivityDTO[];
  challenge?: {
    title: string;
    goal_cards: number;
    current_cards: number;
    my_contribution: number;
    participants: number;
    ends_in_days: number;
  };
  total_cards_all_time?: number;
  building?: {
    floor_size: number;
    /** `winner` 는 서버가 정한 그 달 우승 진영('frost'|'flame'|'volt'). */
    current: BuildingMonthDTO;
    history: BuildingMonthDTO[];
  };
  leaderboard?: { rank: number; nickname: string; cards: number; color: string; is_me: boolean }[];
  my_rank?: number;
}

const ACTION_MAP: Record<string, CommunitySnapshot['activities'][number]['action']> = {
  MASTERED: 'mastered',
  LEARNING: 'learning',
  STREAK: 'streak',
  JOINED: 'joined',
};

function timeAgo(sec: number): string {
  if (sec < 30) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  return `${Math.floor(sec / 3600)}시간 전`;
}

/** 실서버 커뮤니티 프레즌스. `GET /inner/api/v1/community/live` 응답을 도메인으로 매핑. */
export class CommunityRepository implements ICommunityRepository {
  async getSnapshot(): Promise<CommunitySnapshot> {
    const dto = await apiClient.get<CommunityDTO>('/inner/api/v1/community/live');
    return {
      onlineNow: dto.online_now ?? 0,
      studiedToday: dto.studied_today ?? 0,
      totalMinutesToday: dto.total_minutes_today ?? 0,
      dailyGoalMinutes: dto.daily_goal_minutes ?? 0,
      companions: (dto.companions ?? []).map((c) => ({
        id: c.id,
        name: c.user_nm,
        color: c.color,
        category: c.category_cd,
      })),
      activities: (dto.activities ?? []).map((a) => ({
        id: a.id,
        name: a.user_nm,
        action: ACTION_MAP[a.action_cd] ?? 'learning',
        category: a.category_cd,
        timeAgo: timeAgo(a.seconds_ago),
      })),
      challenge: {
        title: dto.challenge?.title ?? '이번 주 챌린지',
        goalCards: dto.challenge?.goal_cards ?? 0,
        currentCards: dto.challenge?.current_cards ?? 0,
        myContribution: dto.challenge?.my_contribution ?? 0,
        participants: dto.challenge?.participants ?? 0,
        endsInDays: dto.challenge?.ends_in_days ?? 0,
      },
      totalCardsAllTime: dto.total_cards_all_time ?? 0,
      building: mapBuilding(dto),
      leaderboard: (dto.leaderboard ?? []).map((r) => ({
        rank: r.rank,
        name: r.nickname,
        cards: r.cards,
        color: r.color,
        isMe: r.is_me,
      })),
      myRank: dto.my_rank ?? 0,
    };
  }
}

/** 서버 building 응답 매핑 — 아직 미구현이면 누적치로부터 이번 달만 근사 계산. */
function mapBuilding(dto: CommunityDTO): CommunitySnapshot['building'] {
  const FLOOR = 20_000;
  /**
   * 우승 진영이 비어 있으면 **비운 채로 둔다.**
   *
   * 전에는 없으면 'frost' 로 채웠는데, 그러면 아무도 이기지 않은 달에 프로스트가
   * 이긴 것처럼 보인다 — 화면은 조용하고 값은 거짓이다(`_fallback.ts` 가 말하는
   * "아무도 모르는 조용함은 사고다"와 같은 종류). 빈 값이면 화면이 '집계 중'
   * 으로 그리고, 이번 달 선두도 단정하지 않는다.
   */
  const floorSize = dto.building?.floor_size || FLOOR;
  const withWinner = (m: BuildingMonthDTO) => {
    const { factions, ...rest } = m;
    return { ...rest, winner: m.winner ?? '', factions: mapFactions(factions, floorSize) };
  };
  if (dto.building) {
    return {
      floorSize,
      current: withWinner(dto.building.current),
      history: (dto.building.history ?? []).map(withWinner),
    };
  }
  const now = new Date();
  const problems = Math.max(0, Math.round((dto.total_cards_all_time ?? 0) % (FLOOR * 40)));
  return {
    floorSize: FLOOR,
    current: { month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, label: `${now.getMonth() + 1}월`, problems, floors: Math.floor(problems / FLOOR), winner: '' },
    history: [],
  };
}
