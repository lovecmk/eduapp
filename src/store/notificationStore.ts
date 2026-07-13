import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Ionicons } from '@expo/vector-icons';

export type NotificationType = 'new' | 'remind' | 'achievement' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  desc: string;
  /** 발생 후 경과 분 — 상대 시간/그룹핑의 기준(고정값이라 라벨이 안정적). */
  minutesAgo: number;
  read: boolean;
  category?: string;
}

type IconName = keyof typeof Ionicons.glyphMap;

/** 알림 종류별 메타 — 아이콘/색/설명. 스마트 on/off UX 에서 종류를 설명할 때 사용. */
export const NOTIFICATION_TYPE_META: Record<
  NotificationType,
  { label: string; icon: IconName; color: string; desc: string }
> = {
  remind: { label: '학습 리마인더', icon: 'alarm', color: '#2563EB', desc: '매일 학습·복습 시간 안내' },
  new: { label: '새 컨텐츠', icon: 'sparkles', color: '#7E57C2', desc: '새로 추가된 점검 학습 카드' },
  achievement: { label: '성취·보상', icon: 'trophy', color: '#F2B705', desc: '연속 학습·목표 달성 축하' },
  system: { label: '공지·시스템', icon: 'megaphone', color: '#26A69A', desc: '업데이트·점검 등 서비스 공지' },
};

function seedNotifications(): AppNotification[] {
  return [
    { id: 'n1', type: 'remind', title: '지금 복습할 카드 5장이 있어요', desc: '망각곡선 기준 복습 시점이 도래했습니다. 3분이면 충분해요.', minutesAgo: 8, read: false, category: '복습' },
    { id: 'n2', type: 'new', title: '새 학습 컨텐츠가 추가되었어요', desc: '공정 위험 > 도장 공정 시리즈를 확인해보세요.', minutesAgo: 45, read: false, category: '공정 위험' },
    { id: 'n3', type: 'achievement', title: '연속 학습 7일 달성! 🔥', desc: '일주일 동안 꾸준히 학습하셨어요. 축하합니다!', minutesAgo: 180, read: false, category: '성취' },
    { id: 'n4', type: 'remind', title: '전기 위험 복습 리마인드', desc: '절연파괴·누전 카드의 복습 주기가 도래했습니다.', minutesAgo: 320, read: false, category: '전기 위험' },
    { id: 'n5', type: 'new', title: '위험물 학습 카드 확장', desc: '마그네슘 분진·소화 등 카드가 새로 추가되었습니다.', minutesAgo: 26 * 60, read: false, category: '위험물' },
    { id: 'n6', type: 'system', title: '현장학습 v1.2 업데이트', desc: '간격 반복 복습과 학습 캘린더가 추가되었어요.', minutesAgo: 30 * 60, read: true, category: '공지' },
    { id: 'n7', type: 'achievement', title: '누적 100개 카드 완료 🏅', desc: '점검 실무 지식 100개를 학습하셨습니다.', minutesAgo: 52 * 60, read: true, category: '성취' },
    { id: 'n8', type: 'remind', title: '취약 주제 복습 권장', desc: '공정 위험 > 위험장소 카드의 정답률이 낮습니다. 복습을 권장해요.', minutesAgo: 74 * 60, read: true, category: '공정 위험' },
    { id: 'n9', type: 'new', title: '전기 화재 기초 컨텐츠', desc: '절연파괴·접촉불량 카드가 추가되었습니다.', minutesAgo: 5 * 1440, read: true, category: '전기 위험' },
    { id: 'n10', type: 'system', title: '데이터 백업 완료', desc: '학습 진행 상황이 안전하게 백업되었습니다.', minutesAgo: 8 * 1440, read: true, category: '공지' },
  ];
}

interface NotificationState {
  items: AppNotification[];
  /** 종류별 알림 끄기 상태 — 스마트 on/off. */
  mutedTypes: Record<NotificationType, boolean>;

  unreadCount: () => number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  remove: (id: string) => void;
  clearAll: () => void;
  toggleMute: (type: NotificationType) => void;
  setMute: (type: NotificationType, muted: boolean) => void;
  refresh: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      items: seedNotifications(),
      mutedTypes: { new: false, remind: false, achievement: false, system: false },

      unreadCount: () => get().items.filter((n) => !n.read && !get().mutedTypes[n.type]).length,
      markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
      markRead: (id) => set((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      remove: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
      clearAll: () => set({ items: [] }),
      toggleMute: (type) => set((s) => ({ mutedTypes: { ...s.mutedTypes, [type]: !s.mutedTypes[type] } })),
      setMute: (type, muted) => set((s) => ({ mutedTypes: { ...s.mutedTypes, [type]: muted } })),
      refresh: () => set({ items: seedNotifications() }),
    }),
    {
      name: 'notifications',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      // 알림 항목은 목업이므로 사용자 선호(mutedTypes)만 영속화.
      partialize: (s) => ({ mutedTypes: s.mutedTypes }),
    },
  ),
);

/** 상대 시간 라벨. */
export function timeAgoLabel(minutesAgo: number): string {
  if (minutesAgo < 1) return '방금';
  if (minutesAgo < 60) return `${minutesAgo}분 전`;
  if (minutesAgo < 1440) return `${Math.floor(minutesAgo / 60)}시간 전`;
  if (minutesAgo < 2880) return '어제';
  return `${Math.floor(minutesAgo / 1440)}일 전`;
}

export type TimeGroup = '오늘' | '이번 주' | '이전';
export function timeGroup(minutesAgo: number): TimeGroup {
  if (minutesAgo < 1440) return '오늘';
  if (minutesAgo < 10080) return '이번 주';
  return '이전';
}
