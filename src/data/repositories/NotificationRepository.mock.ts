import type { INotificationRepository } from '../../domain/repositories/INotificationRepository';
import type { AppNotification } from '../../domain/models/Notification';
import { useNotificationStore } from '../../store/notificationStore';
import { delay } from './_delay';

/** 목업 알림 저장소 — 로컬 스토어의 목록을 그대로 돌려준다. */
export class MockNotificationRepository implements INotificationRepository {
  async list(): Promise<AppNotification[]> {
    await delay(150);
    return useNotificationStore.getState().items;
  }

  async markRead(id: string): Promise<void> {
    await delay(40);
    useNotificationStore.getState().markRead(id);
  }

  async markAllRead(): Promise<void> {
    await delay(60);
    useNotificationStore.getState().markAllRead();
  }

  async registerPushToken(_token: string, _platform: string): Promise<void> {
    await delay(40); // 목업에서는 등록할 서버가 없다.
  }
}
