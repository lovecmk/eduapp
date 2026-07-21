// Network Layer 실제 구현체 — PART 0.5
// 인증 토큰 주입, 401 재시도(refresh), 타임아웃, 에러 정규화를 한 곳에서 처리해
// Repository 레이어가 네트워크 디테일을 몰라도 되게 한다.
import { env } from './env';
import { validateResponse } from './validation';
import { secureStorage, StorageKeys } from '../storage/secureStorage';
import { ApiError } from './errors';

class ApiClient {
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
      const refreshed = await this.tryRefresh();
      if (refreshed) return this.request<T>(path, init, true);
      await this.clearTokens();
      throw new ApiError(401, '인증이 만료되었습니다');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { message?: string });
      throw new ApiError(res.status, body.message ?? `요청 실패 (${res.status})`);
    }
    const body = await res.json();
    return validateResponse<T>(body);
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
      const data = (await res.json()) as { access_token: string };
      await secureStorage.setItem(StorageKeys.accessToken, data.access_token);
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
}

export const apiClient = new ApiClient();
