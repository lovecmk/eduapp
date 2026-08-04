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
  /** 하루에 새로 배울 수 있는 문제 수. */
  dailyNewLimit: number;
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
export function defaultServiceConfig(dailyNewLimit: number): ServiceConfig {
  return {
    maintenance: false,
    maintenanceMessage: '',
    signupEnabled: true,
    dailyNewLimit,
    noticeText: '',
    noticeLevel: 'info',
    serverVersion: '',
  };
}
