import type { CardTip } from '../models/CardTip';

/** 카드별 현장 팁 저장소 — 서버 `/inner/api/v1/cards/:id/tips`(미배포 → 이 기기 안 폴백). */
export interface ITipRepository {
  list(cardId: string): Promise<CardTip[]>;
  add(cardId: string, body: string): Promise<CardTip>;
  /** 공감 상태 설정(토글 아님). */
  setLike(tipId: string, liked: boolean): Promise<void>;
  /** 내 팁 삭제. */
  remove(tipId: string): Promise<void>;
}
