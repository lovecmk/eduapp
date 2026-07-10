import type { SystemHealth } from '../models/SystemHealth';

export interface ISystemRepository {
  getHealth(): Promise<SystemHealth>;
}
