import type { INotificationRepository } from '../../domain/repositories/INotificationRepository';
import type { AppNotification, NotificationType } from '../../domain/models/Notification';
import { apiClient } from '../network/ApiClient';
import { parseDate } from '../mappers/_date';

interface NotificationDTO {
  id: string;
  type_cd?: string;
  title_txt?: string;
  desc_txt?: string;
  created_at?: string;
  read_yn?: boolean;
  category_nm?: string;
}

const TYPE_MAP: Record<string, NotificationType> = {
  NEW: 'new',
  REMIND: 'remind',
  ACHIEVEMENT: 'achievement',
  SYSTEM: 'system',
};

/** 생성 시각(ISO) → '몇 분 전' — 앱은 상대 시간으로 표시한다. */
function minutesSince(iso: string | undefined, now: number): number {
  const d = parseDate(iso ?? null);
  if (!d) return 0;
  return Math.max(0, Math.round((now - d.getTime()) / 60_000));
}

/**
 * 알림 저장소(실서버).
 *  · GET  /api/notifications           → 목록
 *  · POST /api/notifications/:id/read  → 읽음
 *  · POST /api/notifications/read-all  → 전체 읽음
 *  · POST /api/push/register           → 푸시 토큰 등록
 */
export class NotificationRepository implements INotificationRepository {
  async list(): Promise<AppNotification[]> {
    const dtos = await apiClient.get<NotificationDTO[]>('/api/notifications');
    const now = Date.now();
    // 배열이 아닌 응답(서버 오류·프록시 HTML 등)에도 화면이 깨지지 않게 방어한다.
    if (!Array.isArray(dtos)) return [];
    return dtos.map((d) => ({
      id: String(d.id),
      type: TYPE_MAP[d.type_cd ?? ''] ?? 'system',
      title: d.title_txt?.trim() ?? '',
      desc: d.desc_txt?.trim() ?? '',
      minutesAgo: minutesSince(d.created_at, now),
      read: d.read_yn === true,
      category: d.category_nm?.trim() || undefined,
    }));
  }

  async markRead(id: string): Promise<void> {
    await apiClient.postDurable(`/api/notifications/${encodeURIComponent(id)}/read`, {}, `notif-read:${id}`);
  }

  async markAllRead(): Promise<void> {
    // 전체 읽음은 '지금 시각'까지의 상태라 멱등키에 날짜를 넣어 하루 단위로 묶는다.
    await apiClient.postDurable('/api/notifications/read-all', {}, `notif-read-all:${new Date().toDateString()}`);
  }

  async registerPushToken(token: string, platform: string): Promise<void> {
    await apiClient.postDurable('/api/push/register', { token, platform }, `push:${token}`);
  }
}
