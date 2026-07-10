import type { CommunitySnapshot } from '../models/Community';

export interface ICommunityRepository {
  getSnapshot(): Promise<CommunitySnapshot>;
}
