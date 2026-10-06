import type { IRooftopRepository, RooftopReceipt, RooftopState } from '../../domain/models/Rooftop';
import { apiClient } from '../network/ApiClient';
import { z } from 'zod';
import { ApiError } from '../network/errors';

const receiptSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  floor: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(35), z.literal(50)]),
  packs: z.number().int().min(1).max(3),
  shards: z.union([z.literal(0), z.literal(30), z.literal(60), z.literal(100)]),
  opened_at: z.string().datetime({ offset: true }),
});
const stateSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  floors: z.number().int().nonnegative(),
  my_bricks: z.number().int().nonnegative(),
  history: z.array(receiptSchema).max(60),
  legacy_claims: z.array(z.string().regex(/^bld:\d{4}-(0[1-9]|1[0-2]):(5|10|20|35|50)$/)).max(5).optional(),
});
function validated<T>(schema: z.ZodType<T>, dto: unknown): T {
  const result = schema.safeParse(dto);
  if (!result.success) throw new ApiError(502, '보물상자 응답 형식이 올바르지 않습니다', 'server');
  return result.data;
}

// No durable queue or mock fallback: a grant must be confirmed by the server.
export class RooftopRepository implements IRooftopRepository {
  async get(): Promise<RooftopState> {
    return validated(stateSchema, await apiClient.get('/inner/api/v1/community/rooftop'));
  }
  async open(month: string, floor: number): Promise<RooftopReceipt> {
    const result = validated(receiptSchema, await apiClient.post('/inner/api/v1/community/rooftop/open', { month, floor }));
    if (result.month !== month || result.floor !== floor) throw new ApiError(502, '요청한 상자와 개봉 결과가 다릅니다', 'server');
    return result;
  }
}
