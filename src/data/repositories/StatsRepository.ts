import type { IStatsRepository } from '../../domain/repositories/IStatsRepository';
import type { StudyStats } from '../../domain/models/StudyStats';
import type { StatsDTO } from '../dto/StatsDTO';
import { StatsMapper } from '../mappers/StatsMapper';
import { apiClient } from '../network/ApiClient';

export class StatsRepository implements IStatsRepository {
  async getStudyStats(): Promise<StudyStats> {
    const dto = await apiClient.get<StatsDTO>('/inner/api/v1/stats');
    return StatsMapper.toDomain(dto);
  }
}
