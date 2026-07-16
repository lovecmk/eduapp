import type { ICardRepository, TodaySessionOptions } from '../../domain/repositories/ICardRepository';
import type { LearningCard, CardStatus, CardDifficulty } from '../../domain/models/LearningCard';
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
}
