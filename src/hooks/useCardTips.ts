import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tipRepository } from '../data/repositories';
import type { CardTip } from '../domain/models/CardTip';
import { sortTips } from '../domain/models/CardTip';
import { useDegraded } from './useDegraded';
import { env } from '../data/network/env';
import { logger } from '../utils/logger';

export const tipsKey = (cardId: string) => ['tips', cardId] as const;

/**
 * 카드별 현장 팁 — 서버(`/inner/api/v1/cards/:id/tips`)가 열리면 자동으로 공유된다.
 * 그 전(실서버 모드)에는 이 기기 안에서만 돌고 `localOnly` 가 참이다.
 */
export function useCardTips(cardId: string) {
  const qc = useQueryClient();
  const key = tipsKey(cardId);
  const query = useQuery({ queryKey: key, queryFn: () => tipRepository.list(cardId), staleTime: 30_000 });
  const degraded = useDegraded('tips');
  const tips = sortTips(query.data ?? []);

  const patch = (fn: (list: CardTip[]) => CardTip[]) => {
    const prev = qc.getQueryData<CardTip[]>(key) ?? [];
    qc.setQueryData<CardTip[]>(key, fn(prev));
    return () => qc.setQueryData(key, prev);
  };

  const add = async (body: string): Promise<boolean> => {
    try {
      const tip = await tipRepository.add(cardId, body);
      patch((list) => [tip, ...list.filter((t) => t.id !== tip.id)]);
      return true;
    } catch (e) {
      logger.warn('tips.add_failed', { reason: String(e) });
      return false;
    }
  };

  const toggleLike = (tip: CardTip) => {
    const liked = !tip.likedByMe;
    const undo = patch((list) =>
      list.map((t) => (t.id === tip.id ? { ...t, likedByMe: liked, likes: Math.max(0, t.likes + (liked ? 1 : -1)) } : t)),
    );
    tipRepository.setLike(tip.id, liked).catch((e) => { undo(); logger.warn('tips.like_failed', { reason: String(e) }); });
  };

  const remove = (tip: CardTip) => {
    const undo = patch((list) => list.filter((t) => t.id !== tip.id));
    tipRepository.remove(tip.id).catch((e) => { undo(); logger.warn('tips.remove_failed', { reason: String(e) }); });
  };

  return { tips, isLoading: query.isLoading, localOnly: !env.useMockData && degraded, add, toggleLike, remove };
}
