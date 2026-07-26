import type { IProgressRepository, ProgressSnapshot } from '../../domain/repositories/IProgressRepository';
import type { Grade, SrsCardState } from '../../domain/srs';
import { apiClient } from '../network/ApiClient';
import { parseDate } from '../mappers/_date';

/** 서버 응답(snake_case) — 계약서 참조. */
interface ProgressDTO {
  cards?: Record<string, {
    box?: number; ease?: number; due_at?: string | null; reps?: number;
    lapses?: number; last_grade?: Grade | null; last_reviewed_at?: string | null;
  }>;
  history?: Record<string, string[]>;
  attendance?: Record<string, string>;
  updated_at?: string | null;
}

/** 서버의 ISO 시각을 로컬 SRS 가 쓰는 epoch ms 로 바꾼다(파싱 불가 값은 안전 폴백). */
function toEpoch(iso: string | null | undefined, fallback: number): number {
  const d = parseDate(iso ?? null);
  return d ? d.getTime() : fallback;
}

/**
 * 학습 진행 동기화 저장소(실서버).
 *  · GET   /api/progress          → 전체 스냅샷
 *  · POST  /api/progress/grade    → 카드 채점 보고
 *  · POST  /api/progress/attendance → 출석 도장 보고
 *
 * 쓰기는 postDurable 을 써서 네트워크가 끊겨도 유실되지 않는다(오프라인 큐 + 멱등키).
 */
export class ProgressRepository implements IProgressRepository {
  async pull(): Promise<ProgressSnapshot> {
    const dto = await apiClient.get<ProgressDTO>('/api/progress');
    const now = Date.now();

    const cards: Record<string, SrsCardState> = {};
    for (const [id, c] of Object.entries(dto.cards ?? {})) {
      cards[id] = {
        box: c.box ?? 0,
        ease: c.ease,
        dueAt: toEpoch(c.due_at, now),
        reps: c.reps ?? 0,
        lapses: c.lapses ?? 0,
        lastGrade: c.last_grade ?? null,
        lastReviewedAt: c.last_reviewed_at ? toEpoch(c.last_reviewed_at, now) : null,
      };
    }

    // 출석은 서버가 ISO 로 주고 앱은 epoch 로 쓴다.
    const attendance: Record<string, number> = {};
    for (const [day, iso] of Object.entries(dto.attendance ?? {})) {
      attendance[day] = toEpoch(iso, now);
    }

    return {
      cards,
      history: dto.history ?? {},
      attendance,
      updatedAt: dto.updated_at ?? null,
    };
  }

  async pushGrade(cardId: string, grade: Grade, state: SrsCardState): Promise<void> {
    // 멱등키에 '카드+채점시각'을 넣어, 재전송돼도 같은 채점이 두 번 반영되지 않게 한다.
    const key = `grade:${cardId}:${state.lastReviewedAt ?? Date.now()}`;
    await apiClient.postDurable('/api/progress/grade', {
      card_id: cardId,
      grade,
      box: state.box,
      ease: state.ease,
      due_at: new Date(state.dueAt).toISOString(),
      reps: state.reps,
      lapses: state.lapses,
    }, key);
  }

  async pushAttendance(dayKey: string): Promise<void> {
    // 하루 1회만 유효하므로 날짜 키 자체가 자연스러운 멱등키가 된다.
    await apiClient.postDurable('/api/progress/attendance', { day: dayKey }, `attendance:${dayKey}`);
  }
}
