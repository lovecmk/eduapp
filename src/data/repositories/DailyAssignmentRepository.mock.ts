import type { IDailyAssignmentRepository } from '../../domain/repositories/IDailyAssignmentRepository';
import type { DailyAssignment, DailyCard } from '../../domain/models/DailyAssignment';
import { buildDailyPlan, type LearnerSignal, type PlanCandidate } from '../../domain/dailyPlan';
import { DAILY_NEW_LIMIT, DAILY_TOTAL_LIMIT } from '../../constants/learning';
import { useSrsStore } from '../../store/srsStore';
import { useAuthStore } from '../../store/authStore';
import { dateKey } from '../../utils/dateKey';
import { cardRepository } from './index';

/**
 * 오늘의 학습 — 로컬 편성.
 *
 * 목업이면서 **오프라인 대비책**이기도 하다. 이 앱은 지하·철골 구조물에서 쓰여
 * 서버에 닿지 못하는 날이 흔한데, 그때 "오늘의 학습이 없습니다"를 띄우면 그날
 * 학습은 그냥 없던 일이 된다. 그래서 서버와 **같은 규칙**(domain/dailyPlan)으로
 * 여기서도 편성한다 — 온라인이든 오프라인이든 같은 사람은 같은 날 같은 문제를 본다.
 *
 * 편성 규칙 자체를 여기 적지 않는 것이 중요하다. 규칙이 두 벌이 되는 순간
 * 온라인과 오프라인이 서로 다른 문제를 내기 시작하고, 사용자는 "어제 풀던 게
 * 사라졌다"고 느낀다.
 */
export class MockDailyAssignmentRepository implements IDailyAssignmentRepository {
  async get(): Promise<DailyAssignment> {
    const day = dateKey(new Date());
    const cards = await cardRepository.getAllCards();
    const srs = useSrsStore.getState();
    // 로그인 전에도 화면은 그려져야 한다. 사용자를 모르면 기기 공통 시드를 쓴다 —
    // 로그인하면 그 사람의 시드로 바뀌어 목록이 달라지는데, 그것이 맞다.
    const userId = useAuthStore.getState().user?.id ?? 'guest';

    const now = Date.now();
    const states = srs.cards;

    // 그 사람의 학습 기록 요약 — 오늘의 난이도를 정하는 재료.
    let reps = 0;
    let lapses = 0;
    let boxSum = 0;
    let counted = 0;
    for (const st of Object.values(states)) {
      reps += st.reps;
      lapses += st.lapses;
      boxSum += st.box;
      counted += 1;
    }
    const signal: LearnerSignal = { reps, lapses, avgBox: counted > 0 ? boxSum / counted : 0 };

    const candidates: PlanCandidate[] = [];
    for (const card of cards) {
      const st = states[card.id];
      // 충분히 익힌 카드는 후보에서 뺀다 — 이미 아는 것을 다시 내면
      // '하루 3분'이 복습으로만 채워져 새로 배우는 것이 멈춘다.
      if (st && st.box >= 4 && st.dueAt > now) continue;
      candidates.push({
        cardId: card.id,
        difficulty: card.difficulty,
        seen: st !== undefined,
        due: st !== undefined && st.dueAt <= now,
        overdueRank: st ? Math.max(0, Math.floor((now - st.dueAt) / 60_000)) : 0,
      });
    }

    const plan = buildDailyPlan(userId, day, signal, candidates, DAILY_NEW_LIMIT, DAILY_TOTAL_LIMIT);

    const byId = new Map(cards.map((c) => [c.id, c]));
    const studiedToday = new Set(srs.history?.[day] ?? []);
    const out: DailyCard[] = [];
    for (const id of plan.cardIds) {
      const card = byId.get(id);
      if (!card) continue;
      out.push({
        card,
        kind: states[id] ? 'review' : 'new',
        done: studiedToday.has(id),
      });
    }

    return {
      day,
      difficulty: plan.difficulty,
      targetCount: plan.targetCount,
      cards: out,
      doneCount: out.filter((c) => c.done).length,
    };
  }
}
