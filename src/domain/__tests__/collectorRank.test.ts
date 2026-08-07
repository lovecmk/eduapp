import { collectorTier, cardsToNextTier, COLLECTOR_THRESHOLDS } from '../collectorRank';
import { COLLECTIBLES } from '../../data/collectibles';
import { RARITY_ORDER } from '../../utils/rarity';
import { PITY_LEGENDARY_HARD } from '../packDraw';

const TOTAL = COLLECTIBLES.length;

describe('수집가 등급', () => {
  it('한 장도 없으면 뱃지를 달지 않는다', () => {
    expect(collectorTier(0, TOTAL)).toBeNull();
  });

  it('한 장이라도 모으면 시작 등급이 붙는다', () => {
    expect(collectorTier(1, TOTAL)).toBe('common');
  });

  it('임계값이 오름차순이고 최고 등급은 쉽게 닿지 않는다', () => {
    for (let i = 1; i < RARITY_ORDER.length; i++) {
      expect(COLLECTOR_THRESHOLDS[RARITY_ORDER[i]]).toBeGreaterThan(COLLECTOR_THRESHOLDS[RARITY_ORDER[i - 1]]);
    }
    // 최고 등급은 도감의 절반을 훌쩍 넘겨야 한다 — 아니면 뱃지가 다시 무의미해진다.
    expect(COLLECTOR_THRESHOLDS.legendary).toBeGreaterThan(0.7);
  });

  it('수집률 구간마다 등급이 올라간다', () => {
    expect(collectorTier(Math.ceil(0.25 * TOTAL), TOTAL)).toBe('rare');
    expect(collectorTier(Math.ceil(0.5 * TOTAL), TOTAL)).toBe('epic');
    expect(collectorTier(Math.ceil(0.8 * TOTAL), TOTAL)).toBe('legendary');
    expect(collectorTier(TOTAL, TOTAL)).toBe('legendary');
  });

  it('임계값 바로 아래에서는 아직 오르지 않는다', () => {
    expect(collectorTier(Math.ceil(0.25 * TOTAL) - 1, TOTAL)).toBe('common');
    expect(collectorTier(Math.ceil(0.8 * TOTAL) - 1, TOTAL)).toBe('epic');
  });

  it('다이아몬드 카드 한 장으로는 최고 뱃지가 되지 않는다', () => {
    // 이게 이 변경의 핵심이다. 천장이 60팩 안에 다이아몬드를 보장하므로
    // '보유한 최고 등급' 기준이면 한 달 쓴 사람 전원이 최고 뱃지를 단다.
    expect(PITY_LEGENDARY_HARD).toBeLessThan(100);
    expect(collectorTier(5, TOTAL)).toBe('common');
  });
});

describe('다음 등급까지', () => {
  it('남은 종수를 알려준다', () => {
    const next = cardsToNextTier(1, TOTAL);
    expect(next?.tier).toBe('rare');
    expect(next?.remaining).toBe(Math.ceil(0.25 * TOTAL) - 1);
  });

  it('아직 시작 전이면 첫 등급을 가리킨다', () => {
    expect(cardsToNextTier(0, TOTAL)?.tier).toBe('common');
  });

  it('최고 등급이면 더 없다', () => {
    expect(cardsToNextTier(TOTAL, TOTAL)).toBeNull();
  });
});
