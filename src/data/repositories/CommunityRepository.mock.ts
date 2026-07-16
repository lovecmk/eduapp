import type { ICommunityRepository } from '../../domain/repositories/ICommunityRepository';
import type { CommunitySnapshot, LiveActivity, SafetyBuilding, BuildingMonth } from '../../domain/models/Community';
import { delay } from './_delay';

// ── 함께 짓는 안전 빌딩 (월별 초기화) ────────────────────────────────
/** 한 층을 올리는 데 필요한 공동 문제 수. */
export const BUILDING_FLOOR_SIZE = 20_000;

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d: Date, now: Date) =>
  d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}월` : `${d.getFullYear()}년 ${d.getMonth() + 1}월`;

/** 월 키 기반 결정적 시드 — 같은 달이면 항상 같은 값(서버 교체 전까지 안정적). */
function seedFor(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

/** 한 달치 빌딩 기록 계산 — 현재 달은 오늘까지 부분 진행, 지난 달은 만월 기준. */
function buildMonth(d: Date, now: Date): BuildingMonth {
  const key = monthKey(d);
  const seed = seedFor(key);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const isCurrent = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  const dayProgress = isCurrent ? now.getDate() : daysInMonth;
  const dailyBase = 7_800 + (seed % 5_400); // 하루 ~7.8k–13.2k 문제
  const problems = Math.round(dailyBase * dayProgress + (seed % 9_000));
  return { month: key, label: monthLabel(d, now), problems, floors: Math.floor(problems / BUILDING_FLOOR_SIZE) };
}

/** 이번 달(진행 중) + 지난 6개월 히스토리. */
function makeBuilding(now: Date): SafetyBuilding {
  const current = buildMonth(now, now);
  const history: BuildingMonth[] = [];
  for (let i = 1; i <= 6; i++) {
    history.push(buildMonth(new Date(now.getFullYear(), now.getMonth() - i, 1), now));
  }
  return { floorSize: BUILDING_FLOOR_SIZE, current, history };
}

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
      building: makeBuilding(new Date()),
      ...makeLeaderboard(),
    };
  }
}

/** 이번 주 기여 랭킹 목업 — 내 기여(나)를 끼워 순위를 계산한다. */
function makeLeaderboard(): Pick<CommunitySnapshot, 'leaderboard' | 'myRank'> {
  const base = [
    { name: '김안전', cards: 48, color: '#F2B705' },
    { name: '이현장', cards: 41, color: '#5C6BC0' },
    { name: '박점검', cards: 37, color: '#E2574C' },
    { name: '최예방', cards: 29, color: '#26A69A' },
    { name: '정관리', cards: 22, color: '#7E57C2' },
    { name: '나', cards: 23, color: '#2563EB' },
  ];
  base.sort((a, b) => b.cards - a.cards);
  const leaderboard = base.map((r, i) => ({ ...r, rank: i + 1, isMe: r.name === '나' }));
  const myRank = leaderboard.find((r) => r.isMe)?.rank ?? 0;
  return { leaderboard, myRank };
}

export const COMMUNITY_TOPICS = TOPICS;
