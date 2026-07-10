import { z } from 'zod';
import { ApiError } from './errors';

export function validateResponse<T>(data: unknown): T {
  if (data === null || data === undefined) {
    throw new ApiError(500, '서버 응답이 비어있습니다');
  }
  return data as T;
}

export function validateArray<T>(data: unknown): T[] {
  if (!Array.isArray(data)) {
    throw new ApiError(500, '서버 응답 형식 오류: 배열이 아닙니다');
  }
  return data as T[];
}

export function validateObject<T extends Record<string, unknown>>(data: unknown, schema: z.ZodSchema<T>): T {
  try {
    return schema.parse(data);
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new ApiError(500, '서버 응답 데이터 형식이 올바르지 않습니다');
    }
    throw new ApiError(500, '데이터 검증 중 오류가 발생했습니다');
  }
}