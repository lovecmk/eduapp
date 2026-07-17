// 크로스플랫폼 보안 저장소 래퍼.
// 네이티브: expo-secure-store / 웹: localStorage 폴백.
// (expo-secure-store는 웹에서 사용 불가하므로 이 추상화로 감싼다 — PART 1.7 결합도 분리)
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        /* no-op */
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (isWeb) {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        /* no-op */
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const StorageKeys = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  /** 목업 세션 사용자(로그인한 이름을 재실행 후에도 유지) */
  mockUser: 'mockUser',
} as const;
