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
  /** **아직 처리되지 않은** 신고 건수 — 가장 급한 숫자다. 처리하면 줄어든다. */
  reports: number;
  /** 처리된 것을 포함한 전체 신고 건수(추이 참고용). */
  reports_total: number;
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
  /** 지금 걸려 있는 운영 설정 — 상단 바가 점검 모드를 상시 표시하는 데 쓴다. */
  ops: OpsSettings;
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

/** 신고 처리 단계. 빈 값은 서버가 OPEN 으로 해석해서 준다. */
export type ReportStatus = 'OPEN' | 'DOING' | 'RESOLVED' | 'REJECTED';

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

  /** 처리 단계 — 서버가 항상 해석된 값을 싣는다(빈 문자열이 오지 않는다). */
  status_cd: ReportStatus;
  resolution_txt: string;
  handler_id: string;
  handler_name: string;
  handled_at: string | null;
}

/**
 * 신고 목록 한 페이지 + 단계별 **전체** 건수.
 *
 * counts 가 목록과 함께 오는 이유: 상태 칩("미처리 3 · 완료 128")은 지금 걸린
 * 필터 바깥의 숫자까지 보여 줘야 고를 값이 있는지 알 수 있다.
 */
export interface ReportPage {
  items: AdminReport[];
  counts: Partial<Record<ReportStatus, number>>;
  /** 아직 손이 필요한 건수(OPEN+DOING) — 상단 바 배지가 읽는 값. */
  pending: number;
}

// ── 공지 센터 ─────────────────────────────────────────────────────────────────

/** 공지 수신 대상의 지정 방식. */
export type AudienceKind = 'ALL' | 'ROLE' | 'MEMBERSHIP' | 'ORG' | 'USER';

/** 공지 발송 요청. audience_cd 가 비면 전체 발송. */
export interface NotifyInput {
  title_txt: string;
  desc_txt: string;
  type_cd: string;
  audience_cd?: AudienceKind;
  audience_value?: string;
  /** 켜면 앱 안 알림과 함께 기기 푸시로도 밀어 준다. */
  push_yn?: boolean;
}

/** 발송된 공지 한 건의 기록. */
export interface Announcement {
  id: string;
  title_txt: string;
  desc_txt: string;
  type_cd: string;
  audience_cd: AudienceKind;
  audience_value: string;
  /** 발송 시점에 얼려 둔 대상 설명 — 조직 이름이 바뀌어도 '그때 누구에게'는 안 변한다. */
  audience_label: string;
  recipients: number;
  push_yn: boolean;
  actor_id: string;
  actor_name: string;
  created_at: string;
}

export interface AnnounceResult {
  sent: number;
  push_sent: number;
  announcement: Announcement;
}

/** 보내기 전에 확인하는 대상 규모. */
export interface AudiencePreview {
  count: number;
  label: string;
}

// ── 오늘의 출제 ───────────────────────────────────────────────────────────────

/** 오늘 그 사람에게 나간 문제 한 장. */
export interface TodayCard extends Card {
  /** 새로 배우는 것인가, 복습인가. */
  kind: 'NEW' | 'REVIEW';
  /** 오늘 이미 푼 문제인지. */
  done: boolean;
}

/** 그 사람의 오늘 편성. */
export interface TodayPlan {
  day: string;
  difficulty_cd: Difficulty;
  /** 난이도가 정한 목표 장수(3~5). 후보가 모자라면 cards 가 더 짧다. */
  target_count: number;
  cards: TodayCard[];
  done_count: number;
  resets_at: string;
}

/** 콘솔이 보는 '그 사람의 오늘'. */
export interface LearnerToday {
  /**
   * false 면 오늘 아직 앱을 열지 않았다는 뜻이다 — '문제가 0개'와 전혀 다르다.
   * (콘솔이 조회했다는 이유로 편성이 확정되지는 않는다.)
   */
  started: boolean;
  plan?: TodayPlan;
}

// ── 운영 설정 ─────────────────────────────────────────────────────────────────

export type NoticeLevel = 'INFO' | 'WARN' | 'DANGER';

/** 재배포 없이 즉시 바꾸는 서비스 동작 값. */
export interface OpsSettings {
  maintenance_yn: boolean;
  maintenance_msg: string;
  signup_enabled: boolean;
  /**
   * 하루 출제량은 **범위**다. 정확한 장수는 그날 그 사람의 난이도가 정한다 —
   * 쉬운 날은 최대치, 어려운 날은 최소치. 한 장에 드는 시간이 다르므로
   * 개수를 고정하면 '하루 3분'이 날마다 3분도 10분도 된다.
   */
  daily_min_cards: number;
  daily_max_cards: number;
  /** 끄면 난이도를 관찰로 조절하지 않고 늘 쉬움으로 낸다. */
  adaptive_difficulty: boolean;
  notice_txt: string;
  notice_level: NoticeLevel;
  updated_at: string;
  updated_by: string;
  updated_by_name: string;
}

/**
 * 설정 변경 요청 — **보낼 필드만** 담는다.
 *
 * 전부 보내면 화면이 들고 있던 낡은 값이 남의 변경을 덮는다. 공지 문구를 고치는
 * 사이 다른 관리자가 점검 모드를 켰다면, 통째로 보내는 순간 그것이 꺼진다.
 */
export type SettingsPatch = Partial<
  Pick<
    OpsSettings,
    | 'maintenance_yn'
    | 'maintenance_msg'
    | 'signup_enabled'
    | 'daily_min_cards'
    | 'daily_max_cards'
    | 'adaptive_difficulty'
    | 'notice_txt'
    | 'notice_level'
  >
>;

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

// ─────────────────────────────────────────────────────────────────────────────
// 학습자 진단(코칭용) — service.LearnerDiagnosis 와 짝을 이룬다.
// ─────────────────────────────────────────────────────────────────────────────

/** 오답이 이 사람의 약점인지, 원래 어려운 문제인지. */
export type MissSignal = 'personal' | 'shared' | 'unknown';

export interface LearnerSummary {
  cards: number;
  mastered: number;
  reps: number;
  lapses: number;
  lapse_rate: number;
  peer_lapse_rate: number;
  mastery_rate: number;
  peer_mastery_rate: number;
  active_days: number;
  days_away: number;
  habitual: boolean;
  last_seen?: string;
}

export interface CategoryWeakness {
  category: string;
  cards: number;
  reps: number;
  lapse_rate: number;
  peer_rate: number;
  gap: number;
  verdict: 'weak' | 'shared' | 'ok';
}

/** 틀린 문제 — 정답·해설을 함께 실어 이 화면 하나로 가르칠 수 있게 한다. */
export interface MissedCard {
  card_id: string;
  title: string;
  category: string;
  difficulty: string;
  question: string;
  answer: string;
  explain: string;
  reps: number;
  lapses: number;
  box: number;
  last_grade: string;
  last_reviewed_at?: string;
  lapse_rate: number;
  peer_rate: number;
  peer_count: number;
  signal: MissSignal;
}

// ── 교육 처방 ────────────────────────────────────────────────────────────────
// 진단은 "무엇이 약한가"까지만 말한다. 처방은 "그래서 무엇을 가르칠 것인가"와
// **왜 이 사람인가**를 함께 말한다. 근거(evidence)가 없는 처방은 서버가 내지
// 않는다 — 그래서 화면도 근거를 감추지 않는다.

/** 근거 한 줄의 세기. 표본과 비교 대상이 얼마나 받쳐 주는가. */
export type EvidenceStrength = 'strong' | 'moderate' | 'weak';

/**
 * 처방을 뒷받침하는 관측 한 줄.
 *
 * 다섯 조각이 함께 있어야 담당자가 **반박할 수 있다**. 반박할 수 없는 추천은
 * 결국 아무도 따르지 않는다.
 */
export interface Evidence {
  /** 무엇을 관측했나. */
  fact: string;
  /** 이 사람의 값. */
  observed: string;
  /** 무엇과 견줬나 — 비교 대상이 없으면 숫자는 아무 말도 하지 않는다. */
  compared?: string;
  /** 그 비교의 표본. */
  sample?: string;
  /** 어떤 기준선을 넘었기에 처방이 됐나. */
  rule: string;
  /** 이 수치가 나온 기록 — 원본을 찾아갈 수 있어야 한다. */
  source: string;
  strength: EvidenceStrength;
}

/** 처방이 지목하는 문제 한 장. reason 이 없으면 목록에서 순서의 뜻이 사라진다. */
export interface PrescribedCard {
  card_id: string;
  title: string;
  category: string;
  difficulty: string;
  reason: string;
}

export type PrescriptionKind =
  | 'onboarding'
  | 'engagement'
  | 'category'
  | 'cards'
  | 'retention'
  | 'content';

export interface Prescription {
  id: string;
  rank: number;
  /** now(이번 주) | soon(이번 달) | later(여유 있을 때) */
  priority: 'now' | 'soon' | 'later';
  kind: PrescriptionKind;
  title: string;
  /** 교육의 범위를 한 마디로. */
  target: string;
  /** 왜 **이 사람이** 이 교육을 받아야 하는가. */
  why: string;
  /** 관리자가 실제로 할 일. */
  action: string;
  /** 이 교육으로 기대되는 변화 — 나중에 검증할 수 있는 형태로. */
  expect: string;
  minutes: number;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  evidence: Evidence[];
  cards: PrescribedCard[];
}

export interface LearnerDiagnosis {
  user_id: string;
  name: string;
  org: string;
  summary: LearnerSummary;
  verdict: Headline[];
  weakness: CategoryWeakness[];
  missed: MissedCard[];
  rhythm: ActivityPoint[];
  /** 근거를 달고 나오는 교육 처방. 점수 내림차순. */
  prescriptions: Prescription[];
  /** 처방을 한 줄로 압축한 것(목록 화면용). */
  needs: string;
}
