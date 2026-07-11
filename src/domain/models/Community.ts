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
}
