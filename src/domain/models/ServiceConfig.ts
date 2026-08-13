// 서비스 운영 상태 — 관리 콘솔의 '운영 설정'이 앱에 도착한 모습이다.
//
// 서버의 `GET /api/config`(무인증)가 주는 값이고, 관리자가 콘솔에서 바꾸면
// 재배포 없이 곧바로 반영된다. 무인증인 것은 의도적이다 — 점검 중이라
// 로그인조차 못 하는 사람에게도 "왜 안 되는지"는 전달되어야 한다.

/** 공지 배너의 세기. 색과 아이콘을 고르는 유일한 기준이다. */
export type NoticeLevel = 'info' | 'warn' | 'danger';

export interface ServiceConfig {
  /** 점검 중이면 일반 사용자의 API 요청이 전부 503 으로 막힌다. */
  maintenance: boolean;
  /** 점검 안내 문구(비어 있으면 화면이 기본 문구를 쓴다). */
  maintenanceMessage: string;
  /** 신규 가입을 받는가. 회원가입 화면이 미리 안내하는 데 쓴다. */
  signupEnabled: boolean;
  /** 하루에 새로 배울 수 있는 문제 수(구형 필드 `daily_new_limit` 의 자리). */
  dailyNewLimit: number;
  /**
   * 하루 출제 **범위** — 운영자가 콘솔에서 바꾸는 값이다.
   *
   * 정확한 장수는 그날 그 사람의 난이도가 이 범위 안에서 정한다(dailyPlan).
   * 앱 상수(`constants/learning`)는 이 값을 못 읽었을 때의 기본값일 뿐이고,
   * 서버가 값을 주면 그쪽이 권위다 — 운영자가 "이번 주는 3장까지"라고 줄였는데
   * 앱이 컴파일된 상수로 5장을 내면 그 조정은 아무 데도 닿지 않는다.
   */
  dailyMinCards: number;
  dailyMaxCards: number;
  /** 비어 있지 않으면 상단에 배너로 띄운다. */
  noticeText: string;
  noticeLevel: NoticeLevel;
  /** 지금 붙어 있는 서버 빌드 — 개발자 화면에서 배포 확인에 쓴다. */
  serverVersion: string;
}

/**
 * 서버에 닿지 못했을 때의 값.
 *
 * **실패는 항상 '서비스가 열려 있는' 쪽으로 기운다.** 설정을 못 읽었다고
 * 점검 화면을 띄우면, 지하에서 잠깐 끊긴 것만으로 앱이 멈춘 것처럼 보인다.
 * 진짜 점검 중이라면 어차피 모든 요청이 503 으로 막히므로 사용자는 알게 된다.
 */
export function defaultServiceConfig(minCards: number, maxCards = minCards): ServiceConfig {
  return {
    maintenance: false,
    maintenanceMessage: '',
    signupEnabled: true,
    dailyNewLimit: minCards,
    dailyMinCards: minCards,
    dailyMaxCards: Math.max(minCards, maxCards),
    noticeText: '',
    noticeLevel: 'info',
    serverVersion: '',
  };
}

/** 하루 출제 범위. */
export interface DailyCardRange {
  min: number;
  max: number;
}

/**
 * 서버가 준 하루 출제 범위를 앱이 쓸 수 있는 값으로 정리한다.
 *
 * 운영값은 사람이 콘솔에 손으로 넣는 값이라 **틀린 값이 온다는 전제**로 다룬다.
 * 0·음수·min>max·터무니없이 큰 수가 실제로 온다. 그대로 쓰면 학습이 통째로
 * 잠기거나("오늘 0장") 하루에 수십 장이 나가 '하루 3분'이라는 약속이 깨진다.
 *
 *  · 숫자가 아니거나 0 이하면 그 필드는 없는 것으로 본다(앱 기본값으로).
 *  · `daily_max_cards` 가 없으면 구형 필드 `daily_new_limit` 이 그 자리다
 *    (서버가 두 값을 같게 내보낸다 — docs/PLATFORM_SPLIT.md §5).
 *  · min > max 로 뒤집혀 오면 max 를 따른다 — 적게 내는 쪽이 안전하다.
 *  · 마지막으로 편성기가 감당하는 절대 한계(MIN/MAX_DAILY_CARDS)로 자른다.
 */
export function resolveDailyRange(
  raw: { min?: unknown; max?: unknown; legacyLimit?: unknown },
  fallback: DailyCardRange,
  bounds: DailyCardRange,
): DailyCardRange {
  const positive = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;

  const clamp = (v: number) => Math.min(bounds.max, Math.max(bounds.min, v));

  const max = clamp(positive(raw.max) ?? positive(raw.legacyLimit) ?? fallback.max);
  const min = clamp(positive(raw.min) ?? fallback.min);

  return { min: Math.min(min, max), max };
}
