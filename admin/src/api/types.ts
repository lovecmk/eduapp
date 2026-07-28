/**
 * Go 백엔드(internal/service, internal/domain)의 JSON 계약을 그대로 옮긴 타입.
 *
 * 여기가 서버와 화면 사이의 유일한 계약이다. 서버 구조체의 json 태그를 바꾸면
 * 이 파일도 함께 바꿔야 하고, 그러면 타입 검사가 사용처를 전부 잡아 준다.
 */

// ── 인증 ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  login_id?: string;
  user_nm: string;
  nickname?: string;
  email_addr: string;
  org_nm?: string;
  job_title?: string;
  membership_cd?: string;
  created_at: string;
  status_cd: string;
}

export interface AuthResult {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}

// ── 실시간 지표 ───────────────────────────────────────────────────────────────

export interface TrafficPoint {
  minute: string;
  requests: number;
  errors: number;
  rejected: number;
  avg_ms: number;
  max_ms: number;
}

export interface PathStat {
  path: string;
  count: number;
  errors: number;
  avg_ms: number;
}

export interface RecentEvent {
  at: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  user_id: string;
  slow: boolean;
}

export interface MetricsSnapshot {
  started_at: string;
  uptime_seconds: number;
  total_requests: number;
  total_errors: number;
  total_rejected: number;
  error_rate: number;
  requests_per_min: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  active_users: number;
  traffic: TrafficPoint[];
  top_paths: PathStat[];
  recent: RecentEvent[];
}

// ── 대시보드 ──────────────────────────────────────────────────────────────────

export interface UserSummary {
  total: number;
  admins: number;
  new_today: number;
  new_7days: number;
  active_5m: number;
  suspended: number;
}

export interface CategoryCount {
  code: string;
  label: string;
  count: number;
}

export interface LabelCount {
  label: string;
  count: number;
}

export interface UntouchedCard {
  id: string;
  title: string;
  category: string;
  learning: number;
  mastered: number;
}

export interface ContentSummary {
  /** 접수된 신고 건수 — 가장 급한 숫자다. */
  reports: number;
  total_cards: number;
  by_category: CategoryCount[];
  by_type: LabelCount[];
  by_difficulty: LabelCount[];
  untouched: UntouchedCard[];
}

export interface LearningSummary {
  new: number;
  learning: number;
  mastered: number;
  rate: number;
}

export interface ServiceStatus {
  store: string;
  store_healthy: boolean;
  store_error?: string;
  uptime_seconds: number;
  checked_at: string;
}

export interface Dashboard {
  users: UserSummary;
  content: ContentSummary;
  learning: LearningSummary;
  metrics: MetricsSnapshot;
  service: ServiceStatus;
}

// ── 사용자 관리 ───────────────────────────────────────────────────────────────

export type RoleCd = 'USER' | 'ADMIN';
export type StatusCd = 'A' | 'I' | 'D';

export interface AdminUser {
  id: string;
  login_id: string;
  user_nm: string;
  nickname: string;
  email_addr: string;
  org_nm: string;
  job_title: string;
  membership_cd: string;
  role_cd: RoleCd;
  status_cd: string;
  created_at: string;
}

export interface UserPage {
  items: AdminUser[];
  total: number;
  offset: number;
  limit: number;
}

export interface UserDetail {
  user: AdminUser;
  learning: LearningSummary;
}

export interface UserQuery {
  search?: string;
  role?: string;
  status?: string;
  membership?: string;
  offset?: number;
  limit?: number;
  /** created_at | user_nm | login_id | role_cd | status_cd — 서버가 허용 값으로 좁힌다. */
  sort?: string;
  /** 'desc' 만 내림차순으로 해석된다. */
  dir?: string;
}

// ── 문제(카드) 관리 ────────────────────────────────────────────────────────────

export type CardType = 'EXPLANATION' | 'OX' | 'CHOICE';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

/** domain.Card 와 1:1. 앱의 카드 시드 파일과도 같은 형식이다. */
export interface Card {
  id: string;
  category_cd: string;
  sub_category_nm: string;
  topic_nm: string;
  keywords: string[] | null;
  title_txt: string;
  study_seconds: number;
  situation_txt: string;
  question_txt: string;
  image_url: string;
  principle_txt: string;
  process_txt: string;
  fire_triangle_txt: string;
  conclusion_txt: string;
  answer_image_url: string;
  source_txt: string;
  difficulty_cd: Difficulty;
  card_type_cd: CardType;
  choices: string[] | null;
  answer_index: number | null;
}

/** 목록에서는 전체 사용자 기준 학습 현황이 함께 온다. */
export interface AdminCard extends Card {
  learning: number;
  mastered: number;
}

export interface CardPage {
  items: AdminCard[];
  total: number;
  offset: number;
  limit: number;
}

export interface CardQuery {
  search?: string;
  category?: string;
  type?: string;
  offset?: number;
  limit?: number;
  /** title | category | type | difficulty | learning | mastered */
  sort?: string;
  dir?: string;
}

// ── 감사 로그 ─────────────────────────────────────────────────────────────────

/** 접수된 문제 신고 한 건 — 서버가 카드 제목·신고자 이름을 붙여서 준다. */
export interface AdminReport {
  id: string;
  user_id: string;
  card_id: string;
  reason: string;
  detail: string;
  created_at: string;
  card_title: string;
  card_category: string;
  /** 신고된 카드가 이미 삭제됐다. 없는 카드를 계속 찾지 않도록 표시한다. */
  card_missing: boolean;
  reporter_name: string;
}

/** 공지 발송 요청. user_id 가 비면 전체 발송. */
export interface NotifyInput {
  title_txt: string;
  desc_txt: string;
  type_cd: string;
  user_id?: string;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  summary: string;
  created_at: string;
}

/** 새 문제의 초기값 — 유효성 규칙을 이미 만족하는 상태에서 시작한다. */
export function emptyCard(): Card {
  return {
    id: '',
    category_cd: 'ELEC',
    sub_category_nm: '',
    topic_nm: '',
    keywords: [],
    title_txt: '',
    study_seconds: 60,
    situation_txt: '',
    question_txt: '',
    image_url: '',
    principle_txt: '',
    process_txt: '',
    fire_triangle_txt: '',
    conclusion_txt: '',
    answer_image_url: '',
    source_txt: '',
    difficulty_cd: 'MEDIUM',
    card_type_cd: 'EXPLANATION',
    choices: null,
    answer_index: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 분석(insight) — 서버의 service.Insight 와 짝을 이룬다.
// 필드 이름이 어긋나면 화면이 조용히 빈칸을 그리므로 JSON 태그와 1:1로 맞춘다.
// ─────────────────────────────────────────────────────────────────────────────

/** 이 분석을 얼마나 믿어도 되는가 — 어떤 수치보다 먼저 읽어야 한다. */
export interface Coverage {
  users: number;
  learners_with_data: number;
  cards: number;
  cards_with_data: number;
  activity_days: number;
  verdict: string;
  trustworthy: boolean;
}

export type Severity = 'critical' | 'warn' | 'info' | 'good';

/** "지금 무엇을 해야 하는가" 한 줄. */
export interface Headline {
  severity: Severity;
  title: string;
  detail: string;
  metric: string;
  link?: string;
}

/** 선언 난이도 vs 실제 실패율. */
export interface CardCalibration {
  card_id: string;
  title: string;
  category: string;
  declared: string;
  learners: number;
  reps: number;
  lapse_rate: number;
  expected: number;
  gap: number;
  verdict: 'harder' | 'easier' | 'ok';
  suggested: string;
}

export interface CategoryInsight {
  category: string;
  cards: number;
  learners: number;
  reps: number;
  lapse_rate: number;
  mastery_rate: number;
  reports: number;
  ratio: number;
}

export interface OrgInsight {
  org: string;
  members: number;
  started: number;
  habitual: number;
  at_risk: number;
  avg_cards: number;
  mastery_rate: number;
  adoption_rate: number;
}

export interface ChurnEntry {
  user_id: string;
  name: string;
  org: string;
  cards: number;
  days_away: number;
  tier: 'cooling' | 'at_risk' | 'dormant';
  worth: number;
}

export interface ChurnBreakdown {
  active: number;
  cooling: number;
  at_risk: number;
  dormant: number;
  top: ChurnEntry[];
}

export interface FunnelStage {
  stage: string;
  count: number;
  rate: number;
  drop: number;
}

export interface RetentionCohort {
  cohort: string;
  size: number;
  weekly: number[];
}

export interface ActivityPoint {
  day: string;
  users: number;
  weekday: number;
}

export interface Anomaly {
  day: string;
  users: number;
  expected: number;
  deviation: number;
  direction: 'spike' | 'drop';
}

export interface DeadCard {
  card_id: string;
  title: string;
  category: string;
  learners: number;
}

export interface Insight {
  generated_at: string;
  coverage: Coverage;
  headlines: Headline[];
  calibration: CardCalibration[];
  categories: CategoryInsight[];
  orgs: OrgInsight[];
  churn: ChurnBreakdown;
  funnel: FunnelStage[];
  retention: RetentionCohort[];
  activity: ActivityPoint[];
  anomalies: Anomaly[];
  dead_content: DeadCard[];
}
