export interface RooftopReceipt {
  month: string;
  floor: number;
  packs: number;
  shards: number;
  opened_at: string;
}
export interface RooftopState {
  month: string;
  floors: number;
  my_bricks: number;
  history: RooftopReceipt[];
}
export interface IRooftopRepository {
  get(): Promise<RooftopState>;
  open(month: string, floor: number): Promise<RooftopReceipt>;
}
