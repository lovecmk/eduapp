// 크로스플랫폼 보안 저장소 래퍼.
// 네이티브: expo-secure-store / 웹: localStorage 폴백.
// (expo-secure-store는 웹에서 사용 불가하므로 이 추상화로 감싼다 — PART 1.7 결합도 분리)
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { logger } from '../../utils/logger';

const isWeb = Platform.OS === 'web';

/**
 * 네이티브 SecureStore 도 실패할 수 있다 — 키체인/키스토어 잠김, 기기 마이그레이션 후
 * 복호화 불가, 저장소 가득 참 등. 이 예외가 그대로 올라오면 앱 부팅 첫 단계인
 * 세션 복구가 통째로 터져 스플래시에서 멈춘다. 저장소 접근 실패는 '값이 없다'와
 * 같게 다루는 편이 안전하다(최악의 경우 다시 로그인하면 된다).
 */
async function guard<T>(op: () => Promise<T>, fallback: T, action: string, key: string): Promise<T> {
  try {
    return await op();
  } catch (e) {
    logger.warn('secure_storage_failed', {
      action,
      key,
      reason: e instanceof Error ? e.message : 'unknown',
    });
    return fallback;
  }
}

/**
 * 마지막으로 오간 값의 사본 — **동기로 읽어야 하는 자리** 하나를 위해 둔다.
 *
 * 이 저장소는 전부 비동기다(SecureStore 가 그렇다). 그런데 카드 사진 주소를
 * 만드는 자리는 동기다 — 렌더 도중 `<Image source={{ uri, headers }}>` 를
 * 만들어야 하고, 거기서 토큰을 기다릴 수가 없다. 기다리게 만들면 사진마다
 * 로딩 한 박자가 더 생기고, 그 사이 첫 렌더는 토큰 없는 주소로 나가 401 을
 * 받는다(그리고 immutable 로 캐시된다).
 *
 * 사본은 **이 저장소를 거친 값만** 담는다. 앱은 매 요청마다 액세스 토큰을
 * 읽으므로(ApiClient) 사본은 늘 최신이고, 지우면 함께 지워진다. 값이 아직
 * 없으면 null 이다 — 그때는 사진이 401 로 실패하고 화면에 '불러올 수 없어요'
 * 자리가 남는다(빈 화면이 아니라).
 */
const mirror = new Map<string, string | null>();

/** 사본에서 곧바로 읽는다 — 아직 한 번도 오가지 않은 키는 null. */
export function peekItem(key: string): string | null {
  return mirror.get(key) ?? null;
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const value = await readItem(key);
    mirror.set(key, value);
    return value;
  },

  async setItem(key: string, value: string): Promise<void> {
    mirror.set(key, value);
    if (isWeb) {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        /* no-op */
      }
      return;
    }
    await guard(() => SecureStore.setItemAsync(key, value), undefined, 'set', key);
  },

  async removeItem(key: string): Promise<void> {
    mirror.delete(key);
    if (isWeb) {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        /* no-op */
      }
      return;
    }
    await guard(() => SecureStore.deleteItemAsync(key), undefined, 'remove', key);
  },
};

/** 실제 저장소에서 읽는다(웹은 localStorage, 네이티브는 SecureStore). */
async function readItem(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return guard(() => SecureStore.getItemAsync(key), null, 'get', key);
}

export const StorageKeys = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  /** 목업 세션 사용자(로그인한 이름을 재실행 후에도 유지) */
  mockUser: 'mockUser',
  /**
   * 마지막으로 서버에서 확인된 내 프로필(실서버 모드).
   * 오프라인으로 앱을 켰을 때 로그인 화면으로 튕기지 않기 위한 캐시다.
   */
  cachedUser: 'cachedUser',
} as const;
