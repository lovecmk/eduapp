// Network Layer 실제 구현체 — PART 0.5
// 인증 토큰 주입, 401 재시도(refresh), 타임아웃, 에러 정규화를 한 곳에서 처리해
// Repository 레이어가 네트워크 디테일을 몰라도 되게 한다.
import { env } from './env';
import { validateResponse } from './validation';
import { secureStorage, StorageKeys } from '../storage/secureStorage';
import { ApiError, kindOf, toApiError } from './errors';
import { logger } from '../../utils/logger';
import { enqueue, flushQueue, setQueueSender, type QueuedWrite } from './offlineQueue';
import { emitSessionExpired } from './sessionEvents';

/** 읽기 요청 재시도 정책 — 일시적 실패(연결 없음·5xx·429)에 한해 지수 백오프로 다시 시도. */
const GET_RETRIES = 2;
const RETRY_BASE_MS = 400;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 네트워크 단계의 원시 예외를 ApiError 로 정규화한다.
 *
 * 이걸 fetch 호출부에만 걸면 부족하다 — 타임아웃 타이머가 **본문을 읽는 도중**
 * 터지면 `res.text()` 가 AbortError 로 거부되는데, 그 경로가 정규화되지 않으면
 * `toApiError` 가 kind:'unknown'(= retryable:false)으로 만들어 버린다.
 * 그러면 오프라인 큐가 "다시 보내도 소용없는 실패"로 오판해 사용자의 출석·채점
 * 기록을 **버린다**. 유실 방지가 존재 이유인 큐에서 가장 나쁜 결과다.
 */
function toNetworkError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if ((e as { name?: string })?.name === 'AbortError') {
    return new ApiError(0, `요청 시간이 초과되었습니다 (${env.apiTimeoutMs}ms)`, 'offline');
  }
  return new ApiError(0, '네트워크에 연결할 수 없어요. 연결 상태를 확인해주세요.', 'offline');
}

/**
 * 성공 응답의 본문을 읽는다. 삭제는 204, 일부 쓰기는 빈 200 으로 답하므로
 * 본문이 없는 경우를 성공으로 다뤄야 한다(res.json() 을 그냥 걸면 SyntaxError 가
 * 나면서 성공한 요청이 실패로 둔갑한다).
 */
async function readJsonBody(res: Response): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return {};
  // 본문 읽기 실패를 삼키면 안 된다. `.catch(() => '')` 로 빈 문자열을 만들면
  // **중간에 끊긴 응답이 '내용 없는 성공'으로 둔갑한다** — 카드 목록 GET 이
  // 조용히 빈 배열이 되어 화면은 "학습할 카드가 없습니다"를 보여주고,
  // 사용자는 서버가 그렇게 답한 줄 안다. 여기서 던져야 바깥이 offline 으로
  // 정규화하고 GET 재시도·오프라인 배너가 정상 동작한다.
  const text = await res.text();
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // 본문은 있는데 JSON 이 아니다(프록시가 끼워 넣은 HTML 오류 페이지 등).
    // 본문에는 토큰이 섞일 수 있으니 상태 코드만 남긴다.
    logger.warn('api_response_not_json', { status: res.status });
    throw new ApiError(res.status, '서버 응답 형식이 올바르지 않습니다', 'server');
  }
}

class ApiClient {
  // 동시에 여러 요청이 401을 받아도 refresh 는 한 번만 수행하고 결과를 공유한다(single-flight).
  // 이렇게 하지 않으면 refresh 쇄도(stampede)가 일어나, 서버가 refresh 토큰을 회전시킬 때
  // 첫 refresh 가 토큰을 무효화 → 나머지 refresh 가 전부 실패 → 사용자가 로그아웃된다.
  private refreshInFlight: Promise<boolean> | null = null;

  private async request<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
    const token = await secureStorage.getItem(StorageKeys.accessToken);
    const controller = new AbortController();
    // 타임아웃은 응답 헤더가 아니라 **본문을 다 읽을 때까지** 걸려 있어야 한다.
    // 예전처럼 fetch 직후 clearTimeout 하면, 헤더만 보내고 본문을 흘리지 않는
    // 프록시·중간 장비를 만났을 때 `res.text()` 에서 영원히 멈춘다(무한 대기).
    const timeout = setTimeout(() => controller.abort(), env.apiTimeoutMs);

    try {
      const res = await fetch(`${env.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
        signal: controller.signal,
      });

      if (res.status === 401 && !isRetry) {
        clearTimeout(timeout); // 재시도는 자기 타이머를 새로 건다
        return await this.handleUnauthorized<T>(path, init, token);
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        // 실패한 요청을 구조화 로그로 남긴다(경로·상태만 — 본문/토큰은 남기지 않는다).
        logger.warn('api_request_failed', { path, status: res.status, method: init.method ?? 'GET' });
        throw new ApiError(res.status, body.message ?? '', kindOf(res.status));
      }
      return validateResponse<T>(await readJsonBody(res));
    } catch (e) {
      // fetch 실패(타임아웃 AbortError·네트워크 단절 TypeError)와 본문 읽기 중단을
      // 한 곳에서 ApiError 로 정규화한다 — status 0 = 응답을 완성하지 못한 실패.
      throw toNetworkError(e);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 401 처리 — refresh 쇄도(stampede)와 '멀쩡한 토큰을 지우는' 사고를 함께 막는다.
   *
   * single-flight 만으로는 부족하다. 겹치지 않고 **연달아** 도착한 401 이 문제다:
   *   ① 요청 A·B 가 만료 토큰 T1 으로 나간다.
   *   ② A 가 401 → refresh 성공(T1→T2, 회전형 서버는 refresh 토큰도 R1→R2).
   *   ③ 그 직후 B 의 401 이 도착한다. 이때 A 의 refresh 는 이미 끝나 슬롯이 비어 있어
   *      B 가 **두 번째 refresh** 를 R2… 가 아니라 자기가 아는 흐름대로 다시 돌린다.
   *      서버가 이미 쓴 R1 을 거부하면 refresh 실패 → clearTokens() 가 방금 받은
   *      **유효한 T2/R2 까지 지우고** 사용자를 로그인 화면으로 쫓아낸다.
   *
   * 그래서 refresh 를 돌리기 전에 저장소의 access 토큰을 다시 읽어, 내가 요청을
   * 보낸 뒤에 누군가 이미 갱신했다면 refresh 없이 새 토큰으로 재시도만 한다.
   */
  private async handleUnauthorized<T>(
    path: string,
    init: RequestInit,
    usedToken: string | null,
  ): Promise<T> {
    const current = await secureStorage.getItem(StorageKeys.accessToken);
    if (current && current !== usedToken) return this.request<T>(path, init, true);

    const refreshed = await this.refreshOnce();
    if (refreshed) return this.request<T>(path, init, true);

    // 여기서도 한 번 더 확인한다 — 내 refresh 가 실패로 끝나는 사이에 다른 흐름이
    // 성공시켜 놓았을 수 있다. 그 경우 토큰을 지우면 남의 성공을 무효로 만든다.
    const afterRefresh = await secureStorage.getItem(StorageKeys.accessToken);
    if (afterRefresh && afterRefresh !== usedToken) return this.request<T>(path, init, true);

    await this.clearTokens();
    // 토큰을 실어 보낸 요청이 거절됐을 때만 '세션이 끝났다'고 알린다.
    // 토큰 없이 나간 요청(틀린 비밀번호로 로그인, 서버 토큰이 없는 로컬 관리자
    // 세션)의 401 은 세션이 끝난 것이 아니다 — 그걸 알리면 로그인 화면에서
    // 비밀번호를 한 번 틀렸을 뿐인데 '로그인이 만료되었습니다'가 뜬다.
    if (usedToken) emitSessionExpired();
    throw new ApiError(401, '인증이 만료되었습니다');
  }

  /**
   * 진행 중인 refresh 가 있으면 그 결과를 공유하고, 없으면 새로 시작한다(single-flight).
   * 완료되면 슬롯을 비워 다음 만료 때 다시 refresh 할 수 있게 한다.
   */
  private refreshOnce(): Promise<boolean> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.tryRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async tryRefresh(): Promise<boolean> {
    const refreshToken = await secureStorage.getItem(StorageKeys.refreshToken);
    if (!refreshToken) return false;
    // refresh 에는 타임아웃이 반드시 있어야 한다. 이 fetch 는 single-flight 라
    // 여기가 멈추면 **뒤따르는 모든 401 이 같은 약속을 기다리며 영원히 멈춘다** —
    // 화면·오프라인 큐(flushing 플래그가 안 풀린다)까지 통째로 얼어붙는다.
    // 현장에서 흔한 '연결은 살아 있는데 응답이 없는' 반열림(half-open) 상태가 정확히 이 경우다.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.apiTimeoutMs);
    try {
      const res = await fetch(`${env.apiBaseUrl}/inner/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: controller.signal,
      });
      if (!res.ok) return false;
      const data = (await res.json().catch(() => ({}))) as {
        access_token?: string;
        refresh_token?: string;
      };
      // access_token 이 유효한 문자열일 때만 성공으로 본다 — 빈/이상 응답으로
      // undefined 를 토큰으로 저장하고 '성공'으로 오인하는 것을 막는다.
      if (typeof data.access_token !== 'string' || data.access_token.length === 0) return false;
      await secureStorage.setItem(StorageKeys.accessToken, data.access_token);
      // 서버가 refresh 토큰을 회전(rotation)시키는 경우 새 refresh 토큰을 반드시 저장해야
      // 다음 refresh 가 성공한다. 없으면(비회전 서버) 기존 토큰을 그대로 둔다.
      if (typeof data.refresh_token === 'string' && data.refresh_token.length > 0) {
        await secureStorage.setItem(StorageKeys.refreshToken, data.refresh_token);
      }
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async clearTokens() {
    await secureStorage.removeItem(StorageKeys.accessToken);
    await secureStorage.removeItem(StorageKeys.refreshToken);
  }

  /**
   * 읽기 요청 — 일시적 실패(연결 끊김·5xx·429)는 지수 백오프로 몇 번 더 시도한다.
   * GET 은 부수효과가 없어 재시도가 안전하다(멱등).
   *
   * `retries: 0` 은 "기다릴 수 없는 자리"를 위한 것이다. 화면이 사용자를 붙잡아 둔 채
   * 응답을 기다리는 경로(앱 부팅의 세션 복구 등)에서 기본 재시도를 그대로 쓰면
   * 오프라인일 때 타임아웃 3회 + 백오프까지 30초 넘게 멈춘 화면을 보여주게 된다.
   */
  async get<T>(path: string, options: { retries?: number } = {}): Promise<T> {
    const retries = options.retries ?? GET_RETRIES;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.request<T>(path, { method: 'GET' });
      } catch (e) {
        lastError = e;
        const err = toApiError(e);
        if (!err.retryable || attempt === retries) throw err;
        // 400ms → 800ms … 재시도 간격을 늘려 서버 부담과 배터리 소모를 줄인다.
        await sleep(RETRY_BASE_MS * 2 ** attempt);
      }
    }
    throw toApiError(lastError);
  }

  post<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }
  patch<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }
  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  /**
   * '반드시 전달되어야 하는' 쓰기 — 실패해도 사용자 행동을 잃지 않는다.
   *
   * 네트워크/서버 일시 오류면 오프라인 큐에 넣고 조용히 성공 처리한다(낙관적 UI).
   * 입력·권한 오류처럼 다시 보내도 실패할 요청은 그대로 던져 화면이 안내하게 한다.
   *
   * 서버는 `Idempotency-Key` 헤더가 같은 요청을 한 번만 반영해야 한다 —
   * 재전송으로 출석이 두 번 찍히거나 신고가 중복 접수되면 안 되기 때문이다.
   */
  async postDurable(path: string, body: unknown, idempotencyKey?: string): Promise<'sent' | 'queued'> {
    const key = idempotencyKey ?? `${path}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    try {
      await this.request(path, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': key },
      });
      // 이번 요청이 통했다면 네트워크가 살아났다는 뜻 — 밀린 큐도 함께 흘려보낸다.
      void flushQueue();
      return 'sent';
    } catch (e) {
      const err = toApiError(e);
      if (!err.retryable) throw err;
      await enqueue('POST', path, body, key);
      return 'queued';
    }
  }

  /** 큐에 밀린 쓰기를 지금 전송 시도한다. 성공 건수를 반환. */
  flushPendingWrites(): Promise<number> {
    return flushQueue();
  }

  /** 오프라인 큐 전용 재전송 통로 — 큐에 다시 넣지 않고 실패를 그대로 알린다. */
  rawSend(method: string, path: string, body: unknown, idempotencyKey: string): Promise<unknown> {
    return this.request(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  /**
   * 서버 상태 점검(GET /inner/api/v1/health) — 개발자 화면·배포 후 스모크 체크용.
   * 던지지 않고 결과 객체로 돌려주므로 호출부에서 try/catch 가 필요 없다.
   * 백엔드 계약: 200 + { status: 'ok', version?: string } 을 인증 없이 응답할 것.
   */
  async health(): Promise<HealthResult> {
    const startedAt = Date.now();
    try {
      const body = await this.request<{ status?: string; version?: string; reason?: string }>(
        '/inner/api/v1/health',
        { method: 'GET' },
      );
      const status = body?.status;
      return {
        ok: status === 'ok',
        latencyMs: Date.now() - startedAt,
        version: body?.version,
        status,
        reason: body?.reason,
        // 200 인데 status 가 ok 가 아닌 경우 — 서버가 **닿기는 했고**, 스스로
        // 어디가 아픈지도 말해 주고 있다. 그 말을 error 로도 옮겨 둔다.
        // 옮기지 않으면 호출부는 예외가 없어 error 가 비어 있는 것을 보고
        // '실패 · 알 수 없음' 이라고 표시한다 — 서버가 알려준 이유를 앱이 버리는 셈이다.
        error:
          status === 'ok'
            ? undefined
            : [status ?? '알 수 없는 상태', body?.reason].filter(Boolean).join(' · '),
      };
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: e instanceof ApiError ? `${e.status} ${e.message}` : '알 수 없는 오류',
      };
    }
  }
}

/** 헬스체크 결과 — 실패해도 예외 대신 ok:false 로 표현한다. */
export interface HealthResult {
  /** 서버가 `status: "ok"` 라고 답했는가. */
  ok: boolean;
  latencyMs: number;
  version?: string;
  /** 서버가 스스로 말한 상태('ok' · 'degraded' …). 닿지 못했으면 없다. */
  status?: string;
  /** 정상이 아닐 때 서버가 밝힌 사유(예: 'configuration unavailable'). */
  reason?: string;
  /** 사람이 읽을 실패 설명 — 닿지 못한 경우와 아픈 경우를 모두 담는다. */
  error?: string;
}

export const apiClient = new ApiClient();

// 오프라인 큐가 항목을 재전송할 때 쓰는 실제 전송 경로를 주입한다.
// (offlineQueue 가 ApiClient 를 직접 import 하면 순환 참조가 되므로 주입 방식을 쓴다.)
setQueueSender((item: QueuedWrite) =>
  apiClient
    .rawSend(item.method, item.path, item.body, item.idempotencyKey)
    .then(() => undefined),
);
