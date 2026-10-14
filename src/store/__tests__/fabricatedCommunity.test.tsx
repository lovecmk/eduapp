// 실서버 모드에서 지어낸 '다른 사람'을 보여 주지 않는가 — 자랑 피드·현장 팁.
//
// 과거 결함: 두 스토어 모두 시드(김안전·박현장 / 박설비·김점검 …)를 모드와 상관없이
// 넣었고, 자랑 피드는 목록 전체를 저장해 한 번 들어간 시드가 계속 살아 있었다.
// 또 내가 올린 글·팁은 minutesAgo: 0 으로 저장돼 며칠이 지나도 '방금'으로 보였다.

jest.mock('../../data/network/env', () => ({ env: { useMockData: false, apiBaseUrl: 'https://api.test' } }));

// 저장소 묶음을 먼저 불러 둔다 — 목업 저장소 파일부터 불러오면 authStore ↔ repositories 순환에서
// 생성자가 아직 정의되지 않은 채로 index 가 평가된다(앱은 항상 index 쪽에서 들어온다).
import '../../data/repositories';
import { MockFeedRepository } from '../../__tests__/fixtures/data/repositories/FeedRepository.mock';
import { useShareFeedStore, postMinutesAgo } from '../shareFeedStore';
import { useTipStore, tipMinutesAgo } from '../tipStore';

describe('실서버 모드의 커뮤니티 시드', () => {
  it('자랑 피드는 빈 목록으로 시작한다', () => {
    expect(useShareFeedStore.getState().posts).toEqual([]);
  });

  it('현장 팁은 빈 목록으로 시작한다', () => {
    expect(useTipStore.getState().tips).toEqual([]);
  });

  it('이미 저장돼 버린 시드 글은 v3 이관에서 걷히고 내 글만 남는다', () => {
    const migrate = useShareFeedStore.persist.getOptions().migrate!;
    const migrated = migrate(
      { posts: [{ id: 'brag-1', mine: false }, { id: 'mybrag-1', mine: true }] },
      2,
    ) as { posts: { id: string }[] };
    expect(migrated.posts.map((p) => p.id)).toEqual(['mybrag-1']);
  });
});

describe('내가 올린 글·팁의 시각', () => {
  it('올린 시각이 있으면 지금 기준으로 센다(영원히 "방금"이 아니다)', () => {
    const now = Date.UTC(2026, 8, 30, 12, 0);
    const threeHoursAgo = now - 3 * 3600_000;
    expect(postMinutesAgo({ minutesAgo: 0, createdAt: threeHoursAgo }, now)).toBe(180);
    expect(tipMinutesAgo({ minutesAgo: 0, createdAt: threeHoursAgo }, now)).toBe(180);
  });

  it('시드처럼 올린 시각이 없으면 고정값을 쓴다', () => {
    expect(postMinutesAgo({ minutesAgo: 35 })).toBe(35);
  });

  it('새로 올린 글에는 올린 시각이 붙는다', async () => {
    const post = await new MockFeedRepository().post({
      author: '나', color: '#000', imageUri: null, aspect: 1,
      snapshot: {} as never,
    });
    expect(typeof post.createdAt).toBe('number');
    expect(useShareFeedStore.getState().posts[0].id).toBe(post.id);
  });
});
