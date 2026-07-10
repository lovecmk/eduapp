import type { StudyStats } from '../models/StudyStats';

export interface IStatsRepository {
  getStudyStats(): Promise<StudyStats>;
}
