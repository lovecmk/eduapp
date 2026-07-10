import { create } from 'zustand';
import type { LearningCard, CardStatus } from '../domain/models/LearningCard';
import { cardRepository } from '../data/repositories';

const pendingOps = new Map<string, number>();
let opCounter = 0;

interface CardState {
  entities: Record<string, LearningCard>;
  todayIds: string[];
  allIds: string[];
  loading: boolean;
  error: string | null;

  selectCard: (id: string) => LearningCard | undefined;
  fetchToday: () => Promise<void>;
  fetchAll: () => Promise<void>;
  markCard: (id: string, status: CardStatus) => Promise<void>;
  reset: () => void;
}

export const useCardStore = create<CardState>((set, get) => ({
  entities: {},
  todayIds: [],
  allIds: [],
  loading: false,
  error: null,

  selectCard: (id) => get().entities[id],

  fetchToday: async () => {
    set({ loading: true, error: null });
    try {
      const cards = await cardRepository.getTodayCards();
      const entities = Object.fromEntries(cards.map((c) => [c.id, c]));
      set((s) => ({
        entities: { ...s.entities, ...entities },
        todayIds: cards.map((c) => c.id),
        loading: false,
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '불러오기 실패', loading: false });
    }
  },

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const cards = await cardRepository.getAllCards();
      const entities = Object.fromEntries(cards.map((c) => [c.id, c]));
      set((s) => ({
        entities: { ...s.entities, ...entities },
        allIds: cards.map((c) => c.id),
        loading: false,
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '불러오기 실패', loading: false });
    }
  },

  markCard: async (id, status) => {
    const opId = ++opCounter;
    pendingOps.set(id, opId);

    const prev = get().entities[id];
    if (prev) {
      set((s) => ({ entities: { ...s.entities, [id]: { ...prev, status } } }));
    }

    try {
      const updated = await cardRepository.markCard(id, status);
      if (pendingOps.get(id) !== opId) return;
      set((s) => ({ entities: { ...s.entities, [id]: updated } }));
    } catch {
      if (pendingOps.get(id) !== opId) return;
      if (prev) set((s) => ({ entities: { ...s.entities, [id]: prev } }));
    } finally {
      if (pendingOps.get(id) === opId) pendingOps.delete(id);
    }
  },

  reset: () => {
    pendingOps.clear();
    set({ entities: {}, todayIds: [], allIds: [], loading: false, error: null });
  },
}));