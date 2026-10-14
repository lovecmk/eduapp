import type { IProgressRepository, ProgressSnapshot } from '../../../../domain/repositories/IProgressRepository';
import type { Grade, SrsCardState } from '../../../../domain/srs';
import { useSrsStore } from '../../../../store/srsStore';
import { useAttendanceStore } from '../../../../store/attendanceStore';
import { delay } from '../../../../data/repositories/_delay';

/**
 * 목업 진행 동기화 — 서버 대신 로컬 스토어를 '서버'로 삼는다.
 * 실서버 모드로 바꿔도 화면 코드가 그대로 동작하도록 인터페이스만 맞춘다.
 */
export class MockProgressRepository implements IProgressRepository {
  async pull(): Promise<ProgressSnapshot> {
    await delay(200);
    const srs = useSrsStore.getState();
    return {
      cards: srs.cards,
      history: srs.history,
      attendance: useAttendanceStore.getState().stamps,
      updatedAt: null,
    };
  }

  async pushGrade(_cardId: string, _grade: Grade, _state: SrsCardState): Promise<void> {
    // 로컬 스토어가 이미 grade() 안에서 갱신했으므로 목업에서는 할 일이 없다.
    await delay(60);
  }

  async pushAttendance(_dayKey: string): Promise<void> {
    await delay(60);
  }
}
