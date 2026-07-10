import type { LearningCard, CardStatus } from '../models/LearningCard';

export interface ICardRepository {
  getTodayCards(): Promise<LearningCard[]>;
  getAllCards(): Promise<LearningCard[]>;
  markCard(id: string, status: CardStatus): Promise<LearningCard>;
}
