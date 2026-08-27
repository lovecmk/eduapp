import { useEffect, useRef } from 'react';
import { useReportStore } from '../store/reportStore';
import { useAuthStore } from '../store/authStore';
import { reportRepository } from '../data/repositories';
import { logger } from '../utils/logger';

/**
 * 카드 신고를 서버로 올린다.
 *
 * `ReportRepository` 와 서버의 `POST /inner/api/v1/reports` 는 완성돼 있었지만
 * **아무도 부르지 않았다.** 신고는 로컬 zustand 스토어에만 쌓였고, 화면에는
 * "요청됨"이 떴다 — 운영자에게는 한 건도 닿지 않았다. 운영 DB 의 `reports` 는
 * 0행이었다.
 *
 * 신고는 이 앱에서 **가장 조용히 실패하면 안 되는** 데이터다. 사용자는 잘못된
 * 문제를 고쳐 달라고 보냈다고 믿는데 아무도 그것을 못 보는 상태가 이어진다.
 *
 * ── 쌓여 있던 것부터 보낸다 ────────────────────────────────────────────
 * 이 훅이 붙기 전에 접수된 신고가 기기에 남아 있다. 처음 붙을 때 그것들을
 * 먼저 올리고(서버가 이미 아는 것은 뺀다), 그 뒤로는 새 신고만 보낸다.
 * 서버는 (사용자, 카드, 사유)가 유일하므로 중복 전송이 안전하다.
 */
export function useReportSync(): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const enabled = !!userId;

  // 이미 서버로 올린 카드 id — 재전송을 줄인다(서버 제약이 최종 방어선이다).
  const sent = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void (async () => {
      try {
        const mine = await reportRepository.listMine();
        if (cancelled) return;
        sent.current = new Set(mine);
      } catch (e) {
        // 목록을 못 받아도 올리는 것은 계속한다 — 중복은 서버가 막는다.
        logger.warn('report.list_failed', { reason: String(e) });
      }

      // 그동안 기기에만 쌓여 있던 신고를 흘려보낸다.
      for (const r of useReportStore.getState().reports) {
        if (sent.current.has(r.cardId)) continue;
        sent.current.add(r.cardId);
        try {
          await reportRepository.submit({ cardId: r.cardId, reason: r.reason, detail: r.detail });
        } catch (e) {
          sent.current.delete(r.cardId);
          logger.warn('report.backfill_failed', { cardId: r.cardId, reason: String(e) });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled) return;
    let prev = useReportStore.getState().reports;

    const unsub = useReportStore.subscribe((s) => {
      if (s.reports === prev) return;
      const before = new Set(prev.map((r) => `${r.cardId}|${r.reason}`));
      for (const r of s.reports) {
        const key = `${r.cardId}|${r.reason}`;
        if (before.has(key)) continue;
        sent.current.add(r.cardId);
        void reportRepository
          .submit({ cardId: r.cardId, reason: r.reason, detail: r.detail })
          .catch((e) => {
            sent.current.delete(r.cardId);
            logger.warn('report.submit_failed', { cardId: r.cardId, reason: String(e) });
          });
      }
      prev = s.reports;
    });

    return unsub;
  }, [enabled]);
}
