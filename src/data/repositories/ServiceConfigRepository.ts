import type { IServiceConfigRepository } from '../../domain/repositories/IServiceConfigRepository';
import type { NoticeLevel, ServiceConfig } from '../../domain/models/ServiceConfig';
import { defaultServiceConfig, resolveDailyRange } from '../../domain/models/ServiceConfig';
import { DAILY_MIN_CARDS, DAILY_MAX_CARDS } from '../../constants/learning';
import { MIN_DAILY_CARDS, MAX_DAILY_CARDS } from '../../domain/dailyPlan';
import { useServerPolicyStore } from '../../store/serverPolicyStore';
import { apiClient } from '../network/ApiClient';

/** 서버 응답(handler.PublicConfig)과 1:1. */
interface ConfigDTO {
  maintenance_yn?: boolean;
  maintenance_msg?: string;
  signup_enabled?: boolean;
  /** 구형 필드 — 서버가 `daily_max_cards` 와 같은 값을 싣는다. */
  daily_new_limit?: number;
  daily_min_cards?: number;
  daily_max_cards?: number;
  notice_txt?: string;
  notice_level?: string;
  version?: string;
}

/** 서버의 대문자 코드를 앱의 소문자 union 으로. 모르는 값은 가장 약한 단계로. */
function toLevel(raw: string | undefined): NoticeLevel {
  switch ((raw ?? '').toUpperCase()) {
    case 'DANGER':
      return 'danger';
    case 'WARN':
      return 'warn';
    default:
      // 모르는 코드를 '경고'로 올려 잡으면, 서버에 값 하나 추가한 것만으로
      // 전 사용자 화면이 빨개진다. 모를 때는 조용한 쪽으로 기운다.
      return 'info';
  }
}

/**
 * 실서버 서비스 운영 상태.
 *  · get() → GET /api/config (무인증)
 *
 * 이 경로는 인증을 요구하지 않는다 — 점검 중이라 로그인조차 못 하는 사람에게도
 * "왜 안 되는지"는 전달되어야 하기 때문이다.
 */
export class ServiceConfigRepository implements IServiceConfigRepository {
  async get(): Promise<ServiceConfig> {
    const dto = await apiClient.get<ConfigDTO>('/api/config');
    const fallback = defaultServiceConfig(DAILY_MIN_CARDS, DAILY_MAX_CARDS);

    // 하루 출제 범위는 운영자가 재배포 없이 바꾸는 값이라 **서버 쪽이 권위**다.
    // 다음에 서버에 닿지 못한 채 시작해도 같은 분량이 나가도록 기억해 둔다
    // (기억은 실서버 응답에서만 — 목업 값으로 덮으면 운영값이 지워진다).
    const range = resolveDailyRange(
      { min: dto.daily_min_cards, max: dto.daily_max_cards, legacyLimit: dto.daily_new_limit },
      { min: fallback.dailyMinCards, max: fallback.dailyMaxCards },
      { min: MIN_DAILY_CARDS, max: MAX_DAILY_CARDS },
    );
    useServerPolicyStore.getState().rememberDailyRange(range);

    return {
      maintenance: dto.maintenance_yn === true,
      maintenanceMessage: dto.maintenance_msg?.trim() ?? '',
      // 서버가 값을 주지 않는 배포에서는 '열려 있다'로 본다 — 없는 차단을 만들지 않는다.
      signupEnabled: dto.signup_enabled !== false,
      // 0 이나 음수는 상한이 아니라 실수다. 앱 상수로 되돌린다.
      dailyNewLimit:
        typeof dto.daily_new_limit === 'number' && dto.daily_new_limit > 0
          ? dto.daily_new_limit
          : fallback.dailyNewLimit,
      dailyMinCards: range.min,
      dailyMaxCards: range.max,
      noticeText: dto.notice_txt?.trim() ?? '',
      noticeLevel: toLevel(dto.notice_level),
      serverVersion: dto.version ?? '',
    };
  }
}
