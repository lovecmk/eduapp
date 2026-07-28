// Package ports 는 서비스 계층이 의존하는 저장소 인터페이스(포트)를 정의한다.
// 서비스는 구체 구현(MongoDB)이 아니라 이 인터페이스에만 의존하므로,
// 저장소를 Postgres/메모리 등으로 교체해도 서비스 코드는 변경되지 않는다(이식성).
package ports

import (
	"context"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
)

// UserQuery 는 관리 콘솔의 사용자 목록 조회 조건이다.
// 사용자 수가 늘어나도 전량 조회로 무너지지 않도록 저장소에서 잘라서 준다.
type UserQuery struct {
	Search     string // 이름·닉네임·아이디·이메일 부분 일치(대소문자 무시)
	Role       string // "" | USER | ADMIN
	Status     string // "" | A | I | D
	Membership string // "" | BASIC | PREMIUM | VIP
	Offset     int
	Limit      int // 0 이면 저장소 기본값(50)

	// 정렬은 반드시 저장소에서 한다. 페이지를 받아 온 뒤 화면에서 정렬하면
	// '현재 페이지 안에서만' 정렬되어, 관리자는 전체가 정렬된 줄 알고
	// 잘못된 결론(예: "가장 오래된 계정은 이것")을 내린다.
	Sort SortField
	Desc bool
}

// SortField 는 사용자 목록 정렬 기준. 문자열을 그대로 SQL 에 넣지 않기 위해
// 허용 값을 타입으로 좁힌다(정렬 파라미터를 통한 SQL 인젝션 차단).
type SortField string

const (
	SortCreatedAt SortField = "created_at"
	SortName      SortField = "user_nm"
	SortLoginID   SortField = "login_id"
	SortRole      SortField = "role_cd"
	SortStatus    SortField = "status_cd"
)

// ParseSortField 는 외부 입력을 허용된 정렬 기준으로만 해석한다.
// 알 수 없는 값은 기본값(가입일)으로 — 오타 하나로 500 을 내지 않는다.
func ParseSortField(raw string) SortField {
	switch SortField(raw) {
	case SortName:
		return SortName
	case SortLoginID:
		return SortLoginID
	case SortRole:
		return SortRole
	case SortStatus:
		return SortStatus
	}
	return SortCreatedAt
}

// UserRepository 는 사용자 영속화 포트.
type UserRepository interface {
	FindByLoginID(ctx context.Context, loginID string) (*domain.User, error)
	FindByNickname(ctx context.Context, nickname string) (*domain.User, error)
	FindByID(ctx context.Context, id string) (*domain.User, error)
	Create(ctx context.Context, u *domain.User) error
	// Update 는 기존 사용자를 덮어쓴다(내 정보 수정용).
	Update(ctx context.Context, u *domain.User) error
	Count(ctx context.Context) (int64, error)

	// --- 관리 콘솔 ---

	// List 는 조건에 맞는 사용자 페이지와 '조건에 맞는 전체 개수'를 반환한다.
	// 전체 개수는 페이지네이션 UI 에 필요하므로 페이지와 함께 돌려준다.
	List(ctx context.Context, q UserQuery) ([]domain.User, int64, error)
	// CountByRole 은 역할별 인원(예: ADMIN 2명)을 센다. 대시보드 요약용.
	CountByRole(ctx context.Context) (map[string]int64, error)
	// CountCreatedSince 는 특정 시점 이후 가입자 수를 센다(신규 가입 추이).
	CountCreatedSince(ctx context.Context, since time.Time) (int64, error)
}

// CardRepository 는 카드 콘텐츠 + 개인 진행 상태 영속화 포트.
type CardRepository interface {
	AllCards(ctx context.Context) ([]domain.Card, error)
	CountCards(ctx context.Context) (int64, error)
	InsertCards(ctx context.Context, cards []domain.Card) error

	// ProgressFor 는 특정 사용자의 (cardID -> Progress) 맵을 반환한다.
	ProgressFor(ctx context.Context, userID string) (map[string]domain.Progress, error)
	UpsertProgress(ctx context.Context, p domain.Progress) error

	// --- 관리 콘솔(문제 만들기·고치기) ---

	// FindCard 는 카드 한 장을 조회한다. 없으면 ErrNotFound.
	FindCard(ctx context.Context, id string) (*domain.Card, error)
	// UpdateCard 는 카드 내용을 덮어쓴다. 없으면 ErrNotFound.
	UpdateCard(ctx context.Context, c domain.Card) error
	// DeleteCard 는 카드와 그에 딸린 모든 개인 진행 기록을 함께 지운다.
	// (카드만 지우면 어떤 카드인지 알 수 없는 진행 기록이 남아 통계가 어긋난다)
	DeleteCard(ctx context.Context, id string) error
	// ProgressSummary 는 상태별 진행 건수(NEW/LEARNING/MASTERED)를 전체 사용자 기준으로 센다.
	ProgressSummary(ctx context.Context) (map[string]int64, error)
	// ProgressCountFor 는 한 사용자의 상태별 진행 건수를 센다(사용자 상세용).
	ProgressCountFor(ctx context.Context, userID string) (map[string]int64, error)
	// CardProgressStats 는 카드별 학습/완료 건수를 센다 —
	// "아무도 못 푸는 문제"를 찾아내는 데 쓴다(cardID -> {learning, mastered}).
	CardProgressStats(ctx context.Context) (map[string]CardStat, error)
}

// CardStat 은 카드 한 장의 전체 사용자 기준 학습 현황.
type CardStat struct {
	Learning int64
	Mastered int64
}

// AuditRepository 는 관리자 행위 이력 영속화 포트.
type AuditRepository interface {
	Append(ctx context.Context, l domain.AuditLog) error
	// List 는 최신순으로 limit 개를 반환한다.
	List(ctx context.Context, limit int) ([]domain.AuditLog, error)
}

// PushTokenRepository 는 원격 푸시 토큰 영속화 포트.
// 텔레그램/서버 이벤트가 전체 기기에 알림을 브로드캐스트할 때 All 로 대상을 얻는다.
type PushTokenRepository interface {
	// Save 는 토큰을 업서트한다(같은 토큰 재등록 시 갱신).
	Save(ctx context.Context, t domain.PushToken) error
	// All 은 등록된 모든 토큰을 반환한다(브로드캐스트 대상).
	All(ctx context.Context) ([]domain.PushToken, error)
	// Delete 는 무효(Expo DeviceNotRegistered)해진 토큰을 제거한다.
	Delete(ctx context.Context, token string) error
}

// ErrNotFound 는 조회 대상이 없을 때 저장소가 반환하는 표준 오류.
type ErrNotFound struct{ Entity string }

func (e ErrNotFound) Error() string { return e.Entity + " not found" }

// ErrConflict 는 저장소의 유일성 제약을 어겼을 때 반환하는 표준 오류.
//
// 왜 저장소가 이 오류를 만들어야 하는가 — 서비스의 "중복인가 확인 → 만든다" 는
// 두 동작 사이에 틈이 있어 동시 요청을 막지 못한다. 유일성을 실제로 보장할 수 있는
// 곳은 제약을 가진 저장소뿐이므로, 저장소가 제약 위반을 도메인 언어(ErrConflict)로
// 번역해 돌려주고 서비스는 그것을 최종 판정으로 삼는다.
type ErrConflict struct{ Field string }

func (e ErrConflict) Error() string { return e.Field + " already exists" }

// UserDataRepository 는 "기기가 바뀌어도 남아야 하는" 개인 데이터를 다룬다.
//
// 왜 하나의 포트로 묶었는가 — SRS·출석·반응·신고·알림은 모두 (사용자 1명 : 데이터 N건)
// 형태이고 항상 같은 저장소에 함께 산다. 포트를 다섯 개로 쪼개면 어댑터 세 벌마다
// 다섯 개씩, 열다섯 개의 구현이 생기는데 그중 어느 것도 따로 교체될 이유가 없다.
// 하나로 두면 "이 사용자의 데이터"라는 경계가 코드에도 그대로 드러난다.
type UserDataRepository interface {
	// --- 학습 동기화 ---
	// LoadSync 는 앱 복원에 필요한 전체 스냅샷을 한 번에 준다.
	LoadSync(ctx context.Context, userID string) (domain.SyncSnapshot, error)
	// SaveSrs 는 카드 한 장의 채점 결과를 기록한다(같은 카드면 덮어쓴다).
	// day 는 학습 이력에 남길 날짜 키(YYYY-M-D). 빈 문자열이면 이력은 남기지 않는다.
	SaveSrs(ctx context.Context, s domain.SrsState, day string) error
	// MarkAttendance 는 출석을 기록한다. 이미 찍힌 날이면 아무 일도 하지 않는다
	// (하루 1회라는 규칙이 저장소에서 지켜져야 재전송에도 안전하다).
	MarkAttendance(ctx context.Context, userID, day string, at time.Time) error

	// --- 카드 반응 ---
	// Engagement 는 내가 추천·저장한 카드 목록을 준다.
	Engagement(ctx context.Context, userID string) (domain.EngagementSnapshot, error)
	// SetEngagement 는 '원하는 상태'를 그대로 반영한다(토글이 아니라 설정).
	// 토글이면 재전송 시 원래대로 돌아가 버리므로 반드시 설정 의미여야 한다.
	SetEngagement(ctx context.Context, userID, cardID string, kind domain.EngagementKind, on bool) error

	// --- 신고 ---
	// AddReport 는 신고를 접수한다.
	AddReport(ctx context.Context, r domain.Report) error
	// ReportedCardIDs 는 내가 신고한 카드 id 목록(화면에서 중복 신고를 막는 데 쓴다).
	ReportedCardIDs(ctx context.Context, userID string) ([]string, error)
	// ListReports 는 최근 신고를 관리 콘솔용으로 준다.
	ListReports(ctx context.Context, limit int) ([]domain.Report, error)

	// --- 알림 ---
	// AddNotifications 는 알림을 한꺼번에 넣는다(관리자 발송).
	// 한 건씩 넣는 API 를 두지 않은 이유 — 전체 공지는 수천 건이 한 번에 생기는데,
	// 그때마다 왕복하면 저장소가 헛돈다.
	AddNotifications(ctx context.Context, list []domain.Notification) error
	Notifications(ctx context.Context, userID string) ([]domain.Notification, error)
	MarkNotificationRead(ctx context.Context, userID, id string) error
	MarkAllNotificationsRead(ctx context.Context, userID string) error
}

// ─────────────────────────────────────────────────────────────────────────────
// 분석(insight) 읽기
// ─────────────────────────────────────────────────────────────────────────────

// InsightRepository 는 학습 데이터를 **전체에 걸쳐** 읽는다.
//
// 왜 UserDataRepository 와 따로 두는가 —
// 그쪽은 전부 "사용자 1명" 단위다. 앱이 필요로 하는 읽기는 항상 내 것뿐이고,
// 그 경계가 코드에 드러나는 것이 안전하기 때문이다(남의 데이터를 실수로 읽기 어렵다).
// 분석은 정반대로 '전부를 가로질러' 봐야 한다. 두 성격을 한 포트에 섞으면
// 앱 경로에서 전체 조회를 부를 수 있게 되어 그 안전장치가 사라진다.
//
// 반환 모양이 원본 행이 아니라 **집계된 값**인 것도 의도적이다. 원본을 끌어와
// 서비스에서 합치면 저장소가 잘하는 일(GROUP BY)을 애플리케이션이 대신하게 되고,
// 데이터가 늘수록 네트워크로 전부 실어 나르게 된다.
type InsightRepository interface {
	// CardLearning 은 카드별 학습 집계를 준다(학습자 수·시도·실패·평균 난이도).
	CardLearning(ctx context.Context) ([]CardLearningStat, error)
	// LearnerLearning 은 사용자별 학습 집계를 준다.
	LearnerLearning(ctx context.Context) ([]LearnerStat, error)
	// ActiveUserDays 는 (사용자, 날짜) 활동 쌍을 준다.
	//
	// 여기만 집계가 아니라 원재료를 그대로 주는 이유: 리텐션·코호트·연속 학습일은
	// '며칠인가'가 아니라 '어느 날들인가'를 알아야 계산할 수 있다. 개수로 줄이면
	// 7일 중 4일 학습 같은 습관 판정이 불가능해진다.
	// 행 수는 (사용자 수 × 활동한 날 수)로 묶여 있고, 저장소 구현이 상한을 건다.
	ActiveUserDays(ctx context.Context) ([]UserDay, error)
}

// CardLearningStat 은 카드 한 장에 대한 전체 사용자 학습 집계.
type CardLearningStat struct {
	CardID string
	// Learners 는 이 카드를 한 번이라도 학습한 사람 수.
	Learners int64
	// Reps 는 총 시도 횟수, Lapses 는 그중 잊어서 되돌아간 횟수.
	Reps   int64
	Lapses int64
	// AvgEase 는 평균 난이도 계수(낮을수록 어렵게 느낀다는 뜻).
	AvgEase float64
	// AvgBox 는 평균 기억 상자(높을수록 오래 기억한다).
	AvgBox float64
	// Mastered 는 충분히 익힌(상자 4 이상) 사람 수.
	Mastered int64
}

// LearnerStat 은 사용자 한 명에 대한 학습 집계.
type LearnerStat struct {
	UserID   string
	Cards    int64
	Reps     int64
	Lapses   int64
	AvgBox   float64
	LastSeen time.Time
}

// UserDay 는 "이 사람이 이 날 학습했다"는 사실 하나.
// DayKey 는 앱이 쓰는 로컬 날짜 키(YYYY-M-D, month 0-based)를 그대로 쓴다.
type UserDay struct {
	UserID string
	DayKey string
}
