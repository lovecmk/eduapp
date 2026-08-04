// Package domain 은 저장소/전송 형식과 무관한 순수 비즈니스 모델을 정의한다.
// 이 계층은 MongoDB·Fiber 등 어떤 인프라도 import 하지 않아,
// 서버를 다른 프레임워크/DB 로 이식할 때 그대로 재사용된다.
package domain

import "time"

// Difficulty 는 학습카드 난이도(3단계).
type Difficulty string

const (
	Easy   Difficulty = "EASY"
	Medium Difficulty = "MEDIUM"
	Hard   Difficulty = "HARD"
)

// CardType 은 카드 형식.
type CardType string

const (
	Explanation CardType = "EXPLANATION"
	OX          CardType = "OX"
	Choice      CardType = "CHOICE"
)

// CardStatus 는 개인별 학습 진행 상태.
type CardStatus string

const (
	StatusNew      CardStatus = "NEW"
	StatusLearning CardStatus = "LEARNING"
	StatusMastered CardStatus = "MASTERED"
)

// Card 는 학습 진행 상태와 무관한 순수 지식(콘텐츠) 카드다.
// json 태그는 임베드된 시드 파일(cards_seed.json) 로드에 쓰인다.
type Card struct {
	ID             string     `bson:"_id" json:"id"`
	CategoryCd     string     `bson:"category_cd" json:"category_cd"`
	SubCategoryNm  string     `bson:"sub_category_nm" json:"sub_category_nm"`
	TopicNm        string     `bson:"topic_nm" json:"topic_nm"`
	Keywords       []string   `bson:"keywords" json:"keywords"`
	TitleTxt       string     `bson:"title_txt" json:"title_txt"`
	StudySeconds   int        `bson:"study_seconds" json:"study_seconds"`
	SituationTxt   string     `bson:"situation_txt" json:"situation_txt"`
	QuestionTxt    string     `bson:"question_txt" json:"question_txt"`
	ImageURL       string     `bson:"image_url" json:"image_url"`
	PrincipleTxt   string     `bson:"principle_txt" json:"principle_txt"`
	ProcessTxt     string     `bson:"process_txt" json:"process_txt"`
	FireTriangle   string     `bson:"fire_triangle_txt" json:"fire_triangle_txt"`
	ConclusionTxt  string     `bson:"conclusion_txt" json:"conclusion_txt"`
	AnswerImageURL string     `bson:"answer_image_url" json:"answer_image_url"`
	SourceTxt      string     `bson:"source_txt" json:"source_txt"`
	DifficultyCd   Difficulty `bson:"difficulty_cd" json:"difficulty_cd"`
	CardTypeCd     CardType   `bson:"card_type_cd" json:"card_type_cd"`
	Choices        []string   `bson:"choices" json:"choices"`
	AnswerIndex    *int       `bson:"answer_index" json:"answer_index"`

	// UpdatedAt 은 마지막 수정 시각 — 동시 편집을 감지하는 데 쓴다.
	// 두 관리자가 같은 문제를 열어 각자 저장하면, 나중 저장이 앞의 수정을 통째로
	// 덮어써도 아무도 알아채지 못한다(감사 로그에도 '수정' 두 건만 남아
	// 무엇이 사라졌는지 알 수 없다). 수정 요청이 자기가 본 시각을 함께 보내면
	// 서버가 "그 사이 누가 고쳤다"를 판별할 수 있다.
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// PushToken 은 모바일 기기의 원격 푸시 수신 주소(Expo Push Token)다.
// 텔레그램 명령·서버 이벤트로 "동시에 알림"을 보낼 때 이 목록으로 브로드캐스트한다.
type PushToken struct {
	Token     string    `bson:"_id" json:"token"`         // Expo push token (기기 고유) — 업서트 키
	Platform  string    `bson:"platform" json:"platform"` // ios | android | web
	UserID    string    `bson:"user_id" json:"user_id"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// Progress 는 (user, card) 별 학습 진행 상태 — 카드 콘텐츠와 분리 저장.
type Progress struct {
	UserID string     `bson:"user_id"`
	CardID string     `bson:"card_id"`
	Status CardStatus `bson:"status_cd"`
	DueAt  *time.Time `bson:"due_at"`
}

// CardWithProgress 는 개인 진행 상태가 결합된 런타임 카드.
type CardWithProgress struct {
	Card
	Status CardStatus
	DueAt  *time.Time
}

// Membership 은 계정 등급.
type Membership string

const (
	Basic   Membership = "BASIC"
	Premium Membership = "PREMIUM"
	VIP     Membership = "VIP"
)

// Role 은 계정 권한. 멤버십(과금 등급)과는 완전히 다른 축이므로 따로 둔다 —
// VIP 회원이라고 관리 콘솔에 들어갈 수 있어서는 안 된다.
type Role string

const (
	RoleUser  Role = "USER"  // 일반 학습자(기본값)
	RoleAdmin Role = "ADMIN" // 관리 콘솔 접근 가능
)

// IsAdmin 은 관리 권한 보유 여부.
func (r Role) IsAdmin() bool { return r == RoleAdmin }

// User 는 학습자 계정.
type User struct {
	ID           string     `bson:"_id"`
	LoginID      string     `bson:"login_id"`
	UserNm       string     `bson:"user_nm"`
	Nickname     string     `bson:"nickname"`
	EmailAddr    string     `bson:"email_addr"`
	OrgNm        string     `bson:"org_nm"`
	JobTitle     string     `bson:"job_title"`
	MembershipCd Membership `bson:"membership_cd"`
	// RoleCd 는 빈 문자열이면 RoleUser 로 취급한다(기존 데이터 호환).
	// 판독은 반드시 Role() 을 거쳐 빈 값이 관리자로 새지 않게 한다.
	RoleCd       Role      `bson:"role_cd"`
	PasswordHash string    `bson:"password_hash"`
	CreatedAt    time.Time `bson:"created_at"`
	StatusCd     string    `bson:"status_cd"` // A(active)/I(inactive)/D(deleted)
}

// Role 은 저장된 역할을 안전하게 해석한다. 알 수 없는 값·빈 값은 모두 일반 사용자다
// (권한은 '명시적으로 부여된 것만' 인정한다 — 실패는 항상 낮은 권한 쪽으로).
func (u User) Role() Role {
	if u.RoleCd == RoleAdmin {
		return RoleAdmin
	}
	return RoleUser
}

// Active 는 로그인/이용 가능한 계정인지 여부.
func (u User) Active() bool { return u.StatusCd == "" || u.StatusCd == "A" }

// AuditLog 는 관리자가 수행한 변경 이력이다.
// 관리 콘솔은 남의 계정과 학습 콘텐츠를 바꾸는 도구이므로,
// "누가·언제·무엇을" 을 남기지 않으면 사고가 났을 때 되짚을 방법이 없다.
type AuditLog struct {
	ID         string    `bson:"_id" json:"id"`
	ActorID    string    `bson:"actor_id" json:"actor_id"`       // 수행한 관리자 ID
	ActorName  string    `bson:"actor_name" json:"actor_name"`   // 조회 편의를 위한 비정규화
	Action     string    `bson:"action" json:"action"`           // user.role_change, card.create ...
	TargetType string    `bson:"target_type" json:"target_type"` // user | card
	TargetID   string    `bson:"target_id" json:"target_id"`
	Summary    string    `bson:"summary" json:"summary"` // 사람이 읽는 한 줄 요약
	CreatedAt  time.Time `bson:"created_at" json:"created_at"`
}

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 학습 동기화 — 기기가 바뀌어도 남아야 하는 데이터
//
// SRS 상태·학습 이력·출석·반응·신고·알림은 지금까지 기기 로컬에만 있었다.
// 앱을 지우거나 기기를 바꾸면 몇 달치 기록이 사라지고 카드팩 획득 조건도 초기화된다.
// 서버가 권위를 갖도록 여기에 모델을 둔다.
// ─────────────────────────────────────────────────────────────────────────────

// SrsState 는 카드 한 장에 대한 간격반복(spaced repetition) 상태다.
type SrsState struct {
	UserID         string     `bson:"user_id" json:"-"`
	CardID         string     `bson:"card_id" json:"-"`
	Box            int        `bson:"box" json:"box"`
	Ease           float64    `bson:"ease" json:"ease"`
	DueAt          time.Time  `bson:"due_at" json:"due_at"`
	Reps           int        `bson:"reps" json:"reps"`
	Lapses         int        `bson:"lapses" json:"lapses"`
	LastGrade      string     `bson:"last_grade" json:"last_grade"`
	LastReviewedAt *time.Time `bson:"last_reviewed_at" json:"last_reviewed_at"`
}

// EngagementKind 는 카드에 대한 가벼운 반응의 종류.
type EngagementKind string

const (
	Liked      EngagementKind = "LIKE"
	Bookmarked EngagementKind = "BOOKMARK"
)

// ReportStatus 는 신고 한 건의 처리 단계다.
//
// 왜 필요한가 — 신고는 "지금 잘못된 내용이 배포 중"이라는 신호인데, 상태가 없으면
// 목록은 접수된 순간부터 영원히 같은 모습으로 남는다. 운영자는 어제 본 신고를
// 오늘 다시 읽고, 다른 운영자가 이미 처리한 것을 또 붙잡는다. 대시보드의
// '신고 N건'도 줄어들지 않아 결국 아무도 보지 않는 숫자가 된다.
type ReportStatus string

const (
	ReportOpen     ReportStatus = "OPEN"     // 접수됨 — 아무도 손대지 않았다
	ReportDoing    ReportStatus = "DOING"    // 확인 중 — 담당자가 잡았다
	ReportResolved ReportStatus = "RESOLVED" // 처리 완료 — 문제를 고쳤거나 지웠다
	ReportRejected ReportStatus = "REJECTED" // 반려 — 신고 내용이 사실이 아니다
)

// ParseReportStatus 는 외부 입력을 허용된 처리 단계로만 해석한다.
// 알 수 없는 값은 빈 값으로 — 호출자가 "지정하지 않음"과 구분할 수 있어야 한다.
func ParseReportStatus(raw string) ReportStatus {
	switch ReportStatus(raw) {
	case ReportOpen, ReportDoing, ReportResolved, ReportRejected:
		return ReportStatus(raw)
	}
	return ""
}

// Pending 은 아직 사람 손이 필요한 단계인지. 대시보드의 '신고' 숫자가 이것을 센다.
func (s ReportStatus) Pending() bool { return s == "" || s == ReportOpen || s == ReportDoing }

// Report 는 문제에 대한 사용자 신고. 운영자가 반드시 확인해야 하는 데이터다.
type Report struct {
	ID        string    `bson:"_id" json:"id"`
	UserID    string    `bson:"user_id" json:"user_id"`
	CardID    string    `bson:"card_id" json:"card_id"`
	Reason    string    `bson:"reason" json:"reason"`
	Detail    string    `bson:"detail" json:"detail"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`

	// --- 처리 이력 ---
	// StatusCd 는 빈 문자열이면 ReportOpen 으로 취급한다(상태가 없던 시절의 데이터 호환).
	// 판독은 반드시 Status() 를 거쳐, 빈 값이 '처리됨'으로 새지 않게 한다.
	StatusCd ReportStatus `bson:"status_cd" json:"status_cd"`
	// ResolutionTxt 는 "왜 그렇게 판단했는가" — 반려에는 특히 이것이 없으면
	// 같은 신고가 다시 올라왔을 때 앞사람의 판단을 되짚을 수 없다.
	ResolutionTxt string     `bson:"resolution_txt" json:"resolution_txt"`
	HandlerID     string     `bson:"handler_id" json:"handler_id"`
	HandlerName   string     `bson:"handler_name" json:"handler_name"`
	HandledAt     *time.Time `bson:"handled_at" json:"handled_at"`
}

// Status 는 저장된 처리 단계를 안전하게 해석한다(빈 값·미지의 값은 모두 미처리).
func (r Report) Status() ReportStatus {
	if s := ParseReportStatus(string(r.StatusCd)); s != "" {
		return s
	}
	return ReportOpen
}

// Notification 은 사용자에게 보여 줄 알림 한 건.
type Notification struct {
	ID         string    `bson:"_id" json:"id"`
	UserID     string    `bson:"user_id" json:"-"`
	TypeCd     string    `bson:"type_cd" json:"type_cd"`
	TitleTxt   string    `bson:"title_txt" json:"title_txt"`
	DescTxt    string    `bson:"desc_txt" json:"desc_txt"`
	CategoryNm string    `bson:"category_nm" json:"category_nm"`
	CreatedAt  time.Time `bson:"created_at" json:"created_at"`
	ReadYn     bool      `bson:"read_yn" json:"read_yn"`
}

// SyncSnapshot 은 앱이 로그인·복귀 시 한 번에 받아 가는 전체 학습 상태다.
// 화면마다 따로 요청하지 않고 묶어서 주는 이유는, 복원 도중 일부만 반영되어
// "카드는 복원됐는데 출석은 비어 있는" 어긋난 상태가 보이지 않게 하기 위해서다.
type SyncSnapshot struct {
	// 카드 id → SRS 상태
	Cards map[string]SrsState `json:"cards"`
	// 날짜 키(YYYY-M-D) → 그날 학습한 카드 id 목록
	History map[string][]string `json:"history"`
	// 출석한 날짜 키 → 체크인 시각
	Attendance map[string]time.Time `json:"attendance"`
	// 서버 기준 마지막 갱신 시각(증분 동기화 확장 지점)
	UpdatedAt *time.Time `json:"updated_at"`
}

// EngagementSnapshot 은 내가 추천·저장한 카드 목록이다.
type EngagementSnapshot struct {
	LikedIDs      []string `json:"liked_ids"`
	BookmarkedIDs []string `json:"bookmarked_ids"`
}

// ─────────────────────────────────────────────────────────────────────────────
// 운영 설정 — 재배포 없이 바꿀 수 있어야 하는 값들
//
// 왜 환경변수가 아니라 저장소에 두는가 — 점검 모드나 하루 학습 상한은 "지금 당장"
// 바꿔야 하는 값이다. 환경변수로 두면 바꾸는 데 재기동이 필요하고, 재기동은
// 현장에서 학습 중인 사용자의 세션을 끊는다. 게다가 누가 언제 바꿨는지가
// 남지 않는다(감사 기록은 저장소를 거치는 변경에만 붙는다).
// ─────────────────────────────────────────────────────────────────────────────

// NoticeLevel 은 앱 상단 공지 배너의 세기.
type NoticeLevel string

const (
	NoticeInfo   NoticeLevel = "INFO"
	NoticeWarn   NoticeLevel = "WARN"
	NoticeDanger NoticeLevel = "DANGER"
)

// OpsSettings 는 운영자가 콘솔에서 즉시 바꾸는 서비스 동작 값이다.
type OpsSettings struct {
	// MaintenanceYn 이 켜지면 일반 사용자의 API 는 503 으로 막힌다(관리자는 통과).
	MaintenanceYn  bool   `bson:"maintenance_yn" json:"maintenance_yn"`
	MaintenanceMsg string `bson:"maintenance_msg" json:"maintenance_msg"`
	// SignupEnabled 가 꺼지면 신규 가입만 막힌다(기존 사용자는 그대로 쓴다).
	SignupEnabled bool `bson:"signup_enabled" json:"signup_enabled"`
	// DailyNewLimit 은 하루에 새로 배울 수 있는 카드 수(복습은 상한이 없다).
	DailyNewLimit int `bson:"daily_new_limit" json:"daily_new_limit"`
	// NoticeTxt 가 비어 있지 않으면 앱이 상단에 배너로 띄운다.
	NoticeTxt   string      `bson:"notice_txt" json:"notice_txt"`
	NoticeLevel NoticeLevel `bson:"notice_level" json:"notice_level"`

	UpdatedAt     time.Time `bson:"updated_at" json:"updated_at"`
	UpdatedBy     string    `bson:"updated_by" json:"updated_by"`
	UpdatedByName string    `bson:"updated_by_name" json:"updated_by_name"`
}

// DefaultDailyNewLimit 은 하루 신규 학습 상한의 기본값 —
// 앱의 constants/learning.ts(DAILY_NEW_LIMIT)와 같은 값이어야 한다.
const DefaultDailyNewLimit = 5

// maxDailyNewLimit 은 상한의 상한. 0 이나 음수는 '무제한'이 아니라 실수이므로
// 기본값으로 되돌리고, 지나치게 큰 값은 사실상 상한이 없는 것과 같아 잘라 낸다.
const maxDailyNewLimit = 100

// DefaultOpsSettings 는 저장된 설정이 아직 없을 때의 값이다.
// 실패는 항상 '서비스가 열려 있는' 쪽으로 — 설정을 읽지 못했다고 점검 모드에
// 들어가면 저장소 장애 하나가 전면 중단이 된다.
func DefaultOpsSettings() OpsSettings {
	return OpsSettings{
		MaintenanceYn: false,
		SignupEnabled: true,
		DailyNewLimit: DefaultDailyNewLimit,
		NoticeLevel:   NoticeInfo,
	}
}

// Normalized 는 저장·응답 전에 값을 규칙 안으로 되돌린다.
// 저장소에 예전 형식이나 손으로 넣은 값이 있어도 앱이 이상한 값을 보지 않게 한다.
func (s OpsSettings) Normalized() OpsSettings {
	if s.DailyNewLimit <= 0 {
		s.DailyNewLimit = DefaultDailyNewLimit
	}
	if s.DailyNewLimit > maxDailyNewLimit {
		s.DailyNewLimit = maxDailyNewLimit
	}
	switch s.NoticeLevel {
	case NoticeInfo, NoticeWarn, NoticeDanger:
	default:
		s.NoticeLevel = NoticeInfo
	}
	return s
}

// ─────────────────────────────────────────────────────────────────────────────
// 공지 — 누구에게 무엇을 보냈는가
// ─────────────────────────────────────────────────────────────────────────────

// AudienceKind 는 공지 수신 대상의 지정 방식.
type AudienceKind string

const (
	AudienceAll        AudienceKind = "ALL"        // 활성 사용자 전원
	AudienceRole       AudienceKind = "ROLE"       // 권한(USER/ADMIN)
	AudienceMembership AudienceKind = "MEMBERSHIP" // 등급(BASIC/PREMIUM/VIP)
	AudienceOrg        AudienceKind = "ORG"        // 소속 조직명
	AudienceUser       AudienceKind = "USER"       // 특정 한 사람
)

// ParseAudienceKind 는 외부 입력을 허용된 대상 방식으로만 해석한다.
// 빈 값은 전체 발송(가장 흔한 경우)으로 본다.
func ParseAudienceKind(raw string) (AudienceKind, bool) {
	switch AudienceKind(raw) {
	case AudienceAll, AudienceRole, AudienceMembership, AudienceOrg, AudienceUser:
		return AudienceKind(raw), true
	case "":
		return AudienceAll, true
	}
	return "", false
}

// Announcement 는 발송된 공지 한 건의 기록이다.
//
// 왜 남기는가 — 공지는 되돌릴 수 없다. 무엇을 언제 누구에게 보냈는지가 남지
// 않으면 "그 안내 보냈나요?"에 아무도 답할 수 없고, 같은 공지를 두 번 보내게 된다.
// 감사 로그에도 한 줄이 남지만 그쪽은 관리 행위 전체가 섞이는 흐름이라
// 공지만 훑어보기 어렵고, 대상·수신자 수 같은 구조를 잃는다.
type Announcement struct {
	ID       string `bson:"_id" json:"id"`
	TitleTxt string `bson:"title_txt" json:"title_txt"`
	DescTxt  string `bson:"desc_txt" json:"desc_txt"`
	TypeCd   string `bson:"type_cd" json:"type_cd"`

	AudienceCd    AudienceKind `bson:"audience_cd" json:"audience_cd"`
	AudienceValue string       `bson:"audience_value" json:"audience_value"`
	// AudienceLabel 은 사람이 읽는 대상 설명("영업2팀 · 12명"). 화면이 매번
	// 코드에서 문구를 다시 만들지 않도록 발송 시점의 설명을 그대로 얼려 둔다 —
	// 조직 이름이 나중에 바뀌어도 "그때 누구에게 보냈는가"는 변하지 않아야 한다.
	AudienceLabel string `bson:"audience_label" json:"audience_label"`

	Recipients int  `bson:"recipients" json:"recipients"`
	PushYn     bool `bson:"push_yn" json:"push_yn"`

	ActorID   string    `bson:"actor_id" json:"actor_id"`
	ActorName string    `bson:"actor_name" json:"actor_name"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
}
