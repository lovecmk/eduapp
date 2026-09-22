import { CardMapper } from '../CardMapper';
import type { CardDTO } from '../../dto/CardDTO';

// __DEV__ 는 RN 번들 전역 — 매퍼가 개발 경고에서 참조하므로 테스트에서 정의해준다.
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

const base: CardDTO = {
  id: 'c1',
  category_cd: 'ELEC',
  question_txt: '  분전반 앞 가연물 방치가 위험한 이유는?  ',
  status_cd: 'NEW',
  due_at: null,
};

describe('CardMapper.toDomain', () => {
  it('snake_case DTO 를 camelCase 도메인으로 매핑하고 공백을 트림한다', () => {
    const card = CardMapper.toDomain({
      ...base,
      group_cd: ' RISK ',
      sub_category_nm: ' 배선설비 ',
      industry_nm: ' 물류창고 ',
      title_txt: ' 제목 ',
      format_nm: ' 상황형 ',
      answer_txt: ' 정답 ',
      improvement_txt: ' 개선 권고 ',
      note_txt: ' 참고 ',
    });
    expect(card.id).toBe('c1');
    expect(card.category).toBe('전기 위험');
    expect(card.status).toBe('new');
    expect(card.question).toBe('분전반 앞 가연물 방치가 위험한 이유는?');
    expect(card.subCategory).toBe('배선설비');
    expect(card.title).toBe('제목');
    expect(card.groupCode).toBe('RISK');
    expect(card.industry).toBe('물류창고');
    expect(card.format).toBe('상황형');
    expect(card.answer).toBe('정답');
    expect(card.improvement).toBe('개선 권고');
    expect(card.note).toBe('참고');
  });

  it('code enum 을 매핑한다 (category/status/difficulty/type)', () => {
    const card = CardMapper.toDomain({
      ...base,
      category_cd: 'HAZMAT',
      status_cd: 'MASTERED',
      difficulty_cd: 'HARD',
      card_type_cd: 'OX',
      choices: ['O', 'X'],
      answer_index: 0,
    });
    expect(card.category).toBe('위험물');
    expect(card.status).toBe('mastered');
    expect(card.difficulty).toBe('hard');
    expect(card.type).toBe('ox');
    expect(card.choices).toEqual(['O', 'X']);
    expect(card.answerIndex).toBe(0);
  });

  it('알 수 없는 category_cd 는 기본값(전기 위험)으로 안전 폴백한다', () => {
    const card = CardMapper.toDomain({ ...base, category_cd: 'UNKNOWN_XYZ' });
    expect(card.category).toBe('전기 위험');
  });

  it('선택 필드 누락 시 기본값을 채운다 (undefined 접근으로 크래시하지 않음)', () => {
    const card = CardMapper.toDomain(base);
    expect(card.keywords).toEqual([]);
    expect(card.studySeconds).toBe(40);
    expect(card.difficulty).toBe('medium');
    expect(card.type).toBe('explanation');
    expect(card.imageUrl).toBeUndefined();
    expect(card.hasImage).toBe(false);
  });

  it('due_at 이 null 이면 dueAt 은 null', () => {
    expect(CardMapper.toDomain(base).dueAt).toBeNull();
  });

  it('유효한 due_at 은 Date 로 파싱한다', () => {
    const card = CardMapper.toDomain({ ...base, due_at: '2026-02-01T00:00:00.000Z' });
    expect(card.dueAt?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('[F3] 파싱 불가한 due_at 은 Invalid Date 가 아니라 null 로 처리한다', () => {
    const card = CardMapper.toDomain({ ...base, due_at: 'garbage-date' });
    expect(card.dueAt).toBeNull(); // NaN 시각이 SRS 비교를 오염시키지 않음
  });

  it('image_url 이 있으면 hasImage=true', () => {
    const card = CardMapper.toDomain({ ...base, image_url: 'https://x/y.png' });
    expect(card.hasImage).toBe(true);
    expect(card.imageUrl).toBe('https://x/y.png');
  });

  /**
   * 문제 원본(엑셀 → BE 생성기 → cards_seed.json → DB)은 값이 없는 선택 항목을
   * 빈 칸이 아니라 **문자열 'null'** 로 흘려보낸다. 시드 생성기는 이 함정을 이미
   * 한 번 밟고 걸러 냈는데, 서버에서 그대로 내려오는 이 경로에는 방어가 없었다.
   *
   * 그대로 두면 사진이 없는 카드가 imageUrl='null' 을 갖는다 → 학습 화면에 사진
   * 칸이 열리고 → 풀 수 없으니 '불러올 수 없어요'가 뜬다. 사진이 애초에 없는
   * 카드마다 매번, 사용자는 앱이 사진을 잃어버렸다고 읽는다.
   */
  it("문자열 'null' 은 사진 없음으로 본다 (빈 사진 칸을 열지 않는다)", () => {
    const card = CardMapper.toDomain({ ...base, image_url: 'null', answer_image_url: 'NULL' });
    expect(card.imageUrl).toBeUndefined();
    expect(card.answerImageUrl).toBeUndefined();
    expect(card.hasImage).toBe(false);
  });

  it("선택 본문의 'null' 도 없는 것으로 본다 (해설에 \"null\" 이라 적힌 단계를 만들지 않는다)", () => {
    const card = CardMapper.toDomain({
      ...base,
      process_txt: 'null',
      fire_triangle_txt: 'null',
      source_txt: '  ',
    });
    expect(card.process).toBeUndefined();
    expect(card.fireTriangle).toBeUndefined();
    expect(card.source).toBeUndefined();
  });

  it('해설 사진만 있어도 사진 있는 카드로 센다', () => {
    const card = CardMapper.toDomain({ ...base, image_url: 'null', answer_image_url: '8-1' });
    expect(card.answerImageUrl).toBe('8-1');
    expect(card.hasImage).toBe(true);
  });

  it('공백만 있는 주소도 사진 없음이다', () => {
    const card = CardMapper.toDomain({ ...base, image_url: '   ' });
    expect(card.imageUrl).toBeUndefined();
    expect(card.hasImage).toBe(false);
  });

  /**
   * 학습 화면은 퀴즈 카드를 풀기 전에는 뒤집지도 넘기지도 못하게 막는다.
   * 그래서 보기가 비어 있는 퀴즈 카드가 한 장 섞이면 화면에는 고를 것이 하나도
   * 없는데 넘어갈 수도 없다 — 그날 학습이 그 자리에서 멈춘다.
   */
  it('보기가 없는 퀴즈는 설명형으로 낮춘다 (학습이 멈추지 않도록)', () => {
    const card = CardMapper.toDomain({ ...base, card_type_cd: 'CHOICE', choices: [], answer_index: 0 });
    expect(card.type).toBe('explanation');
    expect(card.choices).toBeUndefined();
  });

  /**
   * 예전에는 `answerIndex ?? 0` 이라 정답 번호가 없으면 ①번을 정답으로 꾸며 냈다.
   * 제대로 고른 사람이 오답 처리되고, 그 결과가 복습 일정(SRS)에 그대로 반영된다.
   */
  it('정답 번호가 없는 퀴즈는 채점하지 않는다 (①번을 정답으로 꾸며 내지 않는다)', () => {
    const card = CardMapper.toDomain({ ...base, card_type_cd: 'OX', choices: ['O', 'X'] });
    expect(card.type).toBe('explanation');
    expect(card.answerIndex).toBeUndefined();
  });

  it('정답 번호가 보기 범위를 벗어나도 낮춘다', () => {
    const card = CardMapper.toDomain({ ...base, card_type_cd: 'CHOICE', choices: ['가', '나'], answer_index: 5 });
    expect(card.type).toBe('explanation');
  });

  it('보기와 정답이 온전하면 그대로 퀴즈로 낸다', () => {
    const card = CardMapper.toDomain({ ...base, card_type_cd: 'CHOICE', choices: ['가', '나', '다'], answer_index: 2 });
    expect(card.type).toBe('choice');
    expect(card.choices).toEqual(['가', '나', '다']);
    expect(card.answerIndex).toBe(2);
  });

  it('설명형 카드는 보기가 없어도 그대로 설명형이다', () => {
    const card = CardMapper.toDomain({ ...base, card_type_cd: 'EXPLANATION' });
    expect(card.type).toBe('explanation');
  });

  it('toDomainList 는 전체를 매핑한다', () => {
    const list = CardMapper.toDomainList([base, { ...base, id: 'c2' }]);
    expect(list.map((c) => c.id)).toEqual(['c1', 'c2']);
  });
});

/**
 * 서버가 실제로 내보내는 분류 코드 여덟 개.
 *
 * BE `domain.CardCategories`(daily3min/domain/studio.go)와 같은 목록이다.
 * 스튜디오에서 발행되는 문제는 이 코드를 달고 나오는데, 앱의 CATEGORY_MAP 에
 * 없는 코드는 조용히 '전기 위험'으로 폴백한다 — 오류가 나지 않아서, 검수를
 * 통과한 소방시설 문제 아홉 장이 전부 '전기 위험'으로 보이던 것을 아무도
 * 알아채지 못했다. 이 시험이 그 자리를 지킨다.
 */
const SERVER_CATEGORY_CODES: Record<string, string> = {
  ELEC: '전기 위험',
  BATTERY: '전기 위험',
  PROCESS: '공정 위험',
  HAZMAT: '위험물',
  FIELD: '현장 점검',
  FIRE: '현장 점검',
  EGRESS: '현장 점검',
  SPREAD: '현장 점검',
  ETC: '현장 점검',
};

describe('CardMapper 분류 코드 계약', () => {
  it.each(Object.entries(SERVER_CATEGORY_CODES))(
    '%s 를 %s 로 접는다',
    (code, expected) => {
      const card = CardMapper.toDomain({ ...base, category_cd: code });
      expect(card.category).toBe(expected);
    },
  );

  it('서버 코드는 하나도 빠짐없이 표에 있어야 한다 (누락은 조용한 폴백이 된다)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    for (const code of Object.keys(SERVER_CATEGORY_CODES)) {
      CardMapper.toDomain({ ...base, category_cd: code });
    }
    // dto_unknown_code 경고가 한 번이라도 나면 표에 구멍이 있다는 뜻이다.
    const unknown = warn.mock.calls.filter((c) => JSON.stringify(c).includes('dto_unknown_code'));
    expect(unknown).toHaveLength(0);
    warn.mockRestore();
  });

  it('정말 모르는 코드는 폴백하되 경고를 남긴다', () => {
    const card = CardMapper.toDomain({ ...base, category_cd: 'NOPE' });
    expect(card.category).toBe('전기 위험');
  });
});
