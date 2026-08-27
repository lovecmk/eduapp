// 카드 사진 주소 해석 — 앱에서 사진이 안 보이던 원인이 여기 있었다.
//
// 서버가 발행하는 image_url 은 호스트가 없는 경로('/inner/api/v1/cards/images/…')다.
// 예전 resolveCardImage 는 그것을 풀지 못하고 undefined 를 돌려줬고, 화면들은
// undefined 면 사진 칸을 통째로 그리지 않았다 — 콘솔에서 사진을 붙여 발행한
// 카드가 앱에서는 사진 없는 카드가 됐다. 오류도 로그도 남지 않는 실패라
// 시험으로 잠가 둔다(앞으로 사진은 대부분 이 경로로 들어온다).
import { resolveCardImage, hasCardImage, CARD_IMAGES } from '../cardImages';

jest.mock('../network/env', () => ({ env: { apiBaseUrl: 'https://bridge.kfpa.or.kr' } }));
jest.mock('../storage/secureStorage', () => ({
  peekItem: jest.fn(() => 'tok-123'),
  StorageKeys: { accessToken: 'accessToken' },
}));

describe('hasCardImage', () => {
  it('값이 있으면 참 — 푸는 데 성공했는지와는 다른 질문이다', () => {
    expect(hasCardImage('1-1')).toBe(true);
    expect(hasCardImage('/inner/api/v1/cards/images/zz')).toBe(true);
    // 못 푸는 값이라도 '사진이 있다고 말하는' 것은 사실이다 — 화면은 자리를 남겨야 한다.
    expect(hasCardImage('알 수 없는 값')).toBe(true);
  });

  it('비었거나 공백뿐이면 거짓', () => {
    expect(hasCardImage(undefined)).toBe(false);
    expect(hasCardImage('')).toBe(false);
    expect(hasCardImage('   ')).toBe(false);
  });
});

describe('resolveCardImage', () => {
  it('번들 키는 번들 사진으로 푼다', () => {
    expect(resolveCardImage('1-1')).toBe(CARD_IMAGES['1-1']);
    // 엑셀에서 새로 들어온 사진들도 등록되어 있어야 한다.
    for (const key of ['7', '8-1', '8-2', '9', '10', '11']) {
      expect(resolveCardImage(key)).toBe(CARD_IMAGES[key]);
    }
  });

  it('서버 경로는 호스트를 붙이고 토큰을 함께 싣는다', () => {
    const src = resolveCardImage('/inner/api/v1/cards/images/abc') as {
      uri: string;
      headers?: Record<string, string>;
    };
    expect(src.uri).toBe('https://bridge.kfpa.or.kr/inner/api/v1/cards/images/abc');
    expect(src.headers?.Authorization).toBe('Bearer tok-123');
  });

  it('절대 주소는 그대로 쓴다', () => {
    expect(resolveCardImage('https://example.com/a.png')).toEqual({ uri: 'https://example.com/a.png' });
  });

  it('앞뒤 공백은 값의 일부가 아니다', () => {
    expect(resolveCardImage('  1-1  ')).toBe(CARD_IMAGES['1-1']);
  });

  it('빈 값과 모르는 값은 풀지 못한다(그래도 화면은 자리를 남긴다 — hasCardImage 참고)', () => {
    expect(resolveCardImage(undefined)).toBeUndefined();
    expect(resolveCardImage('')).toBeUndefined();
    expect(resolveCardImage('없는키')).toBeUndefined();
  });
});

describe('시드가 가리키는 사진이 실제로 있는가', () => {
  // 이것이 이 파일에서 가장 중요한 시험이다.
  //
  // 사진은 앞으로도 계속 늘어난다(엑셀 갱신 → 시드 재생성). 그때 사진 파일을
  // assets/img 에 넣는 것을 잊으면 **아무 일도 일어나지 않는다** — 빌드도
  // 타입검사도 통과하고, 배포된 앱에서 그 카드만 사진이 비어 있다. 사진이 곧
  // 문제인 카드에서는 그 한 장이 풀 수 없는 문제가 된다.
  //
  // 그래서 시드가 가리키는 모든 키를 여기서 훑는다. 새 사진을 등록하지 않고
  // 시드만 갱신하면 이 시험이 먼저 막는다.
  const { CARD_SEED } = require('../cards.seed') as typeof import('../cards.seed');

  const refs = CARD_SEED.flatMap((c) => [c.imageUrl, c.answerImageUrl]).filter(
    (v): v is string => !!v && !v.startsWith('/') && !/^https?:\/\//i.test(v),
  );

  it('시드에 사진을 가진 카드가 실제로 있다(빈 목록을 통과시키지 않는다)', () => {
    expect(refs.length).toBeGreaterThan(0);
  });

  it('시드가 가리키는 번들 키가 모두 등록되어 있다', () => {
    const missing = [...new Set(refs)].filter((k) => !CARD_IMAGES[k]);
    expect(missing).toEqual([]);
  });

  it('hasImage 는 실제로 사진 값을 가진 카드에만 켜져 있다', () => {
    for (const c of CARD_SEED) {
      expect(c.hasImage).toBe(Boolean(c.imageUrl || c.answerImageUrl));
    }
  });
});
