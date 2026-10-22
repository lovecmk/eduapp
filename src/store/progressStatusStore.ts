import { create } from 'zustand';
export const useProgressStatusStore = create<{ userId: string | null; settled: boolean }>(() => ({ userId: null, settled: false }));
