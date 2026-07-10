import type { ISystemRepository } from '../../domain/repositories/ISystemRepository';
import type { SystemHealth, SystemStatus } from '../../domain/models/SystemHealth';
import { delay } from './_delay';

/**
 * 백엔드 헬스체크 목업 — 실제 서버가 붙기 전까지 상태 위젯을 구동한다.
 * 확정 후에는 `SystemRepository`(실서버 `GET /api/health`)로 교체하면 되며,
 * UI/훅은 인터페이스에만 의존하므로 영향받지 않는다.
 */
export class MockSystemRepository implements ISystemRepository {
  async getHealth(): Promise<SystemHealth> {
    await delay(450);
    // 대부분 정상, 가끔 경미한 지연을 섞어 위젯의 상태 전환을 확인할 수 있게 함.
    const latencyMs = Math.round(28 + Math.random() * 46); // 28~74ms
    const successRate = 0.985 + Math.random() * 0.015; // 98.5~100%
    let status: SystemStatus = 'operational';
    if (latencyMs > 65 || successRate < 0.99) status = 'degraded';
    return {
      status,
      latencyMs,
      successRate: Math.min(1, successRate),
      checkedAt: new Date(),
    };
  }
}
