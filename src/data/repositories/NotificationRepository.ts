import type { INotificationRepository } from '../../domain/repositories/INotificationRepository';
import type { AppNotification, NotificationType } from '../../domain/models/Notification';
import { apiClient } from '../network/ApiClient';
import { toApiError } from '../network/errors';
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
 *  · GET  /inner/api/v1/notifications           → 목록
 *  · POST /inner/api/v1/notifications/:id/read  → 읽음
 *  · POST /inner/api/v1/notifications/read-all  → 전체 읽음
 *  · POST /inner/api/v1/push/register           → 푸시 토큰 등록
 */
export class NotificationRepository implements INotificationRepository {
  async list(): Promise<AppNotification[]> {
    const dtos = await apiClient.get<NotificationDTO[]>('/inner/api/v1/notifications');
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
    await apiClient.postDurable(`/inner/api/v1/notifications/${encodeURIComponent(id)}/read`, {}, `notif-read:${id}`);
  }

  async markAllRead(): Promise<void> {
    // 전체 읽음은 '지금 시각'까지의 상태라 멱등키에 날짜를 넣어 하루 단위로 묶는다.
    await apiClient.postDurable('/inner/api/v1/notifications/read-all', {});
  }

  /**
   * `POST /inner/api/v1/notifications/dismiss { ids }` — docs/BACKEND_TODO §4.
   * 서버가 이 사람의 목록에서 숨기면 다른 기기에서도 사라진다. 라우트가 아직 없으면(404/501)
   * 삼킨다 — 지운 것은 기기에서 이미 걸러지고 있고, 알림 동기화 전체를 흔들 일이 아니다.
   */
  async dismiss(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const sorted = [...ids].sort();
    try {
      await apiClient.postDurable('/inner/api/v1/notifications/dismiss', { ids: sorted }, `notif-dismiss:${sorted.join(',')}`);
    } catch (e) {
      const err = toApiError(e);
      if (err.kind === 'notFound' || err.status === 501) return;
      throw err;
    }
  }

  async registerPushToken(token: string, platform: string): Promise<void> {
    await apiClient.postDurable('/inner/api/v1/push/register', { token, platform }, `push:${token}`);
  }
}
