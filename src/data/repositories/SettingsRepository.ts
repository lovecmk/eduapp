import type {
  AccountSettingsSnapshot,
  ISettingsRepository,
} from '../../domain/repositories/ISettingsRepository';
import type { AccountSettings, AccountSettingsPatch } from '../../domain/models/UserSettings';
import { apiClient } from '../network/ApiClient';

/** 서버 응답(snake_case) — docs/API_CONTRACT.md §13 참고. */
interface SettingsDTO {
  notifications?: {
    enabled_yn?: boolean;
    community_alerts_yn?: boolean;
    daily_reminder_time?: string;
    review_alerts_yn?: boolean;
    weekly_report_yn?: boolean;
    in_app_yn?: boolean;
    email_yn?: boolean;
    marketing_yn?: boolean;
  };
  daily_target?: number;
  shuffle_yn?: boolean;
  prioritize_weak_yn?: boolean;
  interests?: string[];
  job?: string;
  experience?: string;
  bio_txt?: string;
  flex_prompt_yn?: boolean;
  achievement_badge_yn?: boolean;
  collection_enabled_yn?: boolean;
  visibility?: {
    searchable_yn?: boolean;
    show_progress_yn?: boolean;
    show_streak_yn?: boolean;
    show_emblems_yn?: boolean;
    show_collection_yn?: boolean;
  };
  updated_at?: string | null;
}

/**
 * `undefined` 를 유지하는 매핑이 중요하다.
 *
 * 서버가 모르는 필드를 `false`/`0` 으로 채워 내려보내면 기기에서 켜 둔 설정이
 * 조용히 꺼진다. 값이 없으면 없는 채로 넘겨, 정규화 단계에서 **기기 값이 남게** 한다.
 */
function toPatch(dto: SettingsDTO): AccountSettingsPatch {
  const out: AccountSettingsPatch = {};
  if (dto.notifications) {
    const n = dto.notifications;
    out.notifications = {
      enabled: n.enabled_yn,
      communityAlerts: n.community_alerts_yn,
      dailyReminderTime: n.daily_reminder_time,
      reviewAlerts: n.review_alerts_yn,
      weeklyReport: n.weekly_report_yn,
      inApp: n.in_app_yn,
      email: n.email_yn,
      marketing: n.marketing_yn,
    };
  }
  if (dto.daily_target !== undefined) out.dailyTarget = dto.daily_target;
  if (dto.shuffle_yn !== undefined) out.shuffleCards = dto.shuffle_yn;
  if (dto.prioritize_weak_yn !== undefined) out.prioritizeWeakSpots = dto.prioritize_weak_yn;
  if (dto.interests !== undefined) out.interests = dto.interests;
  if (dto.job !== undefined) out.job = dto.job;
  if (dto.experience !== undefined) out.experience = dto.experience;
  if (dto.bio_txt !== undefined) out.bio = dto.bio_txt;
  if (dto.flex_prompt_yn !== undefined) out.flexPromptEnabled = dto.flex_prompt_yn;
  if (dto.achievement_badge_yn !== undefined) out.showAchievementBadge = dto.achievement_badge_yn;
  if (dto.collection_enabled_yn !== undefined) out.collectionEnabled = dto.collection_enabled_yn;
  if (dto.visibility) {
    const v = dto.visibility;
    out.profileVisibility = {
      searchable: v.searchable_yn,
      showProgress: v.show_progress_yn,
      showStreak: v.show_streak_yn,
      showEmblems: v.show_emblems_yn,
      showCollection: v.show_collection_yn,
    };
  }
  return out;
}

function toDTO(s: AccountSettings, updatedAt: Date): SettingsDTO {
  return {
    notifications: {
      enabled_yn: s.notifications.enabled,
      community_alerts_yn: s.notifications.communityAlerts,
      daily_reminder_time: s.notifications.dailyReminderTime,
      review_alerts_yn: s.notifications.reviewAlerts,
      weekly_report_yn: s.notifications.weeklyReport,
      in_app_yn: s.notifications.inApp,
      email_yn: s.notifications.email,
      marketing_yn: s.notifications.marketing,
    },
    daily_target: s.dailyTarget,
    shuffle_yn: s.shuffleCards,
    prioritize_weak_yn: s.prioritizeWeakSpots,
    interests: [...s.interests],
    job: s.job ?? '',
    experience: s.experience ?? '',
    bio_txt: s.bio,
    flex_prompt_yn: s.flexPromptEnabled,
    achievement_badge_yn: s.showAchievementBadge,
    collection_enabled_yn: s.collectionEnabled,
    visibility: {
      searchable_yn: s.profileVisibility.searchable,
      show_progress_yn: s.profileVisibility.showProgress,
      show_streak_yn: s.profileVisibility.showStreak,
      show_emblems_yn: s.profileVisibility.showEmblems,
      show_collection_yn: s.profileVisibility.showCollection,
    },
    updated_at: updatedAt.toISOString(),
  };
}

/**
 * 실서버 계정 설정.
 *  · pull() → GET  /inner/api/v1/settings
 *  · push() → POST /inner/api/v1/settings  (Idempotency-Key: settings:<updated_at>)
 *
 * 쓰기에 `postDurable` 을 쓰는 이유는 출석·채점과 같다 — 지하에서 알림을 끈
 * 사용자의 선택이 연결이 끊겼다는 이유로 사라지면 안 된다. 같은 스냅샷을 다시
 * 보내도 결과가 같으므로(전체 덮어쓰기 + 시각 기반 멱등키) 재전송이 안전하다.
 */
export class SettingsRepository implements ISettingsRepository {
  async pull(): Promise<AccountSettingsSnapshot> {
    const dto = await apiClient.get<SettingsDTO | null>('/inner/api/v1/settings');
    // 200 + 빈 본문 = "이 계정에 저장된 설정이 아직 없다". 기기 값이 권위를 갖는다.
    if (!dto || Object.keys(dto).length === 0) {
      return { settings: {}, updatedAt: null, present: false };
    }
    return { settings: toPatch(dto), updatedAt: dto.updated_at ?? null, present: true };
  }

  async push(settings: AccountSettings, updatedAt: Date): Promise<void> {
    await apiClient.postDurable(
      '/inner/api/v1/settings',
      toDTO(settings, updatedAt),
      `settings:${updatedAt.toISOString()}`,
    );
  }
}
