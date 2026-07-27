import { describe, it, expect } from 'vitest';
import { parseSSEData, queryString, defaultMessage, ApiError } from './client';

/**
 * SSE 파서와 쿼리 조립은 관리 콘솔의 가장 조용한 실패 지점이다.
 * 여기가 어긋나면 화면은 멀쩡한데 숫자만 안 바뀌거나, 필터가 무시된다.
 */

describe('parseSSEData — 실시간 스트림 프레임 해석', () => {
  it('정상 프레임에서 data 를 꺼낸다', () => {
    const chunk = 'event: metrics\ndata: {"total_requests":42}';
    expect(parseSSEData(chunk)).toEqual({ total_requests: 42 });
  });

  it('data: 뒤 공백을 허용한다(사양상 선택적)', () => {
    expect(parseSSEData('data:{"a":1}')).toEqual({ a: 1 });
    expect(parseSSEData('data:   {"a":1}')).toEqual({ a: 1 });
  });

  it('여러 줄 data 를 이어 붙인다', () => {
    const chunk = 'event: metrics\ndata: {"a":\ndata: 1}';
    expect(parseSSEData(chunk)).toEqual({ a: 1 });
  });

  it('하트비트(주석)는 데이터가 아니다', () => {
    expect(parseSSEData(': ping')).toBeNull();
  });

  it('data 가 없는 프레임은 null', () => {
    expect(parseSSEData('event: metrics')).toBeNull();
    expect(parseSSEData('')).toBeNull();
  });

  it('깨진 JSON 은 null 을 주고 스트림을 끊지 않는다', () => {
    // 프레임 하나가 잘렸다고 대시보드 전체가 죽으면 안 된다.
    expect(parseSSEData('data: {"a":')).toBeNull();
  });
});

describe('queryString — 필터를 URL 로', () => {
  it('값이 있는 항목만 담는다', () => {
    expect(queryString({ search: '홍길동', role: 'ADMIN' })).toBe(
      '?search=%ED%99%8D%EA%B8%B8%EB%8F%99&role=ADMIN',
    );
  });

  it('빈 값·undefined·null 은 아예 보내지 않는다', () => {
    // ?search= 를 보내면 서버가 '빈 문자열로 검색'으로 해석할 여지가 있다.
    expect(queryString({ search: '', role: undefined, status: null as never })).toBe('');
  });

  it('0 은 유효한 값이므로 보낸다(offset=0)', () => {
    expect(queryString({ offset: 0, limit: 25 })).toBe('?offset=0&limit=25');
  });

  it('특수문자를 이스케이프한다', () => {
    expect(queryString({ search: 'a&b=c' })).toBe('?search=a%26b%3Dc');
  });

  it('모두 비면 빈 문자열(물음표도 붙이지 않는다)', () => {
    expect(queryString({})).toBe('');
  });
});

describe('ApiError — 상태 코드의 의미', () => {
  it('401 은 인증 실패, 403 은 권한 부족, 409 는 규칙 충돌', () => {
    expect(new ApiError(401, 'x').isAuthFailure).toBe(true);
    expect(new ApiError(403, 'x').isForbidden).toBe(true);
    expect(new ApiError(409, 'x').isConflict).toBe(true);
    expect(new ApiError(500, 'x').isAuthFailure).toBe(false);
  });

  it('Error 를 상속해 일반 오류 처리에도 걸린다', () => {
    const e = new ApiError(400, '잘못된 요청');
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe('잘못된 요청');
  });
});

describe('defaultMessage — 서버가 메시지를 안 줬을 때', () => {
  it('상태 코드별로 사람이 읽을 문구를 준다', () => {
    expect(defaultMessage(400)).toContain('확인');
    expect(defaultMessage(403)).toContain('권한');
    expect(defaultMessage(404)).toContain('찾을 수 없');
    expect(defaultMessage(409)).toContain('수행할 수 없');
    expect(defaultMessage(503)).toContain('서버');
  });
});
