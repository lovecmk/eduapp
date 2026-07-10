// Layer 2: Domain Model — 시스템/백엔드 상태 모니터링
export type SystemStatus = 'operational' | 'degraded' | 'down';

export interface SystemHealth {
  status: SystemStatus;
  /** 최근 요청 왕복 지연(ms) */
  latencyMs: number;
  /** 최근 요청 성공률(0~1) */
  successRate: number;
  /** 마지막 점검 시각 */
  checkedAt: Date;
}

export const SYSTEM_STATUS_META: Record<
  SystemStatus,
  { label: string; color: string }
> = {
  operational: { label: '정상 운영 중', color: '#34C759' },
  degraded: { label: '지연 발생', color: '#FF9500' },
  down: { label: '연결 불안정', color: '#FF3B30' },
};
