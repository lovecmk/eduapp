import type { ISystemRepository } from '../../domain/repositories/ISystemRepository';
import type { SystemHealth, SystemStatus } from '../../domain/models/SystemHealth';
import { apiClient } from '../network/ApiClient';

interface HealthDTO {
  status: string;
  latency_ms: number;
  success_rate: number;
  checked_at: string;
}

/**
 * 실서버 헬스체크. Golang Fiber(`GET /api/health`) 응답을 도메인 모델로 변환한다.
 * 응답 형태가 확정되지 않았으므로 방어적으로 파싱한다.
 */
export class SystemRepository implements ISystemRepository {
  async getHealth(): Promise<SystemHealth> {
    const dto = await apiClient.get<HealthDTO>('/api/health');
    const status: SystemStatus =
      dto.status === 'operational' || dto.status === 'degraded' || dto.status === 'down'
        ? dto.status
        : 'operational';
    return {
      status,
      latencyMs: Number(dto.latency_ms) || 0,
      successRate: Number(dto.success_rate) || 0,
      checkedAt: dto.checked_at ? new Date(dto.checked_at) : new Date(),
    };
  }
}
