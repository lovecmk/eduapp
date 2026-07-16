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
}

// PushToken 은 모바일 기기의 원격 푸시 수신 주소(Expo Push Token)다.
// 텔레그램 명령·서버 이벤트로 "동시에 알림"을 보낼 때 이 목록으로 브로드캐스트한다.
type PushToken struct {
	Token     string    `bson:"_id" json:"token"`     // Expo push token (기기 고유) — 업서트 키
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

// User 는 학습자 계정.
type User struct {
	ID           string     `bson:"_id"`
	LoginID      string     `bson:"login_id"`
	UserNm       string     `bson:"user_nm"`
	EmailAddr    string     `bson:"email_addr"`
	OrgNm        string     `bson:"org_nm"`
	JobTitle     string     `bson:"job_title"`
	MembershipCd Membership `bson:"membership_cd"`
	PasswordHash string     `bson:"password_hash"`
	CreatedAt    time.Time  `bson:"created_at"`
	StatusCd     string     `bson:"status_cd"` // A(active)/I(inactive)/D(deleted)
}
