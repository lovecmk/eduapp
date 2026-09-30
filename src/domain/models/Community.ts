// 커뮤니티/실시간 프레즌스 도메인 모델 — "혼자가 아닌 함께 학습" 경험.
export type ActivityAction = 'mastered' | 'learning' | 'streak' | 'joined';

export interface LiveActivity {
  id: string;
  /** 표시용 닉네임(마스킹) */
  name: string;
  action: ActivityAction;
  category?: string;
  /** 상대 시간 표기 (예: "방금", "2분 전") */
  timeAgo: string;
}

export interface Companion {
  id: string;
  name: string;
  /** 아바타 색상 */
  color: string;
  category?: string;
}

/** 이번 주 함께 참여하는 공동 챌린지. */
export interface WeeklyChallenge {
  title: string;
  /** 주간 공동 목표(문제 수) */
  goalCards: number;
  /** 현재까지 커뮤니티가 함께 푼 문제 수 */
  currentCards: number;
  /** 내 기여(문제 수) */
  myContribution: number;
  participants: number;
  /** 종료까지 남은 일수 */
  endsInDays: number;
}

/** 한 달치 '함께 짓는 안전 빌딩' 기록. */
export interface BuildingMonth {
  /** 'YYYY-MM' */
  month: string;
  /** 표시 라벨 (예: '1월', '2025년 12월') */
  label: string;
  /** 그 달에 커뮤니티가 함께 푼 문제 수 */
  problems: number;
  /** 그 달에 올린 층수 */
  floors: number;
  /**
   * 그 달 진영 대항전에서 이긴 진영 id ('frost' | 'flame' | 'volt').
   *
   * **서버가 정본이다** — 앱은 받아 쓰기만 하고 다시 판정하지 않는다.
   * 빈 문자열이면 '아직 집계되지 않았다'는 뜻이고(구버전 서버·학습이 없는 달),
   * 그때 화면은 우승자를 지어내지 않고 '집계 중'으로 그린다.
   */
  winner: string;
  /**
   * 진영별 기여(서버 집계, 층수 내림차순). **서버가 주지 않으면 비어 있다.**
   *
   * 예전 화면은 이 값을 서버에서 받지 않고, 그 달 전체 문제 수를 고정 비율
   * (35/34/31%)에 월별 난수를 섞어 세 진영에 나눠 그렸다 — 서버는 누가 어느 진영인지조차
   * 몰랐다. 지어낸 분배로 '선두와 3층 차'를 말하는 것은 우승자를 지어내는 것과 같은 결함이다.
   * 없으면 화면은 '집계 준비 중'을 그린다.
   */
  factions?: { id: 'frost' | 'flame' | 'volt'; problems: number; floors: number }[];
}

/**
 * 함께 짓는 안전 빌딩 — 매월 1일 0층부터 새로 쌓고, 지난 달 기록은 명예의
 * 전당(히스토리)에 남긴다. 서버가 생기면 `GET /inner/api/v1/community/building` 응답을
 * 그대로 매핑하면 되도록 월별 스냅샷 형태로 모델링한다.
 */
export interface SafetyBuilding {
  /** 한 층을 올리는 데 필요한 공동 문제 수 */
  floorSize: number;
  /** 이번 달(진행 중) */
  current: BuildingMonth;
  /** 지난 달 기록(최신월 → 과거월 순) */
  history: BuildingMonth[];
}

/** 커뮤니티 기여 랭킹 한 줄. */
export interface Contributor {
  rank: number;
  name: string;
  /** 이번 주 학습(기여) 카드 수 */
  cards: number;
  color: string;
  /** 나 자신 여부 */
  isMe: boolean;
}

export interface CommunitySnapshot {
  /** 지금 함께 접속해 학습 중인 인원(본인 포함) */
  onlineNow: number;
  /** 오늘 학습을 완료한 누적 인원 */
  studiedToday: number;
  /** 오늘 커뮤니티가 함께 쌓은 총 학습 시간(분) */
  totalMinutesToday: number;
  /** 오늘의 공동 목표(분) */
  dailyGoalMinutes: number;
  /** 함께 학습 중인 동료(아바타용) */
  companions: Companion[];
  /** 실시간 활동 피드 */
  activities: LiveActivity[];
  /** 이번 주 공동 챌린지 */
  challenge: WeeklyChallenge;
  /** 커뮤니티가 지금까지 함께 푼 누적 문제 수(계속 쌓임) */
  totalCardsAllTime: number;
  /** 함께 짓는 안전 빌딩 — 월별 초기화 + 히스토리 */
  building: SafetyBuilding;
  /** 이번 주 기여 랭킹(커뮤니티 강화) */
  leaderboard: Contributor[];
  /** 리더보드 내 내 순위(0이면 미포함) */
  myRank: number;
}
