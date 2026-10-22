import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSrsStore } from '../store/srsStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { useProgressStatusStore } from '../store/progressStatusStore';
import { useAuthStore } from '../store/authStore';
import { progressRepository } from '../data/repositories';
import { logger } from '../utils/logger';
import { normalizeGrade, type SrsCardState } from '../domain/srs';
import { queryClient } from '../data/network/queryClient';
import type { LearningCard } from '../domain/models/LearningCard';
import { getSessionEpoch } from '../data/network/sessionEpoch';
import { apiClient } from '../data/network/ApiClient';
import { waitForHydration } from '../data/storage/hydration';
import { restoring, restored, useAccountRestoreStore } from '../store/accountRestoreStore';

/**
 * 학습 진행(SRS 일정·학습 이력·출석)을 서버와 맞춘다.
 *
 * ── 왜 이 훅이 뒤늦게 생겼는가 ──────────────────────────────────────────
 * `ProgressRepository` 도 서버의 `/inner/api/v1/progress/*` 도 오래 전부터
 * 완성돼 있었는데, **둘을 잇는 코드가 없었다.** 저장소는 어디에서도
 * import 되지 않았고, SRS 상태는 기기의 zustand 스토어에만 쌓였다.
 *
 * 실제 결과가 운영 DB 에 그대로 남아 있었다 — 어떤 사용자가 이틀에 걸쳐
 * 11장을 학습해 `learning_daily` 에는 누계가 찍혔는데(그 경로만 살아 있었다),
 * `srs_state`·`learn_history`·`attendance` 는 **전부 0행**이었다. 그 사람이
 * 기기를 바꾸면 이틀치 학습이 통째로 사라지는 상태였다.
 *
 * ── 왜 호출부를 고치지 않고 스토어를 구독하는가 ────────────────────────
 * 채점은 학습 화면 여러 곳에서 일어난다(정답 확인·다시 볼래요·스와이프).
 * 그 자리마다 서버 호출을 넣으면 언젠가 한 군데가 빠지고, 빠진 자리는
 * 조용히 기록을 잃는다 — 이 기능이 죽어 있던 것과 똑같은 방식으로.
 * 스토어를 한 곳에서 구독하면 어느 경로로 채점하든 반드시 잡힌다.
 *
 * ── 실패해도 화면은 멈추지 않는다 ──────────────────────────────────────
 * 쓰기는 `postDurable`(오프라인 큐 + 멱등키)이라 연결이 돌아오면 알아서 나간다.
 * 사용자는 기다리지 않는다(로컬을 먼저 반영하는 낙관적 갱신).
 */

/** 이 카드가 '새로 채점됐다'고 볼 수 있는가 — 복습 시각이나 횟수가 늘었을 때. */
function wasGraded(prev: SrsCardState | undefined, next: SrsCardState): boolean {
  if (!prev) return true;
  if ((next.lastReviewedAt ?? 0) > (prev.lastReviewedAt ?? 0)) return true;
  // 같은 밀리초에 두 번 채점되는 일은 없지만, 시각이 없던 옛 데이터에서
  // 올라온 경우를 위해 횟수도 함께 본다.
  return next.reps > prev.reps || next.lapses > prev.lapses;
}

export function useProgressSync(): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const enabled = !!userId;
  const retry = useAccountRestoreStore(s => s.retry);

  // 이미 보낸 채점을 다시 보내지 않기 위한 표식(카드 id → 마지막으로 보낸 복습 시각).
  //
  // ⚠️ 이 표식은 **사람마다 새로 시작해야 한다.** 특히 출석은 값이 날짜 문자열이라
  // 사용자와 무관하다 — 현장 태블릿에서 A 가 오늘 출석한 뒤 B 가 로그인해 출석하면,
  // 표식에 오늘 날짜가 이미 들어 있어 **B 의 출석이 서버로 한 번도 나가지 않는다.**
  // 기기에는 도장이 찍혀 있으니 아무도 눈치채지 못하고, B 가 기기를 바꾸면 그날
  // 출석은 없던 일이 된다. 그래서 아래 구독은 userId 로 다시 걸고 표식을 비운다.
  const sent = useRef<Map<string, number>>(new Map());
  const sentDays = useRef<Set<string>>(new Set());
  const applyingServer = useRef(false);

  // 1) 로그인·계정 변경 및 앱 복귀 시 서버 스냅샷을 받아 로컬에 합친다.
  useEffect(() => {
    useProgressStatusStore.setState({ userId, settled: false });
    if (!enabled) return;
    let cancelled = false;
    const epoch = getSessionEpoch();
    let flight: Promise<void> | undefined;
    const fetchSnapshot = async () => {
      let success = false;
      restoring('progress', userId, epoch);
      useProgressStatusStore.setState({ userId, settled: false });
      try {
        await waitForHydration(useSrsStore, useAttendanceStore);
        if (cancelled || epoch !== getSessionEpoch()) return;
        await apiClient.flushPendingWrites();
        if (cancelled || epoch !== getSessionEpoch()) return;
        const snap = await progressRepository.pull();
        if (cancelled || epoch !== getSessionEpoch()) return;
        // 서버가 이미 아는 것은 다시 보내지 않는다. 이 표식이 없으면 복원 직후
        // 구독이 깨어나 스냅샷 전체를 되돌려 보내고, 오프라인 큐가 그것으로 찬다.
        for (const [id, st] of Object.entries(snap.cards)) {
          sent.current.set(id, st.lastReviewedAt ?? 0);
        }
        for (const day of Object.keys(snap.attendance)) sentDays.current.add(day);
        applyingServer.current = true;
        try {
          useSrsStore.getState().applyServer({ cards: snap.cards, history: snap.history, dailyGoals: snap.dailyGoals });
          useAttendanceStore.getState().applyServer(snap.attendance);
        } finally { applyingServer.current = false; }
        for (const key of ['cards', 'daily-assignment', 'learning-quota', 'stats']) {
          void queryClient.invalidateQueries({ queryKey: [key] });
        }
        success = true;
        restored('progress', userId, epoch, 'ready');
      } catch (e) {
        if (!cancelled) restored('progress', userId, epoch, 'error');
        // 못 가져와도 로컬 기록으로 계속 쓴다 — 여기서 막으면 오프라인에서
        // 학습 화면이 아예 열리지 않는다.
        logger.warn('progress.pull_failed', { reason: String(e) });
      } finally {
        if (!cancelled && epoch === getSessionEpoch()) useProgressStatusStore.setState({ userId, settled: success });
      }
    };
    const pull = (): Promise<void> => {
      if (cancelled || epoch !== getSessionEpoch()) return Promise.resolve();
      if (flight) return flight;
      const shared = fetchSnapshot().finally(() => { if (flight === shared) flight = undefined; });
      flight = shared;
      return shared;
    };
    void pull();
    const appSub = AppState.addEventListener('change', status => { if (status === 'active') void pull(); });
    return () => {
      cancelled = true;
      appSub.remove();
    };
  }, [enabled, userId, retry]);

  // 2) 채점이 생기면 그 카드만 보낸다.
  useEffect(() => {
    if (!enabled) return;
    // 앞사람의 '이미 보냄' 표식을 물려받지 않는다(위 주석 참고).
    sent.current = new Map();
    let prevCards = useSrsStore.getState().cards;
    const epoch = getSessionEpoch();

    const unsub = useSrsStore.subscribe((state) => {
      const next = state.cards;
      if (next === prevCards) return;
      if (applyingServer.current || !useSrsStore.persist.hasHydrated() || epoch !== getSessionEpoch()) { prevCards = next; return; }
      for (const [cardId, st] of Object.entries(next)) {
        if (!wasGraded(prevCards[cardId], st)) continue;
        const stamp = st.lastReviewedAt ?? 0;
        if (sent.current.get(cardId) === stamp) continue;
        sent.current.set(cardId, stamp);
        const status = st.box >= 4 && st.lastGrade !== 'again' && st.lastGrade !== 'hard' ? 'mastered' : 'learning';
        queryClient.setQueryData<LearningCard[]>(['cards'], old => old?.map(card => card.id === cardId ? { ...card, status, dueAt: new Date(st.dueAt) } : card));
        void progressRepository
          // `??` 로는 부족하다 — 서버는 모르는 등급을 **빈 문자열**로 저장하므로
          // `''` 가 들어올 수 있고, `'' ?? 'good'` 은 `''` 이라 빈 등급을 그대로
          // 되돌려 보내게 된다. 아는 값만 통과시키고 아니면 'good' 으로 둔다.
          .pushGrade(cardId, normalizeGrade(st.lastGrade) ?? 'good', st)
          .then(async () => {
            if (epoch !== getSessionEpoch()) return;
            try {
              const snap = await progressRepository.pull();
              if (epoch !== getSessionEpoch()) return;
              applyingServer.current = true;
              try { useSrsStore.getState().applyServer({ cards: snap.cards, history: snap.history, dailyGoals: snap.dailyGoals }); }
              finally { applyingServer.current = false; }
            } catch { /* The queued/local schedule remains available during an outage. */ }
            for (const key of ['cards', 'daily-assignment', 'stats']) void queryClient.invalidateQueries({ queryKey: [key] });
          })
          .catch((e) => {
            // 다시 보낼 수 있도록 표식을 되돌린다 — 그러지 않으면 이 채점은
            // 앱을 다시 켜기 전까지 영영 올라가지 않는다.
            if (epoch === getSessionEpoch() && sent.current.get(cardId) === stamp) sent.current.delete(cardId);
            logger.warn('progress.grade_failed', { cardId, reason: String(e) });
          });
      }
      prevCards = next;
    });

    return unsub;
  }, [enabled, userId]);

  // 3) 출석 도장이 찍히면 보낸다.
  useEffect(() => {
    if (!enabled) return;
    sentDays.current = new Set();
    const epoch = getSessionEpoch();
    let prevStamps = useAttendanceStore.getState().stamps;

    const unsub = useAttendanceStore.subscribe((state) => {
      const next = state.stamps;
      if (next === prevStamps) return;
      if (applyingServer.current || !useAttendanceStore.persist.hasHydrated() || epoch !== getSessionEpoch()) { prevStamps = next; return; }
      for (const day of Object.keys(next)) {
        if (prevStamps[day] || sentDays.current.has(day)) continue;
        sentDays.current.add(day);
        void progressRepository.pushAttendance(day).catch((e) => {
          if (epoch === getSessionEpoch()) sentDays.current.delete(day);
          logger.warn('progress.attendance_failed', { day, reason: String(e) });
        });
      }
      prevStamps = next;
    });

    return unsub;
  }, [enabled, userId]);
}
