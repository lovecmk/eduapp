import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import {
  applyUpdate,
  fetchRemoteVersion,
  isUpdateAvailable,
  type RemoteVersion,
} from '../data/update/UpdateService';
import { fetchNativeUpdate, reloadNativeUpdate } from '../data/update/NativeUpdateService';

const IS_WEB = Platform.OS === 'web';

/** 주기적 버전 확인 간격(기본 5분). */
const POLL_INTERVAL_MS = 5 * 60_000;
/** 부팅 직후 첫 확인까지의 지연 — 초기 렌더/스플래시와 겹치지 않게. */
const INITIAL_DELAY_MS = 4_000;

interface UseAppUpdateResult {
  /** 새 배포 감지 여부. */
  updateAvailable: boolean;
  /** 감지된 원격 버전 메타데이터(없으면 null). */
  remote: RemoteVersion | null;
  /** 사용자가 이번 세션에서 알림을 닫음(다음 배포 전까지 다시 뜨지 않음). */
  dismiss: () => void;
  /** 캐시를 깨고 최신 버전으로 하드 리로드. */
  apply: () => void;
  /** 수동 즉시 확인(설정 화면 등에서 호출 가능). */
  checkNow: () => Promise<void>;
}

/**
 * OTA 업데이트 감지 훅 — PART 5.2
 *
 * 부팅 직후 1회 + 주기적 폴링 + 앱 재포커스(웹은 탭 가시성) 시점에 업데이트를 확인한다.
 * 웹은 `version.json`(GitHub Pages), 네이티브는 expo-updates(EAS Update)를 사용한다.
 * 모든 타이머/리스너는 언마운트 시 정리해 메모리 누수를 원천 차단한다.
 */
export function useAppUpdate(): UseAppUpdateResult {
  const [remote, setRemote] = useState<RemoteVersion | null>(null);
  const [dismissedBuild, setDismissedBuild] = useState<number | null>(null);

  // 최신 상태를 리스너 콜백에서 안전하게 참조하기 위한 ref(스테일 클로저 방지).
  const isMounted = useRef(true);
  const detectedBuild = useRef<number | null>(null);

  const runCheck = useCallback(async () => {
    // 웹: version.json 폴링 후 현재 번들과 비교. 네이티브: expo-updates 로 확인/다운로드.
    // (네이티브 경로는 "새로 내려받은" 업데이트가 있을 때만 값을 반환한다.)
    const found = IS_WEB ? await fetchRemoteVersion() : await fetchNativeUpdate();
    if (!isMounted.current || !found) return;
    const isNew = IS_WEB ? isUpdateAvailable(found) : true;
    if (isNew && detectedBuild.current !== found.buildNumber) {
      detectedBuild.current = found.buildNumber;
      setRemote(found);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;

    const initialTimer = setTimeout(runCheck, INITIAL_DELAY_MS);
    const interval = setInterval(runCheck, POLL_INTERVAL_MS);

    // 탭이 다시 활성화되면 즉시 확인(백그라운드에 오래 머문 세션 대응).
    const onAppStateChange = (status: AppStateStatus) => {
      if (status === 'active') void runCheck();
    };
    const sub = AppState.addEventListener('change', onAppStateChange);

    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void runCheck();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      isMounted.current = false;
      clearTimeout(initialTimer);
      clearInterval(interval);
      sub.remove();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [runCheck]);

  const dismiss = useCallback(() => {
    setDismissedBuild(remote?.buildNumber ?? null);
  }, [remote]);

  const apply = useCallback(() => {
    // 웹: 캐시 버스팅 하드 리로드. 네이티브: 내려받은 OTA 적용 후 앱 재시작.
    if (IS_WEB) void applyUpdate(remote ?? undefined);
    else void reloadNativeUpdate();
  }, [remote]);

  const updateAvailable =
    remote !== null && remote.buildNumber !== dismissedBuild;

  return { updateAvailable, remote, dismiss, apply, checkNow: runCheck };
}
