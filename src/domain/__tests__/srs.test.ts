import {
  initialState,
  schedule,
  isDue,
  easeOf,
  humanizeInterval,
  memoryStrength,
  boxIntervalMs,
  predictLabel,
  DEFAULT_EASE,
  MIN_EASE,
  MAX_EASE,
  MAX_BOX,
  AGAIN_REPOSITION_DAYS,
  FREQUENT_LAPSE_THRESHOLD,
  type SrsCardState,
} from '../srs';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
const days = (state: SrsCardState) => (state.dueAt - NOW) / DAY;

describe('initialState', () => {
  it('새 카드는 박스 0 · 기본 쉬움 계수로 시작하고 즉시 학습 대상이다', () => {
    const s = initialState(NOW);
    expect(s.box).toBe(0);
    expect(s.ease).toBe(DEFAULT_EASE);
    expect(s.reps).toBe(0);
    expect(s.lapses).toBe(0);
    expect(isDue(s, NOW)).toBe(true);
  });
});

describe('easeOf (구버전 데이터 호환)', () => {
  it('ease 가 없으면 기본값으로 본다', () => {
    expect(easeOf({} as SrsCardState)).toBe(DEFAULT_EASE);
  });
  it('범위를 벗어난 값은 잘라낸다', () => {
    expect(easeOf({ ease: 99 })).toBe(MAX_EASE);
    expect(easeOf({ ease: 0.1 })).toBe(MIN_EASE);
    expect(easeOf({ ease: Number.NaN })).toBe(DEFAULT_EASE);
  });
});

describe("schedule — '이해했어요'(good)", () => {
  it('박스가 올라가고 다음 복습이 미래로 잡힌다', () => {
    const s = schedule(initialState(NOW), 'good', NOW);
    expect(s.box).toBe(1);
    expect(s.dueAt).toBeGreaterThan(NOW);
    expect(s.reps).toBe(1);
    expect(s.lastGrade).toBe('good');
  });

  it('연속으로 이해하면 간격이 점점 길어진다', () => {
    let s = initialState(NOW);
    const gaps: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = schedule(s, 'good', NOW);
      gaps.push(s.dueAt - NOW);
    }
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
  });

  it('이해가 쌓이면 쉬움 계수가 올라간다(상한 유지)', () => {
    let s = initialState(NOW);
    for (let i = 0; i < 20; i++) s = schedule(s, 'good', NOW);
    expect(easeOf(s)).toBeGreaterThan(DEFAULT_EASE);
    expect(easeOf(s)).toBeLessThanOrEqual(MAX_EASE);
  });

  it('박스는 최대치를 넘지 않는다', () => {
    let s = initialState(NOW);
    for (let i = 0; i < 20; i++) s = schedule(s, 'good', NOW);
    expect(s.box).toBe(MAX_BOX);
  });
});

describe("schedule — '다음에 한번 더'(again)", () => {
  it('박스 0 으로 강등되고 망각 횟수가 는다', () => {
    const s = schedule(schedule(initialState(NOW), 'good', NOW), 'again', NOW);
    expect(s.box).toBe(0);
    expect(s.lapses).toBe(1);
    expect(s.lastGrade).toBe('again');
  });

  it('처음 잊었으면 3학습일 뒤에 다시 만난다', () => {
    const s = schedule(initialState(NOW), 'again', NOW);
    expect(days(s)).toBeCloseTo(AGAIN_REPOSITION_DAYS, 5);
  });

  it('반복해서 잊는 카드는 더 빨리(다음 날) 다시 만난다', () => {
    let s = initialState(NOW);
    s = schedule(s, 'again', NOW); // 1회차 → 3일
    expect(days(s)).toBeCloseTo(AGAIN_REPOSITION_DAYS, 5);
    s = schedule(s, 'again', NOW); // 2회차 → 1일
    expect(s.lapses).toBeGreaterThanOrEqual(FREQUENT_LAPSE_THRESHOLD);
    expect(days(s)).toBeCloseTo(1, 5);
  });

  it('자주 잊으면 쉬움 계수가 내려가 간격이 좁아진다(하한 유지)', () => {
    let s = initialState(NOW);
    for (let i = 0; i < 20; i++) s = schedule(s, 'again', NOW);
    expect(easeOf(s)).toBe(MIN_EASE);
  });

  it('같은 박스라도 계수가 낮은 카드가 더 빨리 돌아온다', () => {
    const easy: SrsCardState = { ...initialState(NOW), box: 2, ease: MAX_EASE };
    const hardCard: SrsCardState = { ...initialState(NOW), box: 2, ease: MIN_EASE };
    const a = schedule(easy, 'good', NOW);
    const b = schedule(hardCard, 'good', NOW);
    expect(a.dueAt).toBeGreaterThan(b.dueAt);
  });
});

describe('schedule — hard / easy', () => {
  it('hard 는 박스를 유지하고 최소 하루는 뒤로 민다', () => {
    const s = schedule({ ...initialState(NOW), box: 3 }, 'hard', NOW);
    expect(s.box).toBe(3);
    expect(days(s)).toBeGreaterThanOrEqual(1);
  });
  it('easy 는 박스를 두 단계 올린다', () => {
    const s = schedule({ ...initialState(NOW), box: 1 }, 'easy', NOW);
    expect(s.box).toBe(3);
  });
});

describe('보조 함수', () => {
  it('boxIntervalMs 는 범위를 벗어난 박스도 안전하게 처리한다', () => {
    expect(boxIntervalMs(-5)).toBeGreaterThan(0);
    expect(boxIntervalMs(99)).toBe(boxIntervalMs(MAX_BOX));
  });
  it('humanizeInterval 은 사람이 읽는 문구를 만든다', () => {
    expect(humanizeInterval(0)).toBe('지금');
    expect(humanizeInterval(30 * 60_000)).toContain('분');
    expect(humanizeInterval(3 * DAY)).toBe('3일');
    expect(humanizeInterval(60 * DAY)).toContain('개월');
  });
  it('predictLabel 은 채점 시 보여줄 다음 간격을 알려준다', () => {
    expect(predictLabel(initialState(NOW), 'again', NOW)).toBe('3일');
    expect(predictLabel(initialState(NOW), 'good', NOW)).toMatch(/일|시간|개월/);
  });
  it('memoryStrength 는 0~1 로 정규화한다', () => {
    expect(memoryStrength(0)).toBe(0);
    expect(memoryStrength(MAX_BOX)).toBe(1);
    expect(memoryStrength(99)).toBe(1);
  });
});
