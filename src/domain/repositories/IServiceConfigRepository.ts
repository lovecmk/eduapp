import type { ServiceConfig } from '../models/ServiceConfig';

/**
 * 서비스 운영 상태 조회 계약.
 *
 * 관리 콘솔이 바꾸고 앱이 읽는 단방향 값이라 조회 하나뿐이다.
 * 앱에서 이 값을 바꾸는 경로는 없어야 한다 — 있으면 그것이 곧 권한 구멍이다.
 */
export interface IServiceConfigRepository {
  get(): Promise<ServiceConfig>;
}
