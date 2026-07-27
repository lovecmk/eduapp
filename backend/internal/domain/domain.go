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

// Report 는 문제에 대한 사용자 신고. 운영자가 반드시 확인해야 하는 데이터다.
type Report struct {
	ID        string    `bson:"_id" json:"id"`
	UserID    string    `bson:"user_id" json:"user_id"`
	CardID    string    `bson:"card_id" json:"card_id"`
	Reason    string    `bson:"reason" json:"reason"`
	Detail    string    `bson:"detail" json:"detail"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
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
