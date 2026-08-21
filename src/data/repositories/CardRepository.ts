import type { ICardRepository } from '../../domain/repositories/ICardRepository';
import type { LearningCard, CardStatus } from '../../domain/models/LearningCard';
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

export class CardRepository implements ICardRepository {
  async getAllCards(): Promise<LearningCard[]> {
    const dtos = await apiClient.get<CardDTO[]>('/inner/api/v1/cards');
    return CardMapper.toDomainList(dtos);
  }

  async markCard(id: string, status: CardStatus): Promise<LearningCard> {
    const dto = await apiClient.patch<CardDTO>(`/inner/api/v1/cards/${id}`, { status_cd: STATUS_TO_CD[status] });
    return CardMapper.toDomain(dto);
  }

  /** 문제 등록 — 초안을 서버 DTO 로 매핑해 순차 POST. 웹 등록 도구도 동일 body 를 쓰면 된다. */
  async createCards(drafts: CardDraft[]): Promise<LearningCard[]> {
    const created: LearningCard[] = [];
    for (const d of drafts) {
      const dto = await apiClient.post<CardDTO>('/inner/api/v1/cards', draftToDTO(d));
      created.push(CardMapper.toDomain(dto));
    }
    return created;
  }
}
