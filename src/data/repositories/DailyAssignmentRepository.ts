import type { IDailyAssignmentRepository } from '../../domain/repositories/IDailyAssignmentRepository';
import type { DailyAssignment, DailyCard } from '../../domain/models/DailyAssignment';
import type { CardDifficulty } from '../../domain/models/LearningCard';
import type { CardDTO } from '../dto/CardDTO';
import { CardMapper } from '../mappers/CardMapper';
import { apiClient } from '../network/ApiClient';
import { dateKey } from '../../utils/dateKey';
import { setPersonalReviewPolicy, type PersonalReviewPolicy } from '../network/personalReviewPolicy';
import { ApiError } from '../network/errors';
import { assertSessionEpoch, getSessionEpoch } from '../network/sessionEpoch';
export interface TodayPlanDTO {
  personalized?: boolean;
  review_policy?: PersonalReviewPolicy;
  day?: string;
	resets_at?: string;
  difficulty_cd?: string;
  target_count?: number;
  done_count?: number;
  cards?: (CardDTO & { kind?: string; done?: boolean; recommend_reason?: string; recommend_score?: number })[];
}

const DIFFICULTY: Record<string, CardDifficulty> = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
};

/**
 * 실서버 오늘의 학습.
 *  · get() → GET /inner/api/v1/learning/today
 *
 * 편성은 서버가 정한다. 앱이 직접 고르면 기기마다 다른 목록이 나오고, 앱을
 * 지우면 진도가 초기화되며, 관리자가 출제 정책을 바꿔도 아무 일이 일어나지 않는다.
 */
export class DailyAssignmentRepository implements IDailyAssignmentRepository {
  constructor(private readonly onValidated?: (dto: TodayPlanDTO) => Promise<void>) {}
  async get(): Promise<DailyAssignment> {
    const epoch = getSessionEpoch();
    const dto = await apiClient.get<TodayPlanDTO>('/inner/api/v1/learning/today');
    assertSessionEpoch(epoch);
    const result = this.parse(dto);
    if (this.onValidated) {
      try { await this.onValidated(dto); } catch { /* Cache is optional. */ }
      assertSessionEpoch(epoch);
    }
    return result;
  }

  parse(dto: TodayPlanDTO): DailyAssignment {
    if (!dto || !Array.isArray(dto.cards)) throw new ApiError(502, '오늘의 학습 응답 형식이 올바르지 않습니다', 'server');
    const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    if (dto.target_count != null && !count(dto.target_count) || dto.done_count != null && (!count(dto.done_count) || dto.done_count > dto.cards.length)) throw new ApiError(502, '오늘의 학습 목표 응답이 올바르지 않습니다', 'server');
    if (dto.personalized === true) {
      const invalid = () => new ApiError(502, '개인화 학습 배포 계약이 올바르지 않습니다', 'server');
      if (dto.cards.length > 5 || dto.cards.some(c => !c || !['NEW', 'REVIEW'].includes(c.kind ?? '') || typeof c.done !== 'boolean' || typeof c.recommend_reason !== 'string' || !c.recommend_reason || c.recommend_score != null && (typeof c.recommend_score !== 'number' || !Number.isFinite(c.recommend_score)))) throw invalid();
      if (dto.cards.filter(c => c.kind === 'NEW').length > 3 || dto.cards.filter(c => c.kind === 'REVIEW').length > 2 || dto.target_count !== dto.cards.length || dto.done_count !== dto.cards.filter(c => c.done).length) throw invalid();
      const policy = dto.review_policy;
      if (!policy || ![policy.first_days, policy.repeat_days].every(value => Number.isInteger(value) && value >= 1 && value <= 365)) throw invalid();
      if (dto.day != null || dto.resets_at != null) {
        const parts = typeof dto.day === 'string' ? /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dto.day) : null;
        if (!parts || typeof dto.resets_at !== 'string') throw invalid();
        const [year, month, day] = parts.slice(1).map(Number);
        const at = new Date(Date.UTC(year, month, day));
        if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month || at.getUTCDate() !== day || Date.parse(dto.resets_at) !== Date.UTC(year, month, day + 1) - 9 * 3600000) throw invalid();
      }
    }
    const cards: DailyCard[] = dto.cards.map((c) => ({
      card: CardMapper.toDomain(c),
      // 모르는 값은 '새로 배우는 것'으로 본다 — 복습이라고 잘못 말하면
      // 사용자는 배운 적 없는 문제를 "또 나왔다"고 여긴다.
      kind: c.kind === 'REVIEW' ? 'review' : 'new',
      done: c.done === true,
      recommendReason: c.recommend_reason,
      recommendScore: c.recommend_score,
    }));
    if (new Set(cards.map(c => c.card.id)).size !== cards.length) throw new ApiError(502, '오늘의 학습에 중복 카드가 있습니다', 'server');
    // Install policy only after the entire deck has passed validation.
    setPersonalReviewPolicy(dto.personalized === true && dto.review_policy ? dto.review_policy : null);
    return {
      day: dto.day ?? dateKey(new Date()),
      difficulty: DIFFICULTY[(dto.difficulty_cd ?? '').toUpperCase()] ?? 'easy',
      // 목표를 못 받았으면 실제 배정 수를 목표로 삼는다 — 0 을 그대로 쓰면
      // 화면이 "0/0" 을 그리며 오늘 할 일이 없는 것처럼 보인다.
      targetCount: dto.target_count && dto.target_count > 0 ? dto.target_count : cards.length,
      cards,
      doneCount: dto.done_count ?? cards.filter((c) => c.done).length,
    };
  }
}
