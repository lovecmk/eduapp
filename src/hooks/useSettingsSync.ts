import { useEffect } from 'react';
import { settingsRepository } from '../data/repositories';
import { useAuthStore } from '../store/authStore';
import { selectAccountSettings, useSettingsStore } from '../store/settingsStore';
import {
  decideSettingsSync,
  normalizeAccountSettings,
  sameAccountSettings,
  type AccountSettings,
} from '../domain/models/UserSettings';
import { parseDate } from '../data/mappers/_date';
import { logger } from '../utils/logger';
import { getSessionEpoch } from '../data/network/sessionEpoch';
import { waitForHydration } from '../data/storage/hydration';
import { restoring, restored, useAccountRestoreStore } from '../store/accountRestoreStore';

/**
 * 계정 설정을 서버와 맞춘다.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────
 * 설정은 지금까지 `app-settings`(AsyncStorage)에만 있었다. 기기를 바꾸면 관심
 * 분야·하루 목표·공개 범위·한 줄 소개가 초기값으로 돌아가고, 무엇보다 **마케팅
 * 정보 수신 동의처럼 법적 의미가 있는 선택이 사라진다.** 반대로 공용 태블릿에서는
 * 앞사람의 값이 다음 사람에게 그대로 남았다(sessionScope 가 지우는 목록에
 * `app-settings` 가 없다 — 기기 취향까지 지우면 그건 그것대로 파괴이기 때문).
 *
 * ── 병합 규칙 ───────────────────────────────────────────────────────────
 * 도감처럼 '단조 증가 카운터'로 만들 수 없는 데이터라(껐다 켰다 하는 값들)
 * **시각 기준 마지막 쓰기 우선**이다. 판단 재료는 두 가지뿐이다:
 *   · 서버 updated_at
 *   · 기기의 accountUpdatedAt(사용자가 마지막으로 손댄 시각)
 *
 * 여기에 '주인' 개념이 하나 더 붙는다:
 *   · 주인이 없다(null) → 첫 로그인. 기기 값을 그대로 **인수**한다
 *     (가입 직후 온보딩에서 고른 관심 분야를 잃지 않는다).
 *   · 주인이 다르다     → 계정 설정만 기본값으로 되돌린다. 기기 취향(테마·글자
 *     크기)은 남는다. 남의 한 줄 소개를 내 프로필로 물려받지 않기 위해서다.
 *
 * ── 서버 라우트가 아직 없다 ──────────────────────────────────────────────
 * `/inner/api/v1/settings` 는 리버스 프록시의 location 블록조차 만들어지기 전이다.
 * 그동안 목업 저장소는 "서버에 기록 없음(present:false)"이라고 정직하게 답하고,
 * 이 훅은 기기 값을 권위로 유지한다 — 라우트가 열리는 순간, 다음 로그인에서
 * 그 값이 그대로 서버로 올라간다.
 */

/** 값이 바뀐 뒤 이만큼 잠잠하면 서버로 보낸다(토글은 연달아 눌린다). */
const PUSH_DEBOUNCE_MS = 2500;

const fingerprint = (s: AccountSettings) => JSON.stringify(s);

export function useSettingsSync(): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const retry = useAccountRestoreStore(s => s.retry);

  useEffect(() => {
    // 로그인 전에는 보낼 곳도, 주인도 없다.
    if (!userId) return;
    let cancelled = false;
    const epoch = getSessionEpoch();
    // 각 계정의 전송 상태를 분리한다. 이전 요청의 finally가 새 계정 상태를 건드리지 않는다.
    let applying = false;
    let synced = '';
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let hydrated = false;
    let initialReadFinished = false;
    restoring('settings', userId, epoch);

    /** 스토어 변경이 '사용자의 손'이 아님을 표시하고 실행한다. */
    const withoutMarking = (fn: () => void) => {
      applying = true;
      try {
        fn();
      } finally {
        applying = false;
      }
    };

    const currentSettings = () => selectAccountSettings(useSettingsStore.getState());

    const push = async (reason: string) => {
      if (inFlight || cancelled || !initialReadFinished || epoch !== getSessionEpoch()) return;
      const store = useSettingsStore.getState();
      const settings = selectAccountSettings(store);
      const print = fingerprint(settings);
      // 같은 값을 반복해 보내지 않는다 — 화면을 드나들 때마다 요청이 나가면
      // 오프라인 큐가 의미 없는 항목으로 찬다.
      if (print === synced) return;

      const at = store.accountUpdatedAt || Date.now();
      inFlight = true;
      try {
        await settingsRepository.push(settings, new Date(at));
        if (cancelled || epoch !== getSessionEpoch()) return;
        synced = print;
        // 주인·시각을 확정한다(값은 그대로). 인수(첫 로그인) 경로가 여기서 끝난다.
        if (fingerprint(currentSettings()) === print) {
          withoutMarking(() =>
            useSettingsStore.getState().applyAccountSettings({}, at, userId),
          );
        }
      } catch (e) {
        // 실패해도 화면은 그대로다. 값은 이미 기기에 있고, 되보낼 기회는 또 온다.
        logger.warn('settings.push_failed', { reason: String(e), trigger: reason });
      } finally {
        inFlight = false;
        // 전송 중 추가로 바뀐 값도 전송한다. 실패한 동일 값은 무한 재시도하지 않는다.
        if (!cancelled && epoch === getSessionEpoch() && fingerprint(currentSettings()) !== print) schedule();
      }
    };

    // 1) 로그인 직후 한 번 맞춘다.
    void (async () => {
      try {
        await waitForHydration(useSettingsStore);
        if (cancelled || epoch !== getSessionEpoch()) return;
        hydrated = true;
        const before = useSettingsStore.getState();
        if (before.accountOwnerId && before.accountOwnerId !== userId) {
          // 앞사람이 쓰던 기기다 — 계정 설정만 비운다(기기 취향은 그대로 둔다).
          logger.warn('settings.owner_changed_reset', {});
          withoutMarking(() => before.resetAccountSettings(userId));
          synced = '';
        }

        const snap = await settingsRepository.pull();
        if (cancelled || epoch !== getSessionEpoch()) return;
        initialReadFinished = true;
        restored('settings', userId, epoch, 'ready');
        const store = useSettingsStore.getState();
        const local = currentSettings();
        const serverAt = parseDate(snap.updatedAt)?.getTime() ?? 0;
        const decision = decideSettingsSync({
          present: snap.present,
          serverAt,
          localAt: store.accountUpdatedAt,
          // 서버 패치를 기기 값 위에 얹어 봐서 달라지는 게 없으면 이미 일치한다.
          identical: sameAccountSettings(normalizeAccountSettings(snap.settings, local), local),
        });

        if (decision === 'apply-server') {
          withoutMarking(() =>
            store.applyAccountSettings(snap.settings, serverAt || Date.now(), userId),
          );
          synced = fingerprint(currentSettings());
          return;
        }
        if (decision === 'in-sync') {
          synced = fingerprint(local);
          // 주인만 이 계정으로 확정해 둔다(값·시각은 그대로).
          withoutMarking(() =>
            store.applyAccountSettings({}, store.accountUpdatedAt || serverAt, userId),
          );
          return;
        }
        await push('initial');
      } catch (e) {
        initialReadFinished = true;
        if (!cancelled) restored('settings', userId, epoch, 'error');
        // 못 읽었으면 **아무것도 보내지 않는다.**
        //
        // 여기서 기기 값을 올리고 싶은 유혹이 있지만, 서버 상태를 모르는 채로 쓰면
        // 최악의 경우가 열린다: 공용 태블릿에서 다른 사람이 오프라인으로 로그인하면
        // 방금 기본값으로 되돌린 설정이 큐에 실려, 연결이 돌아온 뒤 그 사람이 다른
        // 기기에서 정성껏 맞춰 둔 서버 설정을 덮어쓴다. 기기 값은 그대로 남아 있고,
        // 사용자가 실제로 설정을 바꾸는 순간(진짜 의도) 정상적으로 올라간다.
        logger.warn('settings.pull_failed', { reason: String(e) });
      }
    })();

    // 2) 사용자가 설정을 바꾸면 잠깐 기다렸다가 보낸다.
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void push('change'), PUSH_DEBOUNCE_MS);
    };

    const unsub = useSettingsStore.subscribe((state, prev) => {
      // 우리가 서버 값을 반영하는 중이면 '사용자의 변경'이 아니다.
      if (applying || !hydrated) return;
      const next = selectAccountSettings(state);
      // 기기 전용 설정(테마·글자 크기 등)이 바뀐 것은 서버와 무관하다.
      if (sameAccountSettings(next, selectAccountSettings(prev))) return;
      useSettingsStore.getState().markAccountSettingsChanged(Date.now());
      schedule();
    });

    return () => {
      cancelled = true;
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [userId, retry]);
}
