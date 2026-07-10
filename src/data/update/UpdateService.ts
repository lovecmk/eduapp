import { Platform } from 'react-native';
import { env } from '../network/env';

/**
 * OTA(Over-The-Air) 업데이트 감지 서비스 — PART 5.2
 *
 * GitHub Actions 는 배포 때마다 웹 루트에 `version.json` 을 새로 밀어 넣는다.
 * 이 서비스는 현재 번들에 구워진 버전(`env.build`)과 원격 `version.json` 을
 * 비교해 "새 배포가 존재하는지"를 판정하고, 필요 시 브라우저 캐시를 깨고
 * 최신 코드를 하드 리로드한다.
 */

export interface RemoteVersion {
  version: string;
  buildNumber: number;
  commit: string;
  buildTime: string;
}

/** 배포 산출물의 루트를 기준으로 한 매니페스트 경로. */
const VERSION_MANIFEST_PATH = 'version.json';
const FETCH_TIMEOUT_MS = 6_000;

function isValidManifest(data: unknown): data is RemoteVersion {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.version === 'string' &&
    typeof d.buildNumber === 'number' &&
    Number.isFinite(d.buildNumber)
  );
}

/**
 * 원격 매니페스트를 캐시 버스팅과 함께 조회한다.
 * 네트워크 지연/오류/잘못된 응답은 모두 `null` 로 흡수해 호출부를 단순하게 유지.
 */
export async function fetchRemoteVersion(): Promise<RemoteVersion | null> {
  // 웹이 아닌 네이티브에서는 스토어/EAS Update 가 담당하므로 스킵.
  if (Platform.OS !== 'web' || typeof fetch === 'undefined') return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // 쿼리스트링 + no-store 로 CDN/브라우저 캐시를 우회해 항상 최신 매니페스트 확보.
    const url = `${VERSION_MANIFEST_PATH}?t=${Date.now()}`;
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return isValidManifest(data) ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 원격 버전이 현재 실행 중인 번들보다 "새 배포"인지 판정.
 * buildNumber(단조 증가) 를 1차 기준으로 하되, 로컬(baked buildNumber=0)에서는
 * 오탐(false positive)을 막기 위해 항상 최신으로 간주한다.
 */
export function isUpdateAvailable(remote: RemoteVersion): boolean {
  const current = env.build.buildNumber;
  if (current <= 0) return false; // 로컬/개발 번들은 업데이트 알림 비활성
  return remote.buildNumber > current;
}

/**
 * 캐시를 깨고 최신 코드를 강제로 다시 불러온다(웹 전용).
 * ServiceWorker/Cache Storage 를 비우고, 캐시 버스팅 쿼리와 함께 하드 리로드.
 */
export async function applyUpdate(remote?: RemoteVersion): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  try {
    // 1) Cache Storage(PWA/ServiceWorker) 전부 제거
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    // 2) 등록된 ServiceWorker 해제
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch {
    // 캐시 정리 실패는 무시하고 리로드는 강행한다.
  }

  // 3) 캐시 버스팅 쿼리와 함께 하드 리로드 → 최신 index.html/번들 로드
  const bust = remote?.buildNumber ?? Date.now();
  const { location } = window;
  const separator = location.search ? '&' : '?';
  location.replace(`${location.pathname}${location.search}${separator}v=${bust}${location.hash}`);
}
