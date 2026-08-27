import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Ionicons } from '@expo/vector-icons';
import { env } from '../data/network/env';

// 모델은 domain 으로 옮겨 서버 저장소(INotificationRepository)와 공유한다.
export type { NotificationType, AppNotification } from '../domain/models/Notification';
import type { NotificationType, AppNotification } from '../domain/models/Notification';

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

// 알림은 '꼭 필요한 것'만 — 성취(축하)와 공지(시스템)만 보낸다.
// 복습 주기 알림(remind)·새 콘텐츠 알림(new)은 제외한다:
//  · 복습은 '오늘의 학습'에서 자동으로 이어 제시하므로 별도 알림이 불필요.
//  · 새 콘텐츠 안내는 소음이 되기 쉬워 제외.
// 성취 기준: 연속 학습 5일(주말 제외), 누적 카드 50개 단위(50·100·150…).
function seedNotifications(): AppNotification[] {
  return [
    { id: 'n3', type: 'achievement', title: '연속 학습 5일 달성! 🔥', desc: '평일 5일 동안 꾸준히 학습하셨어요. 축하합니다!', minutesAgo: 180, read: false, category: '성취' },
    { id: 'n7', type: 'achievement', title: '누적 50개 카드 완료 🏅', desc: '점검 실무 지식 50개를 학습하셨습니다.', minutesAgo: 52 * 60, read: true, category: '성취' },
    { id: 'n6', type: 'system', title: '하루3분ON 업데이트', desc: '간격 반복 복습과 학습 캘린더가 추가되었어요.', minutesAgo: 30 * 60, read: true, category: '공지' },
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
  /**
   * 서버가 보관한 알림으로 목록을 **교체한다.**
   *
   * 합치지 않고 갈아 끼우는 이유 — 알림은 서버가 만들고 서버가 읽음을 기록한다
   * (관리 콘솔의 공지 발송이 유일한 생산자다). 로컬과 합치면 지운 알림이
   * 되살아나고, 읽음 상태가 기기마다 갈린다.
   */
  applyServer: (items: AppNotification[]) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      // 실서버 모드에서는 빈 목록으로 시작한다.
      //
      // 예전에는 여기에 시드 4건("연속 학습 5일 달성! 🔥", "하루3분ON 업데이트" …)이
      // 늘 들어 있었다. 그 알림들은 아무 근거 없이 만들어진 문구였고, 사용자는
      // 자기가 5일 연속 학습했다고 읽었다. 서버가 보낸 알림을 받아오는 경로
      // (useNotificationSync)가 붙기 전까지 그 자리를 채우려던 것인데,
      // 그 경로가 없는 동안 화면은 계속 지어낸 값을 보여 주고 있었다.
      items: env.useMockData ? seedNotifications() : [],
      // 복습 주기(remind)·새 콘텐츠(new)는 기본적으로 보내지 않는다(사용자 설정에서도 노출 안 함).
      mutedTypes: { new: true, remind: true, achievement: false, system: false },

      unreadCount: () => get().items.filter((n) => !n.read && !get().mutedTypes[n.type]).length,
      markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
      markRead: (id) => set((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      remove: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
      clearAll: () => set({ items: [] }),
      toggleMute: (type) => set((s) => ({ mutedTypes: { ...s.mutedTypes, [type]: !s.mutedTypes[type] } })),
      setMute: (type, muted) => set((s) => ({ mutedTypes: { ...s.mutedTypes, [type]: muted } })),
      refresh: () => set({ items: seedNotifications() }),
      applyServer: (items) => set({ items }),
    }),
    {
      name: 'notifications',
      // v4: 실서버 모드에서 시드 알림을 걷어낸다(위 items 주석 참고).
      version: 4,
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
