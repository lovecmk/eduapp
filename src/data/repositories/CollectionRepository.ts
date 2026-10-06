import type { ICollectionRepository } from '../../domain/repositories/ICollectionRepository';
import type { CollectionSnapshot } from '../../domain/models/Collection';
import { apiClient } from '../network/ApiClient';
import { toApiError } from '../network/errors';

/** 서버가 주고받는 도감 표현(snake_case). */
interface CollectionDTO {
  rooftop_packs?: number;
  rooftop_shards?: number;
  owned?: Record<string, number>;
  packs_earned?: number;
  packs_opened?: number;
  shards_earned?: number;
  shards_spent?: number;
  study_total?: number;
  claimed_rules?: Record<string, number>;
  redeemed_codes?: string[];
  last_daily_pack?: string;
  since_epic?: number;
  since_legendary?: number;
}

function toDomain(dto: CollectionDTO): CollectionSnapshot {
  return {
    owned: dto.owned ?? {},
    ...(typeof dto.rooftop_packs === 'number' ? { rooftopPacks: dto.rooftop_packs } : {}),
    ...(typeof dto.rooftop_shards === 'number' ? { rooftopShards: dto.rooftop_shards } : {}),
    packsEarned: dto.packs_earned ?? 0,
    packsOpened: dto.packs_opened ?? 0,
    shardsEarned: dto.shards_earned ?? 0,
    shardsSpent: dto.shards_spent ?? 0,
    studyTotal: dto.study_total ?? 0,
    claimedRules: dto.claimed_rules ?? {},
    redeemedCodes: dto.redeemed_codes ?? [],
    lastDailyPack: dto.last_daily_pack ?? '',
    sinceEpic: dto.since_epic ?? 0,
    sinceLegendary: dto.since_legendary ?? 0,
  };
}

function toDTO(s: CollectionSnapshot): CollectionDTO {
  return {
    owned: s.owned,
    packs_earned: s.packsEarned,
    packs_opened: s.packsOpened,
    shards_earned: s.shardsEarned,
    shards_spent: s.shardsSpent,
    study_total: s.studyTotal,
    claimed_rules: s.claimedRules,
    redeemed_codes: s.redeemedCodes,
    last_daily_pack: s.lastDailyPack,
    since_epic: s.sinceEpic,
    since_legendary: s.sinceLegendary,
  };
}

/**
 * 실서버 도감 저장소.
 *  · pull() → GET  /inner/api/v1/collection
 *  · sync() → POST /inner/api/v1/collection/sync
 */
export class CollectionRepository implements ICollectionRepository {
  async pull(): Promise<CollectionSnapshot> {
    return toDomain(await apiClient.get<CollectionDTO>('/inner/api/v1/collection'));
  }

  async sync(local: CollectionSnapshot): Promise<CollectionSnapshot> {
    const body = toDTO(local);
    try {
      // 먼저 평범한 post — **병합 결과를 받아야** 여러 기기가 같은 값에 수렴한다.
      // postDurable 은 성공/큐잉만 알려주고 응답 본문을 주지 않아 여기서는 못 쓴다.
      return toDomain(await apiClient.post<CollectionDTO>('/inner/api/v1/collection/sync', body));
    } catch (e) {
      const err = toApiError(e);
      // 서버가 거절한 것(4xx)이라면 큐에 담아도 영원히 실패한다 — 그대로 던진다.
      if (!err.retryable) throw err;
      // 닿지 못한 것뿐이다. 사용자가 이미 '얻었다'고 믿는 결과물이라 조용히
      // 사라지게 두지 않고 오프라인 큐에 맡긴다.
      //
      // 멱등키는 보내는 내용에서 만든다 — 같은 상태를 두 번 보내면 같은 키가 되어
      // 큐가 재전송해도 서버가 한 번만 처리한다(병합 자체도 멱등이라 두 겹이다).
      const key = `collection-sync:${local.packsEarned}:${local.packsOpened}:${local.shardsEarned}:${local.shardsSpent}:${local.studyTotal}`;
      await apiClient.postDurable('/inner/api/v1/collection/sync', body, key);
      // 큐에 담긴 요청의 응답은 받을 수 없다. 보낸 값을 그대로 쓰고, 병합 결과는
      // 다음 pull 에서 맞춘다(모든 값이 단조 증가라 늦게 맞춰도 손실이 없다).
      return local;
    }
  }
}
