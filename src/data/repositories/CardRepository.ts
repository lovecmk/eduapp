import type { ICardRepository } from '../../domain/repositories/ICardRepository';
import type { LearningCard, CardStatus } from '../../domain/models/LearningCard';
import type { CardDTO } from '../dto/CardDTO';
import { CardMapper } from '../mappers/CardMapper';
import { apiClient } from '../network/ApiClient';

const STATUS_TO_CD: Record<CardStatus, string> = {
  new: 'NEW',
  learning: 'LEARNING',
  mastered: 'MASTERED',
};

export class CardRepository implements ICardRepository {
  async getTodayCards(): Promise<LearningCard[]> {
    const dtos = await apiClient.get<CardDTO[]>('/api/cards/today');
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
}
