import { z } from 'zod';
import { validateResponse, validateArray, validateObject } from '../validation';
import { ApiError } from '../errors';

describe('validateResponse', () => {
  it('non-null 값은 그대로 통과', () => {
    expect(validateResponse<{ a: number }>({ a: 1 })).toEqual({ a: 1 });
    expect(validateResponse<number>(0)).toBe(0); // 0/false 는 유효값
    expect(validateResponse<boolean>(false)).toBe(false);
  });

  it.each([null, undefined])('빈 응답(%p)은 ApiError(500)', (v) => {
    expect(() => validateResponse(v)).toThrow(ApiError);
    try { validateResponse(v); } catch (e) { expect((e as ApiError).status).toBe(500); }
  });
});

describe('validateArray', () => {
  it('배열이면 통과', () => {
    expect(validateArray<number>([1, 2])).toEqual([1, 2]);
  });
  it('배열이 아니면 ApiError(500)', () => {
    expect(() => validateArray({})).toThrow(ApiError);
  });
});

describe('validateObject', () => {
  const schema = z.object({ id: z.number(), name: z.string() });
  it('스키마에 맞으면 파싱 결과 반환', () => {
    expect(validateObject({ id: 1, name: 'x' }, schema)).toEqual({ id: 1, name: 'x' });
  });
  it('스키마 위반 시 ApiError(500)', () => {
    expect(() => validateObject({ id: 'nope' }, schema)).toThrow(ApiError);
  });
});
