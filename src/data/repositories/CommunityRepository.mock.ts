import type { ICommunityRepository } from '../../domain/repositories/ICommunityRepository';
import type { CommunitySnapshot, LiveActivity } from '../../domain/models/Community';
import { delay } from './_delay';

const NAMES = ['김점검', '이안전', '박설비', '최공정', '정위험', '한전기', '오도장', '강분진', '조방재', '윤진단', '서관리', '문점검'];
const CATEGORIES = ['전기 위험', '공정 위험', '위험물'];
const TOPICS = ['절연파괴', '접촉불량', '분무도장', '위험장소', '마그네슘 분진', '정전기', '접지·본딩', '분진폭발'];
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

    // 주간 공동 챌린지 — 주 중반 진척(시간대 곡선 반영), 남은 일수는 요일 기반.
    const dow = new Date().getDay();
    const goalCards = 5000;
    const currentCards = Math.round(goalCards * (0.35 + (dow / 7) * 0.5) + jitter() * 10);

    // 누적 공동 문제 수 — 시작일 이후 매일 쌓이는 값(계속 증가).
    const START = new Date('2026-01-01').getTime();
    const daysSince = Math.max(0, Math.floor((Date.now() - START) / 86_400_000));
    const totalCardsAllTime = 128_400 + daysSince * 2450 + Math.round(curve * 1800) + Math.abs(jitter()) * 20;

    return {
      onlineNow,
      studiedToday,
      totalMinutesToday,
      dailyGoalMinutes,
      companions,
      activities: buildActivities(6),
      challenge: {
        title: '이번 주 안전점검 마스터 챌린지',
        goalCards,
        currentCards: Math.min(goalCards, currentCards),
        myContribution: 12 + Math.abs(jitter()),
        participants: 1240 + Math.abs(jitter()) * 5,
        endsInDays: Math.max(1, 7 - dow),
      },
      totalCardsAllTime,
    };
  }
}

export const COMMUNITY_TOPICS = TOPICS;
