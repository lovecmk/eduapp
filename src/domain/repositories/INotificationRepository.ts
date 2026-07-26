import type { AppNotification } from '../models/Notification';

/**
 * 알림 — 서버가 보낸 공지·리마인더·성취 알림을 받아오고 읽음 상태를 되돌려준다.
 * (로컬에만 두면 기기마다 읽음 상태가 달라지고, 서버 공지를 받을 수 없다.)
 */
export interface INotificationRepository {
  /** 알림 목록을 최신순으로 가져온다. */
  list(): Promise<AppNotification[]>;
  /** 특정 알림을 읽음 처리한다. */
  markRead(id: string): Promise<void>;
  /** 전부 읽음 처리한다. */
  markAllRead(): Promise<void>;
  /** 푸시 토큰을 등록/갱신한다(기기 교체·재설치 대응). */
  registerPushToken(token: string, platform: string): Promise<void>;
}
