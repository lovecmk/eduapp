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
    };
  }
}
