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
    current: { month: string; label: string; problems: number; floors: number };
    history: { month: string; label: string; problems: number; floors: number }[];
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

/** 실서버 커뮤니티 프레즌스. `GET /api/community/live` 응답을 도메인으로 매핑. */
export class CommunityRepository implements ICommunityRepository {
  async getSnapshot(): Promise<CommunitySnapshot> {
    const dto = await apiClient.get<CommunityDTO>('/api/community/live');
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
  if (dto.building) {
    return {
      floorSize: dto.building.floor_size || FLOOR,
      current: dto.building.current,
      history: dto.building.history ?? [],
    };
  }
  const now = new Date();
  const problems = Math.max(0, Math.round((dto.total_cards_all_time ?? 0) % (FLOOR * 40)));
  return {
    floorSize: FLOOR,
    current: { month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, label: `${now.getMonth() + 1}월`, problems, floors: Math.floor(problems / FLOOR) },
    history: [],
  };
}
