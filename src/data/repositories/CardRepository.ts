import type { ICardRepository, TodaySessionOptions } from '../../domain/repositories/ICardRepository';
import type { LearningCard, CardStatus, CardDifficulty } from '../../domain/models/LearningCard';
import type { CardDraft } from '../../domain/models/CardDraft';
import { draftToDTO } from '../../domain/models/CardDraft';
import type { CardDTO } from '../dto/CardDTO';
import { CardMapper } from '../mappers/CardMapper';
import { apiClient } from '../network/ApiClient';

const STATUS_TO_CD: Record<CardStatus, string> = {
  new: 'NEW',
  learning: 'LEARNING',
  mastered: 'MASTERED',
};

const DIFFICULTY_TO_CD: Record<CardDifficulty, string> = {
  easy: 'EASY',
  medium: 'MEDIUM',
  hard: 'HARD',
};

export class CardRepository implements ICardRepository {
  async getTodayCards(opts?: TodaySessionOptions): Promise<LearningCard[]> {
    // 세션 구성(3분 분량 패킹·난이도 규칙)은 서버가 담당한다. 여기선 옵션만 전달.
    const query = opts?.difficulty ? `?difficulty=${DIFFICULTY_TO_CD[opts.difficulty]}` : '';
    const dtos = await apiClient.get<CardDTO[]>(`/api/cards/today${query}`);
    return CardMapper.toDomainList(dtos);
  }

  async getAllCards(): Promise<LearningCard[]> {
    const dtos = await apiClient.get<CardDTO[]>('/api/cards');
    return CardMapper.toDomainList(dtos);
  }

  async markCard(id: string, status: CardStatus): Promise<LearningCard> {
    const dto = await apiClient.patch<CardDTO>(`/api/cards/${id}`, { status_cd: STATUS_TO_CD[status] });
    return CardMapper.toDomain(dto);
  }

  /** 문제 등록 — 초안을 서버 DTO 로 매핑해 순차 POST. 웹 등록 도구도 동일 body 를 쓰면 된다. */
  async createCards(drafts: CardDraft[]): Promise<LearningCard[]> {
    const created: LearningCard[] = [];
    for (const d of drafts) {
      const dto = await apiClient.post<CardDTO>('/api/cards', draftToDTO(d));
      created.push(CardMapper.toDomain(dto));
    }
    return created;
  }
}
