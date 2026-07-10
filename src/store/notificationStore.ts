import { create } from 'zustand';

export type NotificationType = 'new' | 'remind' | 'achievement' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  desc: string;
  time: string;
  read: boolean;
}

const MOCK_NOTIFICATIONS: AppNotification[] = [
  { id: '1', type: 'new', title: '새 학습 컨텐츠가 추가되었어요', desc: '전기 안전 작업 3종 시리즈를 확인해보세요.', time: '5분 전', read: false },
  { id: '2', type: 'remind', title: '복습 알림', desc: '어제 학습한 "감전사고 예방" 카드를 복습할 시간입니다.', time: '1시간 전', read: false },
  { id: '3', type: 'achievement', title: '연속 학습 7일 달성!', desc: '일주일 동안 꾸준히 학습하셨습니다. 축하합니다!', time: '3시간 전', read: false },
  { id: '4', type: 'new', title: '화학물질 취급 안전 업데이트', desc: 'MSDS 개정사항이 반영된 카드 2개가 추가되었습니다.', time: '어제', read: false },
  { id: '5', type: 'remind', title: '취약 주제 복습 권장', desc: '추락 사고 관련 카드의 정답률이 60% 미만입니다. 복습을 권장합니다.', time: '어제', read: false },
  { id: '6', type: 'system', title: '현장학습 앱 업데이트 v1.2', desc: '새로운 기능과 개선사항을 확인해보세요.', time: '2일 전', read: false },
  { id: '7', type: 'new', title: '기계 안전 컨텐츠 확장', desc: '프레스기, 절단기 등 5개 카드가 새로 추가되었습니다.', time: '3일 전', read: true },
  { id: '8', type: 'achievement', title: '100개 카드 완료', desc: '누적 100개의 학습카드를 완료하셨습니다.', time: '5일 전', read: true },
  { id: '9', type: 'remind', title: '소방 훈련 학습 리마인드', desc: '소화기 사용법 카드의 복습 주기가 도래했습니다.', time: '1주일 전', read: true },
  { id: '10', type: 'system', title: '데이터 백업 완료', desc: '학습 진행 상황이 안전하게 백업되었습니다.', time: '1주일 전', read: true },
];

interface NotificationState {
  items: AppNotification[];
  unreadCount: () => number;
  markAllRead: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: MOCK_NOTIFICATIONS,
  unreadCount: () => get().items.filter((n) => !n.read).length,
  markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
}));
