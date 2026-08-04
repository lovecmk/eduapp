import { resolveDailyQuota } from '../models/LearningQuota';
import type { LearningQuota } from '../models/LearningQuota';

// 하루 상한은 '관리자가 콘솔에서 정한 값'과 '이 기기가 방금 한 학습'이 만나는 자리다.
// 어느 쪽으로 기우느냐에 따라 결과가 갈린다 — 잘못 기울면 상한을 넘겨 학습하거나
// (정책이 무의미해진다), 반대로 아무것도 못 배우게 된다.

const server = (over: Partial<LearningQuota> = {}): LearningQuota => ({
  limit: 3,
  used: 0,
  remaining: 3,
  resetsAt: '2026-08-05T00:00:00.000Z',
  ...over,
});

describe('resolveDailyQuota — 상한은 서버가 정한다', () => {
  it('서버 상한을 앱 상수보다 우선한다', () => {
    // 이것이 안 되면 콘솔의 상한 설정은 아무 의미가 없다.
    expect(resolveDailyQuota(0, server({ limit: 2 }), 3).limit).toBe(2);
  });

  it('서버에 닿지 못했으면 앱 상수로 돌아간다', () => {
    // 지하에서 끊겼다고 학습이 막히면 안 된다 — 이 앱의 전제다.
    expect(resolveDailyQuota(1, undefined, 3)).toEqual({
      limit: 3,
      used: 1,
      remaining: 2,
      canLearn: true,
    });
  });

  it('상한이 0 이하로 오면 앱 상수로 되돌린다', () => {
    // 0 은 '무제한'이 아니라 실수다. 그대로 쓰면 학습이 통째로 잠긴다.
    expect(resolveDailyQuota(0, server({ limit: 0 }), 3).limit).toBe(3);
    expect(resolveDailyQuota(0, server({ limit: -1 }), 3).limit).toBe(3);
  });
});

describe('resolveDailyQuota — 사용량은 큰 쪽', () => {
  it('오프라인에서 방금 푼 것이 서버보다 앞서면 로컬을 쓴다', () => {
    // 서버는 아직 모른다(큐에 쌓여 있다). 그래도 상한은 지금 차 있어야 한다.
    expect(resolveDailyQuota(3, server({ used: 1 }), 3)).toMatchObject({
      used: 3,
      remaining: 0,
      canLearn: false,
    });
  });

  it('다른 기기에서 푼 것이 있으면 서버를 쓴다', () => {
    // 현장 태블릿은 여럿이 돌려 쓴다 — 휴대폰에서 이미 3장을 배웠다면
    // 태블릿에서 다시 3장을 배울 수 있어서는 안 된다.
    expect(resolveDailyQuota(0, server({ used: 3 }), 3)).toMatchObject({
      used: 3,
      canLearn: false,
    });
  });

  it('음수는 0으로 본다(누계를 되돌리는 값은 받아들이지 않는다)', () => {
    expect(resolveDailyQuota(-5, server({ used: -2 }), 3).used).toBe(0);
  });

  it('상한을 넘겨 세어져 있어도 남은 수는 음수가 되지 않는다', () => {
    // "-2장 남음" 같은 문구가 화면에 뜨면 안 된다.
    expect(resolveDailyQuota(5, server({ used: 5 }), 3)).toMatchObject({
      remaining: 0,
      canLearn: false,
    });
  });
});
