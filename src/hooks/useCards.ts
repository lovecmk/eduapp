import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cardRepository } from '../data/repositories';
import type { LearningCard, CardStatus } from '../domain/models/LearningCard';
import type { CardDraft } from '../domain/models/CardDraft';

const CARDS_KEY = 'cards';

export function useAllCards() {
  return useQuery({
    queryKey: [CARDS_KEY],
    queryFn: () => cardRepository.getAllCards(),
    staleTime: 30_000,
  });
}

export function useCreateCards() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (drafts: CardDraft[]) => cardRepository.createCards(drafts),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [CARDS_KEY] });
    },
  });
}

export function useMarkCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CardStatus }) =>
      cardRepository.markCard(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: [CARDS_KEY] });
      const prev = queryClient.getQueryData<LearningCard[]>([CARDS_KEY]);
      if (prev) {
        queryClient.setQueryData<LearningCard[]>([CARDS_KEY], (old) =>
          old?.map((c) => (c.id === id ? { ...c, status } : c))
        );
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData([CARDS_KEY], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [CARDS_KEY] });
    },
  });
}
