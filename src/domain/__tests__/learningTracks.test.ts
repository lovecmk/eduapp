import { buildTrackProgress } from '../learningTracks';
import type { LearningCard } from '../models/LearningCard';

function card(id: string, patch: Partial<LearningCard> = {}): LearningCard {
  return {
    id, category: '현장 점검', groupCode: 'MEASURE', taxonomyCategoryCode: 'WATEREXT',
    taxonomyCategory: '수계소화설비', subCategory: '스프링클러설비', topic: '', keywords: [],
    title: id, difficulty: 'medium', studySeconds: 20, situation: '', question: id,
    principle: '해설', conclusion: '정답', hasImage: false, status: 'new', dueAt: null, ...patch,
  };
}

it('현장 점검 집계에 묶인 서로 다른 정본 분류를 누락 없이 과정으로 보여준다', () => {
  const cards = [
    card('water'),
    card('alarm', { taxonomyCategoryCode: 'ALARM', taxonomyCategory: '경보설비' }),
    card('egress', { taxonomyCategoryCode: 'EGRESS', taxonomyCategory: '피난시설' }),
    card('gas', { groupCode: 'RISK', category: '위험물', taxonomyCategoryCode: 'GAS', taxonomyCategory: '가스' }),
  ];
  const tracks = buildTrackProgress(cards);
  expect(tracks.map(t => t.track.title).sort()).toEqual(['가스', '경보설비', '수계소화설비', '피난시설'].sort());
  expect(tracks.flatMap(t => t.cards.map(c => c.id)).sort()).toEqual(cards.map(c => c.id).sort());
  expect(tracks.reduce((n, t) => n + t.total, 0)).toBe(4);
  expect(tracks.find(t => t.track.title === '경보설비')?.track.subtitle).toBe('방호요인');
  expect(tracks[0].track.subtitle).toBe('위험요인');
  expect(tracks.every(t => !t.track.locked && !t.track.level)).toBe(true);
});

it('과정별 난이도와 실제 완료 상태만 집계하며 다른 과정의 진도를 섞지 않는다', () => {
  const tracks = buildTrackProgress([
    card('a', { difficulty: 'easy', status: 'mastered' }),
    card('b', { difficulty: 'medium', status: 'learning' }),
    card('c', { difficulty: 'hard', status: 'mastered' }),
    card('d', { taxonomyCategoryCode: 'ALARM', taxonomyCategory: '경보설비' }),
  ]);
  const water = tracks.find(t => t.track.title === '수계소화설비')!;
  expect([water.total, water.mastered, water.pct]).toEqual([3, 2, 67]);
  expect(Object.values(water.byDifficulty).map(rows => rows.length)).toEqual([1, 1, 1]);
  expect(tracks.find(t => t.track.title === '경보설비')?.pct).toBe(0);
});

it('실제 카드가 없는 고정 과정이나 자격 과정 예고를 생성하지 않는다', () => {
  expect(buildTrackProgress([])).toEqual([]);
  const tracks = buildTrackProgress([card('a')]);
  expect(tracks).toHaveLength(1);
  expect(tracks[0].track.title).toBe('수계소화설비');
});

it('구형 서버의 정본 분류 누락 시 받은 집계 분류를 그대로 사용한다', () => {
  const tracks = buildTrackProgress([
    card('old', { taxonomyCategoryCode: undefined, taxonomyCategory: undefined, groupCode: undefined }),
  ]);
  expect(tracks[0].track.title).toBe('현장 점검');
  expect(tracks[0].total).toBe(1);
});

it('알 수 없는 코드도 전기로 추정하지 않고 원문 분류명과 안전한 기본 스타일을 쓴다', () => {
  const tracks = buildTrackProgress([card('unknown', {
    taxonomyCategoryCode: '__proto__', taxonomyCategory: '신규 분류', groupCode: 'constructor',
  })]);
  expect(tracks[0].track).toMatchObject({ title: '신규 분류', subtitle: '분류별 학습', icon: 'document-text', color: '#0EA5E9' });
});

it('기타 분류를 추정하여 재분류하지 않고 같은 이름의 다른 경로도 합치지 않는다', () => {
  const tracks = buildTrackProgress([
    card('uncertain', { taxonomyCategoryCode: 'ETC', taxonomyCategory: '기타', groupCode: '', question: '스프링클러 문제' }),
    card('a', { taxonomyCategoryCode: 'ONE', taxonomyCategory: '동일 명칭', groupCode: 'RISK' }),
    card('b', { taxonomyCategoryCode: 'TWO', taxonomyCategory: '동일 명칭', groupCode: 'MEASURE' }),
  ]);
  expect(tracks).toHaveLength(3);
  expect(tracks.find(t => t.cards[0].id === 'uncertain')?.track.title).toBe('기타');
  expect(new Set(tracks.map(t => t.track.id)).size).toBe(3);
});
