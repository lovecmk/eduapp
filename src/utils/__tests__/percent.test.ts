import { percent } from '../percent';

/**
 * 막대 하나가 거짓말을 하면 사용자는 그 화면 전체를 믿지 않게 된다.
 * 여기서 막는 것은 '계산할 수 없는 값이 100% 로 보이는 것'이다.
 */
describe('percent', () => {
  it('보통의 진행률을 반올림해 준다', () => {
    expect(percent(45, 90)).toBe(50);
    expect(percent(1, 3)).toBe(33);
  });

  it('목표가 없으면(0) 0 이다 — NaN 도 100 도 아니다', () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(120, 0)).toBe(0);
    expect(percent(5, -10)).toBe(0);
  });

  it('음수 진행률은 0 으로 막는다(뺄셈으로 만든 값이 뒤집혀도)', () => {
    expect(percent(-5, 10)).toBe(0);
  });

  it('100 을 넘지 않는다', () => {
    expect(percent(300, 100)).toBe(100);
  });

  it('숫자가 아닌 값이 새어 들어와도 0 이다', () => {
    expect(percent(NaN, 10)).toBe(0);
    expect(percent(10, NaN)).toBe(0);
    expect(percent(Infinity, 10)).toBe(0);
  });
});
