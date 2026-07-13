import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import type { RemoteVersion } from './UpdateService';

/**
 * 네이티브(iOS/Android) EAS Update 서비스 — PART 5.2 (네이티브 경로)
 *
 * 웹은 `UpdateService`(version.json 폴링)가, 네이티브는 이 모듈(expo-updates)이
 * OTA 를 담당한다. app.json 의 checkAutomatically: ON_LOAD 로 콜드 스타트마다 자동
 * 확인되며, 세션 도중에도 이 서비스로 확인/다운로드 후 사용자에게 재시작을 안내한다.
 *
 * Expo Go/웹/개발 빌드 등 Updates 가 비활성(`isEnabled === false`)인 환경에서는
 * 모든 함수가 안전하게 no-op 으로 동작한다.
 */

function updatesActive(): boolean {
  return Platform.OS !== 'web' && Updates.isEnabled;
}

/**
 * 새 OTA 업데이트를 확인하고, 있으면 백그라운드로 내려받는다.
 * 다운로드가 완료된 "새" 업데이트가 있을 때만 RemoteVersion 을 반환한다.
 */
export async function fetchNativeUpdate(): Promise<RemoteVersion | null> {
  if (!updatesActive()) return null;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return null;

    const result = await Updates.fetchUpdateAsync();
    if (!result.isNew) return null;

    const manifest = (check.manifest ?? result.manifest ?? {}) as {
      id?: string;
      createdAt?: string;
    };
    const createdAt = manifest.createdAt ? Date.parse(manifest.createdAt) : Date.now();

    return {
      version: Updates.runtimeVersion ?? 'native',
      // dismiss 비교용 안정 식별자 — 업데이트 생성 시각(ms)을 buildNumber 로 사용.
      buildNumber: Number.isFinite(createdAt) ? createdAt : Date.now(),
      commit: (manifest.id ?? Updates.updateId ?? '').slice(0, 7),
      buildTime: manifest.createdAt ?? new Date().toISOString(),
    };
  } catch {
    // 네트워크/서명 오류 등은 조용히 흡수 — 기존(내장) 번들로 계속 동작.
    return null;
  }
}

/** 내려받은 OTA 업데이트를 적용하며 앱을 재시작한다. */
export async function reloadNativeUpdate(): Promise<void> {
  if (!updatesActive()) return;
  try {
    await Updates.reloadAsync();
  } catch {
    /* noop — 다음 콜드 스타트에 자동 적용된다. */
  }
}
