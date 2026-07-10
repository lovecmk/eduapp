import type { ICommunityRepository } from '../../domain/repositories/ICommunityRepository';
import type { CommunitySnapshot, LiveActivity } from '../../domain/models/Community';
import { delay } from './_delay';

const NAMES = ['김점검', '이안전', '박설비', '최구조', '정소방', '한전기', '오승강', '강건축', '조방재', '윤진단', '서관리', '문점검'];
const CATEGORIES = ['건축', '구조', '기계설비', '전기', '소방', '승강기'];
const TOPICS = ['옥내소화전', '절연저항', '철근 피복', '제연설비', '조속기', '균열 평가', '접지저항', '저수조'];
const COLORS = ['#5C6BC0', '#26A69A', '#F2B705', '#E2574C', '#7E57C2', '#8D6E63'];

const pick = <T,>(arr: readonly T[], seed: number): T => arr[Math.abs(seed) % arr.length];

/** 하루 경과에 따라 자연스럽게 변하는 기준선(아침엔 적고 저녁에 많아짐). */
function dayCurve(): number {
  const h = new Date().getHours();
  // 08~22시 사이 활동 피크, 그 외엔 완만.
  const peak = 1 - Math.abs(15 - h) / 15;
  return Math.max(0.15, peak);
}

function buildActivities(count: number): LiveActivity[] {
  const now = Date.now();
  return Array.from({ length: count }).map((_, i) => {
    const seed = Math.floor(now / 9000) + i * 7;
    const actions = ['mastered', 'learning', 'streak', 'joined'] as const;
    const action = pick(actions, seed);
    return {
      id: `act-${seed}`,
      name: pick(NAMES, seed),
      action,
      category: action === 'joined' ? undefined : pick(CATEGORIES, seed + 3),
      timeAgo: i === 0 ? '방금' : `${i * 2 + (seed % 3)}분 전`,
    };
  });
}

/**
 * 실시간 커뮤니티 프레즌스 목업.
 * 시간대 곡선 + 약간의 난수로 폴링할 때마다 값이 자연스럽게 요동쳐 "라이브"처럼 보인다.
 * 실서버(기존 플랫폼 or Golang/Mongo)의 `GET /api/community/live` 로 교체 가능.
 */
export class MockCommunityRepository implements ICommunityRepository {
  async getSnapshot(): Promise<CommunitySnapshot> {
    await delay(400);
    const curve = dayCurve();
    const jitter = () => Math.round((Math.random() - 0.5) * 6);

    const onlineNow = Math.max(3, Math.round(120 * curve) + jitter());
    const studiedToday = 480 + Math.round(1600 * curve) + Math.abs(jitter()) * 3;
    const totalMinutesToday = studiedToday * 3; // 1인당 약 3분 학습
    const dailyGoalMinutes = 9000;

    const companions = Array.from({ length: 5 }).map((_, i) => {
      const seed = Math.floor(Date.now() / 12000) + i * 5;
      return {
        id: `cmp-${i}`,
        name: pick(NAMES, seed),
        color: pick(COLORS, seed),
        category: pick(CATEGORIES, seed + 1),
      };
    });

    return {
      onlineNow,
      studiedToday,
      totalMinutesToday,
      dailyGoalMinutes,
      companions,
      activities: buildActivities(6),
    };
  }
}

export const COMMUNITY_TOPICS = TOPICS;
