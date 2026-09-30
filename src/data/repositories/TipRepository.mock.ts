import type { ITipRepository } from '../../domain/repositories/ITipRepository';
import type { CardTip } from '../../domain/models/CardTip';
import { useTipStore } from '../../store/tipStore';
import { useAuthStore } from '../../store/authStore';
import { authorLabel, displayName } from '../../domain/models/User';
import { sanitizeText, isMeaningful, INPUT_LIMITS } from '../../utils/sanitize';
import { delay } from './_delay';

/** 현장 팁 — 이 기기 안(tipStore). 목업 모드와 서버 미배포 폴백이 쓴다. */
export class MockTipRepository implements ITipRepository {
  async list(cardId: string): Promise<CardTip[]> {
    await delay(60);
    const me = useAuthStore.getState().user;
    // 내 팁의 이름은 저장된 사본이 아니라 지금 내 표시명으로(닉네임 변경 반영).
    return useTipStore.getState().tips
      .filter((t) => t.cardId === cardId)
      .map((t) => ({ ...t, author: authorLabel(t.author, t.mine, me) }));
  }

  async add(cardId: string, body: string): Promise<CardTip> {
    await delay(80);
    const clean = sanitizeText(body, { maxLength: INPUT_LIMITS.tip, allowNewlines: true });
    if (!isMeaningful(clean)) throw new Error('내용을 입력해 주세요');
    const tip: CardTip = {
      id: `mine-${Date.now()}`,
      cardId,
      author: displayName(useAuthStore.getState().user),
      color: '#2563EB',
      body: clean,
      likes: 0,
      likedByMe: false,
      mine: true,
      minutesAgo: 0,
      createdAt: Date.now(),
    };
    useTipStore.getState().add(tip);
    return tip;
  }

  async setLike(tipId: string, liked: boolean): Promise<void> {
    await delay(30);
    useTipStore.getState().setLike(tipId, liked);
  }

  async remove(tipId: string): Promise<void> {
    await delay(30);
    useTipStore.getState().remove(tipId);
  }
}
