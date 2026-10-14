import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Ionicons } from '@expo/vector-icons';

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
interface NotificationState {
  items: AppNotification[];
  /** 종류별 알림 끄기 상태 — 스마트 on/off. */
  mutedTypes: Record<NotificationType, boolean>;
  /**
   * 사용자가 지운 알림 id — 서버 목록을 받아도 다시 보이지 않게 한다.
   *
   * 서버 계약(docs/API_CONTRACT §6-4)에는 알림 삭제가 없다. 그래서 예전에는 '이 알림
   * 삭제'·'전체 삭제'가 기기 목록에서만 지웠고, 1분 뒤 동기화(applyServer)가 서버
   * 목록으로 갈아 끼우면서 **지운 알림이 전부 되살아났다.** 삭제는 이 사람의 선택이라
   * 이 기기에 기억해 두고 받을 때마다 걸러 낸다(주인이 바뀌면 sessionScope 가 비운다).
   */
  dismissedIds: string[];

  unreadCount: () => number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  remove: (id: string) => void;
  clearAll: () => void;
  /** 사용자 전환·전체 초기화 — 목록과 지운 기록까지 처음 상태로. */
  reset: () => void;
  toggleMute: (type: NotificationType) => void;
  setMute: (type: NotificationType, muted: boolean) => void;
  /**
   * 서버가 보관한 알림으로 목록을 **교체한다.**
   *
   * 합치지 않고 갈아 끼우는 이유 — 알림은 서버가 만들고 서버가 읽음을 기록한다
   * (관리 콘솔의 공지 발송이 유일한 생산자다). 로컬과 합치면 지운 알림이
   * 되살아나고, 읽음 상태가 기기마다 갈린다.
   */
  applyServer: (items: AppNotification[]) => void;
}

/** 지운 알림 기록은 최근 것만 남긴다 — 서버가 오래된 알림을 계속 돌려줄 리 없고, 끝없이 쌓이면 안 된다. */
const DISMISSED_LIMIT = 300;
function rememberDismissed(prev: string[], ids: string[]): string[] {
  if (ids.length === 0) return prev;
  const merged = [...prev.filter((id) => !ids.includes(id)), ...ids];
  return merged.slice(-DISMISSED_LIMIT);
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
      items: [],
      // 복습 주기(remind)·새 콘텐츠(new)는 기본적으로 보내지 않는다(사용자 설정에서도 노출 안 함).
      mutedTypes: { new: true, remind: true, achievement: false, system: false },
      dismissedIds: [],

      unreadCount: () => get().items.filter((n) => !n.read && !get().mutedTypes[n.type]).length,
      markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
      markRead: (id) => set((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      remove: (id) =>
        set((s) => ({
          items: s.items.filter((n) => n.id !== id),
          dismissedIds: rememberDismissed(s.dismissedIds, [id]),
        })),
      clearAll: () =>
        set((s) => ({
          items: [],
          dismissedIds: rememberDismissed(s.dismissedIds, s.items.map((n) => n.id)),
        })),
      reset: () => set({ items: [], dismissedIds: [] }),
      toggleMute: (type) => set((s) => ({ mutedTypes: { ...s.mutedTypes, [type]: !s.mutedTypes[type] } })),
      setMute: (type, muted) => set((s) => ({ mutedTypes: { ...s.mutedTypes, [type]: muted } })),
      // 지운 알림은 받아도 다시 보이지 않는다(dismissedIds 주석 참고).
      applyServer: (items) =>
        set((s) => {
          const gone = new Set(s.dismissedIds);
          return { items: gone.size ? items.filter((n) => !gone.has(n.id)) : items };
        }),
    }),
    {
      name: 'notifications',
      // v4: 실서버 모드에서 시드 알림을 걷어낸다(위 items 주석 참고).
      // dismissedIds 는 필드 추가라 버전을 올리지 않는다 — 이 스토어에는 migrate 가 없어서
      // 버전을 올리는 순간 저장된 값(알림 끄기 선택)이 통째로 버려진다. 없는 필드는
      // persist 의 병합이 초기값([])으로 채운다.
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      // 목록은 서버가 원천이라 남기지 않는다. 사용자의 선택(끄기·지우기)만 남긴다.
      partialize: (s) => ({ mutedTypes: s.mutedTypes, dismissedIds: s.dismissedIds }),
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
