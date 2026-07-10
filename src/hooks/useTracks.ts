import { useMemo } from 'react';
import { useAllCards } from './useCards';
import { LEARNING_TRACKS } from '../constants/tracks';
import type { LearningTrack } from '../domain/models/LearningTrack';
import type { LearningCard, CardDifficulty } from '../domain/models/LearningCard';

export interface TrackProgress {
  track: LearningTrack;
  cards: LearningCard[];
  total: number;
  mastered: number;
  pct: number;
  byDifficulty: Record<CardDifficulty, LearningCard[]>;
}

function group(cards: LearningCard[]): Record<CardDifficulty, LearningCard[]> {
  const g: Record<CardDifficulty, LearningCard[]> = { easy: [], medium: [], hard: [] };
  for (const c of cards) g[c.difficulty].push(c);
  return g;
}

export function useTracks() {
  const { data: allCards = [], isLoading, error, refetch } = useAllCards();

  const tracks = useMemo<TrackProgress[]>(
    () =>
      LEARNING_TRACKS.map((track) => {
        const cards = allCards.filter((c) => track.categories.includes(c.category));
        const mastered = cards.filter((c) => c.status === 'mastered').length;
        const total = cards.length;
        return {
          track,
          cards,
          total,
          mastered,
          pct: total ? Math.round((mastered / total) * 100) : 0,
          byDifficulty: group(cards),
        };
      }),
    [allCards],
  );

  return { tracks, allCards, isLoading, error, refetch };
}
