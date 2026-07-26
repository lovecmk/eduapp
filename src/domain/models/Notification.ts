// 알림 도메인 모델 — 서버 연동(INotificationRepository)과 로컬 스토어가 공유한다.
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
