import type { ILearningQuotaRepository } from '../../domain/repositories/ILearningQuotaRepository';
import type { LearningQuota } from '../../domain/models/LearningQuota';
import { DAILY_NEW_LIMIT } from '../../constants/learning';
import { apiClient } from '../network/ApiClient';
import { useDailyLearningStore } from '../../store/dailyLearningStore';
import { dateKey } from '../../utils/dateKey';
import { isEndpointUnavailable } from './_fallback';

interface QuotaDTO {
  limit?: number;
  used?: number;
  resets_at?: string;
}

/**
 * 실서버 하루 학습 할당량 저장소.
 *  · getQuota()       → GET  /api/learning/quota
 *  · recordCompletion → POST /api/learning/complete
 *
 * 서버가 오늘 학습 수의 권위를 갖는다. 로컬 스토어도 함께 갱신해 오프라인/즉시 UI에
 * 일관성을 유지한다.
 */
export class LearningQuotaRepository implements ILearningQuotaRepository {
  async getQuota(): Promise<LearningQuota> {
    const dto = await apiClient.get<QuotaDTO>('/api/learning/quota');
    const limit = dto.limit ?? DAILY_NEW_LIMIT;
    const used = dto.used ?? 0;
    return {
      limit,
      used,
      remaining: Math.max(0, limit - used),
      resetsAt: dto.resets_at ?? new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
    };
  }

  async recordCompletion(count: number): Promise<void> {
    // 로컬을 먼저 반영(즉시 UI), 서버 보고는 뒤따른다.
    useDailyLearningStore.getState().recordNewLearned(count);
    try {
      // 사용자가 '이미 학습을 마쳤다'고 믿는 사건이다. 평범한 post 로 보내면
      // 오프라인일 때 로컬 카운트만 오르고 **서버 기록은 조용히 사라진다** —
      // 로컬 상한은 찼는데 서버 상한은 그대로라 다음 동기화에서 숫자가 어긋난다.
      // 유실 방지가 존재 이유인 오프라인 큐(postDurable)로 보낸다.
      // 멱등키에 날짜와 시각을 담아, 큐가 재전송해도 이중 집계되지 않게 한다.
      const key = `learning-complete:${dateKey(new Date())}:${Date.now()}:${count}`;
      await apiClient.postDurable('/api/learning/complete', { count }, key);
    } catch (e) {
      // 완료 보고 엔드포인트가 아직 서버에 없으면(부분 배포) 조용히 넘어간다 —
      // 로컬은 이미 반영됐고 목업 폴백과 결과가 같으므로 여기서 다시 목업을 태우면
      // 오히려 이중 집계가 된다. 그 외(진짜) 오류는 그대로 던진다.
      if (!isEndpointUnavailable(e)) throw e;
    }
  }
}
