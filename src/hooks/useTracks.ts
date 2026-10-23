import { useMemo } from 'react';
import { useAllCards } from './useCards';
import { buildTrackProgress } from '../domain/learningTracks';
export type { TrackProgress } from '../domain/learningTracks';

export function useTracks() {
  const { data: allCards = [], isLoading, error, refetch } = useAllCards();

  const tracks = useMemo(() => buildTrackProgress(allCards), [allCards]);

  return { tracks, allCards, isLoading, error, refetch };
}
