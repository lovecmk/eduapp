import type { LearningCard, CardStatus, CardDifficulty } from '../models/LearningCard';

/** 오늘의 학습 세션(3분 분량) 조회 옵션. */
export interface TodaySessionOptions {
  /** 특정 난이도만으로 세션을 구성(미지정 시 전체 난이도). */
  difficulty?: CardDifficulty;
}

export interface ICardRepository {
  /** "3분 학습 분량"으로 구성된 오늘의 개인 세션. */
  getTodayCards(opts?: TodaySessionOptions): Promise<LearningCard[]>;
  getAllCards(): Promise<LearningCard[]>;
  markCard(id: string, status: CardStatus): Promise<LearningCard>;
}
