import { create } from 'zustand';

export interface ReminderStatus {
  state: 'checking' | 'scheduled' | 'disabled' | 'permission-denied' | 'failed' | 'unsupported';
  exact: boolean | null;
  time: string | null;
  nextAt: number | null;
}
export const useReminderStatusStore = create<ReminderStatus>(() => ({ state: 'checking', exact: null, time: null, nextAt: null }));
