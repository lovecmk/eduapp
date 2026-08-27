import { useEffect, useRef } from 'react';
import { useSrsStore } from '../store/srsStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { useAuthStore } from '../store/authStore';
import { progressRepository } from '../data/repositories';
import { logger } from '../utils/logger';
import type { SrsCardState } from '../domain/srs';

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

  // 이미 보낸 채점을 다시 보내지 않기 위한 표식(카드 id → 마지막으로 보낸 복습 시각).
  const sent = useRef<Map<string, number>>(new Map());
  const sentDays = useRef<Set<string>>(new Set());

  // 1) 로그인·계정 변경 시 서버 스냅샷을 받아 로컬에 합친다.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await progressRepository.pull();
        if (cancelled) return;
        useSrsStore.getState().applyServer({ cards: snap.cards, history: snap.history });
        useAttendanceStore.getState().applyServer(snap.attendance);

        // 서버가 이미 아는 것은 다시 보내지 않는다. 이 표식이 없으면 복원 직후
        // 구독이 깨어나 스냅샷 전체를 되돌려 보내고, 오프라인 큐가 그것으로 찬다.
        for (const [id, st] of Object.entries(snap.cards)) {
          sent.current.set(id, st.lastReviewedAt ?? 0);
        }
        for (const day of Object.keys(snap.attendance)) sentDays.current.add(day);
      } catch (e) {
        // 못 가져와도 로컬 기록으로 계속 쓴다 — 여기서 막으면 오프라인에서
        // 학습 화면이 아예 열리지 않는다.
        logger.warn('progress.pull_failed', { reason: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId]);

  // 2) 채점이 생기면 그 카드만 보낸다.
  useEffect(() => {
    if (!enabled) return;
    let prevCards = useSrsStore.getState().cards;

    const unsub = useSrsStore.subscribe((state) => {
      const next = state.cards;
      if (next === prevCards) return;
      for (const [cardId, st] of Object.entries(next)) {
        if (!wasGraded(prevCards[cardId], st)) continue;
        const stamp = st.lastReviewedAt ?? 0;
        if (sent.current.get(cardId) === stamp) continue;
        sent.current.set(cardId, stamp);
        void progressRepository
          .pushGrade(cardId, st.lastGrade ?? 'good', st)
          .catch((e) => {
            // 다시 보낼 수 있도록 표식을 되돌린다 — 그러지 않으면 이 채점은
            // 앱을 다시 켜기 전까지 영영 올라가지 않는다.
            sent.current.delete(cardId);
            logger.warn('progress.grade_failed', { cardId, reason: String(e) });
          });
      }
      prevCards = next;
    });

    return unsub;
  }, [enabled]);

  // 3) 출석 도장이 찍히면 보낸다.
  useEffect(() => {
    if (!enabled) return;
    let prevStamps = useAttendanceStore.getState().stamps;

    const unsub = useAttendanceStore.subscribe((state) => {
      const next = state.stamps;
      if (next === prevStamps) return;
      for (const day of Object.keys(next)) {
        if (prevStamps[day] || sentDays.current.has(day)) continue;
        sentDays.current.add(day);
        void progressRepository.pushAttendance(day).catch((e) => {
          sentDays.current.delete(day);
          logger.warn('progress.attendance_failed', { day, reason: String(e) });
        });
      }
      prevStamps = next;
    });

    return unsub;
  }, [enabled]);
}
