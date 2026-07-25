// Network Layer 실제 구현체 — PART 0.5
// 인증 토큰 주입, 401 재시도(refresh), 타임아웃, 에러 정규화를 한 곳에서 처리해
// Repository 레이어가 네트워크 디테일을 몰라도 되게 한다.
import { env } from './env';
import { validateResponse } from './validation';
import { secureStorage, StorageKeys } from '../storage/secureStorage';
import { ApiError } from './errors';
import { logger } from '../../utils/logger';

class ApiClient {
  // 동시에 여러 요청이 401을 받아도 refresh 는 한 번만 수행하고 결과를 공유한다(single-flight).
  // 이렇게 하지 않으면 refresh 쇄도(stampede)가 일어나, 서버가 refresh 토큰을 회전시킬 때
  // 첫 refresh 가 토큰을 무효화 → 나머지 refresh 가 전부 실패 → 사용자가 로그아웃된다.
  private refreshInFlight: Promise<boolean> | null = null;

  private async request<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
    const token = await secureStorage.getItem(StorageKeys.accessToken);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.apiTimeoutMs);

    let res: Response;
    try {
      res = await fetch(`${env.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
        signal: controller.signal,
      });
    } catch (e) {
      // fetch 실패는 원시 에러(타임아웃 시 AbortError, 네트워크 단절 시 TypeError)로
      // 던져진다. Repository/UI 레이어가 ApiError 로 일관되게 처리하도록 정규화한다.
      // (status 0 = 응답을 받기 전 클라이언트/네트워크 단계 실패)
      if ((e as { name?: string })?.name === 'AbortError') {
        throw new ApiError(0, `요청 시간이 초과되었습니다 (${env.apiTimeoutMs}ms)`);
      }
      throw new ApiError(0, '네트워크에 연결할 수 없어요. 연결 상태를 확인해주세요.');
    } finally {
      clearTimeout(timeout);
    }

    if (res.status === 401 && !isRetry) {
      const refreshed = await this.refreshOnce();
      if (refreshed) return this.request<T>(path, init, true);
      await this.clearTokens();
      throw new ApiError(401, '인증이 만료되었습니다');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { message?: string });
      // 실패한 요청을 구조화 로그로 남긴다(경로·상태만 — 본문/토큰은 남기지 않는다).
      logger.warn('api_request_failed', { path, status: res.status, method: init.method ?? 'GET' });
      throw new ApiError(res.status, body.message ?? `요청 실패 (${res.status})`);
    }
    const body = await res.json();
    return validateResponse<T>(body);
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
    try {
      const res = await fetch(`${env.apiBaseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
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
    }
  }

  private async clearTokens() {
    await secureStorage.removeItem(StorageKeys.accessToken);
    await secureStorage.removeItem(StorageKeys.refreshToken);
  }

  get<T>(path: string) {
    return this.request<T>(path, { method: 'GET' });
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
   * 서버 상태 점검(GET /api/health) — 개발자 화면·배포 후 스모크 체크용.
   * 던지지 않고 결과 객체로 돌려주므로 호출부에서 try/catch 가 필요 없다.
   * 백엔드 계약: 200 + { status: 'ok', version?: string } 을 인증 없이 응답할 것.
   */
  async health(): Promise<HealthResult> {
    const startedAt = Date.now();
    try {
      const body = await this.request<{ status?: string; version?: string }>('/api/health', { method: 'GET' });
      return {
        ok: body?.status === 'ok',
        latencyMs: Date.now() - startedAt,
        version: body?.version,
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
  ok: boolean;
  latencyMs: number;
  version?: string;
  error?: string;
}

export const apiClient = new ApiClient();
