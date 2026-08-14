import type { AccountSettings, AccountSettingsPatch } from '../models/UserSettings';

/**
 * 계정 설정 동기화.
 *
 * 지금까지 설정은 전부 `app-settings`(AsyncStorage)에만 있었다. 기기를 바꾸면
 * 관심 분야·하루 목표·알림 수신 동의·공개 범위가 통째로 초기값으로 돌아가고,
 * 공용 태블릿에서는 앞사람의 한 줄 소개가 다음 사람 프로필에 그대로 남았다.
 *
 * 병합 규칙은 **타임스탬프 기준 마지막 쓰기 우선(last-write-wins)** 이다.
 * 설정은 도감(단조 증가 카운터)과 달리 '더 큰 값'이 없어 필드별 최댓값 병합이
 * 성립하지 않는다. 대신 값이 작고, 사용자가 방금 자기 손으로 바꾼 쪽이 언제나
 * 옳다 — 그래서 앱은 마지막 변경 시각을 함께 들고 다닌다.
 */
export interface AccountSettingsSnapshot {
  /** 서버가 보관 중인 값. 서버가 모르는 필드는 생략된다(기기 값 유지). */
  settings: AccountSettingsPatch;
  /** 서버 기준 마지막 변경 시각(ISO). 기록이 없으면 null. */
  updatedAt: string | null;
  /**
   * 서버에 이 계정의 설정이 실제로 있었는가.
   *
   * 이 구분이 없으면 '서버에 아직 아무것도 없는 신규 계정'과 '서버가 초기값을
   * 준 계정'을 가를 수 없어, 사용자가 기기에서 고른 값을 서버 기본값으로
   * 덮어써 버린다. 없으면(false) 기기 값이 권위를 갖고 그대로 올라간다.
   */
  present: boolean;
}

export interface ISettingsRepository {
  /** 서버에 보관된 계정 설정을 가져온다(로그인·기기 변경 후 복원). */
  pull(): Promise<AccountSettingsSnapshot>;
  /** 계정 설정 전체를 서버에 보관한다. `updatedAt` 은 앱이 값을 바꾼 시각. */
  push(settings: AccountSettings, updatedAt: Date): Promise<void>;
}
