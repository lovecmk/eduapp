package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// AdminService 는 관리 콘솔의 유스케이스를 담는다.
//
// 이 서비스는 **남의 계정과 학습 콘텐츠를 바꾸는 도구**다. 그래서 일반 서비스보다
// 두 가지를 더 신경 쓴다.
//
//  1. 잠금 방지(lockout) — 관리자가 실수로 자기 자신이나 마지막 관리자의 권한을
//     떼어내면 아무도 콘솔에 들어올 수 없게 된다. 서비스 계층에서 원천 차단한다.
//  2. 감사 기록 — 모든 변경은 "누가·언제·무엇을"이 남는다. 기록에 실패해도 변경 자체는
//     되돌리지 않되(사용자 입장에선 이미 성공한 작업), 로그로 남겨 놓친 흔적을 알린다.
type AdminService struct {
	users ports.UserRepository
	cards ports.CardRepository
	audit ports.AuditRepository

	// data 는 신고·알림 등 개인 데이터 저장소(없을 수도 있다).
	data ports.UserDataRepository

	metrics *Metrics
	// storeKind 는 현재 저장소 종류("mongo"/"postgres"/"memory") — 서비스 상태 화면용.
	storeKind string
	now       func() time.Time
}

// NewAdminService 는 관리 서비스를 만든다.
func NewAdminService(
	users ports.UserRepository,
	cards ports.CardRepository,
	audit ports.AuditRepository,
	data ports.UserDataRepository,
	metrics *Metrics,
	storeKind string,
) *AdminService {
	return &AdminService{
		users: users, cards: cards, audit: audit, data: data,
		metrics: metrics, storeKind: storeKind, now: time.Now,
	}
}

// maxAuditLimit 은 감사 이력 한 번에 가져갈 수 있는 최대 건수.
const maxAuditLimit = 500

// ErrStaleWrite 는 내가 본 뒤에 다른 사람이 먼저 고쳤을 때 반환된다.
var ErrStaleWrite = errors.New("다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도해주세요")

// ErrLastAdmin 은 마지막 관리자의 권한을 떼려 할 때 반환된다.
var ErrLastAdmin = errors.New("마지막 관리자의 권한은 해제할 수 없습니다")

// ErrSelfLockout 은 관리자가 자기 자신의 권한·상태를 낮추려 할 때 반환된다.
var ErrSelfLockout = errors.New("자기 자신의 권한·상태는 변경할 수 없습니다")

// ErrInvalidInput 은 요청 값이 규칙에 맞지 않을 때 반환된다(메시지에 이유를 담는다).
type ErrInvalidInput struct{ Reason string }

func (e ErrInvalidInput) Error() string { return e.Reason }

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드
// ─────────────────────────────────────────────────────────────────────────────

// Dashboard 는 첫 화면이 필요로 하는 모든 집계를 한 번에 만든다.
// 화면이 여러 번 왕복하지 않도록 묶어서 준다(관리 화면은 새로고침이 잦다).
type Dashboard struct {
	Users    UserSummary     `json:"users"`
	Content  ContentSummary  `json:"content"`
	Learning LearningSummary `json:"learning"`
	Metrics  MetricsSnapshot `json:"metrics"`
	Service  ServiceStatus   `json:"service"`
}

// UserSummary 는 사용자 규모와 유입.
type UserSummary struct {
	Total     int64 `json:"total"`
	Admins    int64 `json:"admins"`
	NewToday  int64 `json:"new_today"`
	New7Days  int64 `json:"new_7days"`
	Active5m  int   `json:"active_5m"`
	Suspended int64 `json:"suspended"`
}

// ContentSummary 는 학습 콘텐츠 현황.
type ContentSummary struct {
	TotalCards   int64           `json:"total_cards"`
	ByCategory   []CategoryCount `json:"by_category"`
	ByType       []LabelCount    `json:"by_type"`
	ByDifficulty []LabelCount    `json:"by_difficulty"`
	Untouched    []UntouchedCard `json:"untouched"`
	// Reports 는 접수된 신고 건수 — 관리자가 가장 먼저 봐야 하는 숫자다.
	// 신고는 "지금 잘못된 내용이 배포 중"이라는 뜻이라 다른 지표보다 급하다.
	Reports int `json:"reports"`
}

// CategoryCount 는 분야별 카드 수.
type CategoryCount struct {
	Code  string `json:"code"`
	Label string `json:"label"`
	Count int64  `json:"count"`
}

// LabelCount 는 이름표 하나에 대한 개수(형식·난이도 등).
type LabelCount struct {
	Label string `json:"label"`
	Count int64  `json:"count"`
}

// UntouchedCard 는 아무도 완료하지 못한 문제 — 문제 품질 점검 대상.
type UntouchedCard struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Category string `json:"category"`
	Learning int64  `json:"learning"`
	Mastered int64  `json:"mastered"`
}

// LearningSummary 는 전체 사용자 기준 학습 진행.
type LearningSummary struct {
	New      int64   `json:"new"`
	Learning int64   `json:"learning"`
	Mastered int64   `json:"mastered"`
	Rate     float64 `json:"rate"` // 완료율(%)
}

// ServiceStatus 는 "서비스가 지금 정상인가"에 답한다.
// 비밀값(JWT 시크릿·DB 비밀번호·봇 토큰)은 **절대 담지 않는다** —
// 설정 여부(bool)만 노출한다.
type ServiceStatus struct {
	Store         string `json:"store"`
	StoreHealthy  bool   `json:"store_healthy"`
	StoreError    string `json:"store_error,omitempty"`
	UptimeSeconds int64  `json:"uptime_seconds"`
	CheckedAt     string `json:"checked_at"`
}

// Dashboard 는 대시보드 집계를 만든다.
func (s *AdminService) Dashboard(ctx context.Context) (*Dashboard, error) {
	now := s.now()

	total, err := s.users.Count(ctx)
	if err != nil {
		return nil, err
	}
	byRole, err := s.users.CountByRole(ctx)
	if err != nil {
		return nil, err
	}
	newToday, err := s.users.CountCreatedSince(ctx, startOfDay(now))
	if err != nil {
		return nil, err
	}
	new7, err := s.users.CountCreatedSince(ctx, now.AddDate(0, 0, -7))
	if err != nil {
		return nil, err
	}
	// 정지 계정은 '개수'만 필요하므로 한 건만 받아 total 을 취한다(전량 조회 회피).
	_, suspendedTotal, err := s.users.List(ctx, ports.UserQuery{Status: "I", Limit: 1})
	if err != nil {
		return nil, err
	}

	content, err := s.contentSummary(ctx)
	if err != nil {
		return nil, err
	}
	progress, err := s.cards.ProgressSummary(ctx)
	if err != nil {
		return nil, err
	}

	// 신고 건수 — 저장소가 없으면 0 으로 두고 대시보드 전체를 실패시키지 않는다.
	// 부가 지표 하나 때문에 첫 화면이 통째로 안 뜨는 편이 훨씬 나쁘다.
	if s.data != nil {
		if reports, err := s.data.ListReports(ctx, maxReportLimit); err == nil {
			content.Reports = len(reports)
		} else {
			log.Printf("[admin] 신고 건수 조회 실패(대시보드는 계속 표시): %v", err)
		}
	}

	snapshot := s.metrics.Snapshot()

	return &Dashboard{
		Users: UserSummary{
			Total:     total,
			Admins:    byRole[string(domain.RoleAdmin)],
			NewToday:  newToday,
			New7Days:  new7,
			Active5m:  snapshot.ActiveUsers,
			Suspended: suspendedTotal,
		},
		Content:  *content,
		Learning: s.overallLearning(ctx, progress),
		Metrics:  snapshot,
		Service:  s.ServiceStatus(ctx),
	}, nil
}

// overallLearning 은 전체 학습 진행을 센다.
//
// GetUser 와 같은 문제를 고친 것이다 — 예전에는 진행 상태 표(cards.ProgressCount)를
// 읽었는데, 앱은 오래전부터 간격반복 기록으로만 남긴다. 그래서 학습자가 열세 명
// 있어도 대시보드는 "완료 0 · 학습 중 0 · 미시작 0"을 보여 줬다.
//
// 세는 단위는 **(사람, 문제) 조합**이다. 학습자 11명 × 문제 61장이면 671칸이 있고,
// 그중 몇 칸이 채워졌는가를 본다. '문제 기준'으로 세면 한 사람만 푼 문제와 열 명이
// 푼 문제가 같아져, 콘텐츠가 실제로 얼마나 닿았는지 알 수 없다.
//
// 집계를 지원하지 않는 저장소에서는 예전 값을 그대로 쓴다(0 을 보여 주는 것보다 낫다).
func (s *AdminService) overallLearning(ctx context.Context, legacy map[string]int64) LearningSummary {
	repo, ok := s.data.(ports.InsightRepository)
	if !ok {
		return learningSummary(legacy)
	}
	cardStats, err := repo.CardLearning(ctx)
	if err != nil {
		return learningSummary(legacy)
	}
	learners, err := repo.LearnerLearning(ctx)
	if err != nil {
		return learningSummary(legacy)
	}
	cards, err := s.cards.AllCards(ctx)
	if err != nil {
		return learningSummary(legacy)
	}

	var touched, mastered int64
	for _, c := range cardStats {
		touched += c.Learners
		mastered += c.Mastered
	}

	// 아직 아무도 손대지 않은 칸. 학습자가 없으면 0 이다 — 분모가 0 인데
	// '미시작 61장'이라고 하면 없는 진행을 있는 것처럼 말하게 된다.
	total := int64(len(learners)) * int64(len(cards))
	untouched := total - touched
	if untouched < 0 {
		untouched = 0
	}

	rate := 0.0
	if total > 0 {
		rate = round2(float64(mastered) / float64(total) * 100)
	}
	return LearningSummary{
		New:      untouched,
		Learning: touched - mastered,
		Mastered: mastered,
		Rate:     rate,
	}
}

// contentSummary 는 카드 분포와 '아무도 못 푸는 문제'를 뽑는다.
func (s *AdminService) contentSummary(ctx context.Context) (*ContentSummary, error) {
	cards, err := s.cards.AllCards(ctx)
	if err != nil {
		return nil, err
	}
	stats, err := s.cards.CardProgressStats(ctx)
	if err != nil {
		return nil, err
	}

	byCat := map[string]int64{}
	byType := map[string]int64{}
	byDiff := map[string]int64{}
	for _, c := range cards {
		byCat[c.CategoryCd]++
		byType[cardTypeLabel(c.CardTypeCd)]++
		byDiff[difficultyLabel(c.DifficultyCd)]++
	}

	// 학습을 시도한 사람은 있는데 아무도 완료하지 못한 카드 = 문제가 어렵거나 잘못됐다.
	untouched := []UntouchedCard{}
	for _, c := range cards {
		st := stats[c.ID]
		if st.Learning > 0 && st.Mastered == 0 {
			untouched = append(untouched, UntouchedCard{
				ID: c.ID, Title: firstNonEmpty(c.TitleTxt, c.QuestionTxt),
				Category: categoryLabel(c.CategoryCd),
				Learning: st.Learning, Mastered: st.Mastered,
			})
		}
	}
	// 헤매는 사람이 많은 순 — 고칠 가치가 큰 것부터.
	sort.Slice(untouched, func(i, j int) bool {
		if untouched[i].Learning == untouched[j].Learning {
			return untouched[i].ID < untouched[j].ID
		}
		return untouched[i].Learning > untouched[j].Learning
	})
	if len(untouched) > 10 {
		untouched = untouched[:10]
	}

	cats := make([]CategoryCount, 0, len(byCat))
	for code, n := range byCat {
		cats = append(cats, CategoryCount{Code: code, Label: categoryLabel(code), Count: n})
	}
	sort.Slice(cats, func(i, j int) bool { return cats[i].Count > cats[j].Count })

	return &ContentSummary{
		TotalCards:   int64(len(cards)),
		ByCategory:   cats,
		ByType:       sortedLabelCounts(byType),
		ByDifficulty: sortedLabelCounts(byDiff),
		Untouched:    untouched,
	}, nil
}

func learningSummary(p map[string]int64) LearningSummary {
	n, l, m := p[string(domain.StatusNew)], p[string(domain.StatusLearning)], p[string(domain.StatusMastered)]
	total := n + l + m
	rate := 0.0
	if total > 0 {
		rate = round2(float64(m) / float64(total) * 100)
	}
	return LearningSummary{New: n, Learning: l, Mastered: m, Rate: rate}
}

// ServiceStatus 는 저장소 연결까지 실제로 찔러 보고 상태를 판정한다.
// 단순히 "프로세스가 살아 있다"가 아니라 "일을 할 수 있다"를 확인해야 의미가 있다.
func (s *AdminService) ServiceStatus(ctx context.Context) ServiceStatus {
	st := ServiceStatus{
		Store:         s.storeKind,
		UptimeSeconds: s.metrics.Snapshot().UptimeSeconds,
		CheckedAt:     s.now().UTC().Format(time.RFC3339),
	}
	// 가장 가벼운 읽기 한 번으로 저장소 왕복을 확인한다.
	checkCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if _, err := s.users.Count(checkCtx); err != nil {
		st.StoreHealthy = false
		st.StoreError = err.Error()
		return st
	}
	st.StoreHealthy = true
	return st
}

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 관리
// ─────────────────────────────────────────────────────────────────────────────

// AdminUser 는 관리 콘솔이 보는 사용자. 비밀번호 해시는 절대 포함하지 않는다.
type AdminUser struct {
	ID           string `json:"id"`
	LoginID      string `json:"login_id"`
	UserNm       string `json:"user_nm"`
	Nickname     string `json:"nickname"`
	EmailAddr    string `json:"email_addr"`
	OrgNm        string `json:"org_nm"`
	JobTitle     string `json:"job_title"`
	MembershipCd string `json:"membership_cd"`
	RoleCd       string `json:"role_cd"`
	StatusCd     string `json:"status_cd"`
	CreatedAt    string `json:"created_at"`
}

// UserPage 는 사용자 목록 한 페이지.
type UserPage struct {
	Items  []AdminUser `json:"items"`
	Total  int64       `json:"total"`
	Offset int         `json:"offset"`
	Limit  int         `json:"limit"`
}

// UserDetail 은 사용자 한 명 + 그의 학습 진행.
type UserDetail struct {
	User     AdminUser       `json:"user"`
	Learning LearningSummary `json:"learning"`
}

// toAdminUser 는 도메인 User 를 관리 DTO 로 바꾼다.
// PasswordHash 를 옮기는 필드가 아예 없다는 점이 이 함수의 핵심이다 —
// 실수로라도 해시가 API 밖으로 나갈 수 없게 구조로 막는다.
func toAdminUser(u domain.User) AdminUser {
	return AdminUser{
		ID: u.ID, LoginID: u.LoginID, UserNm: u.UserNm, Nickname: u.Nickname,
		EmailAddr: u.EmailAddr, OrgNm: u.OrgNm, JobTitle: u.JobTitle,
		MembershipCd: string(u.MembershipCd), RoleCd: string(u.Role()),
		StatusCd: u.StatusCd, CreatedAt: u.CreatedAt.UTC().Format(time.RFC3339),
	}
}

// ListUsers 는 조건에 맞는 사용자 페이지를 반환한다.
func (s *AdminService) ListUsers(ctx context.Context, q ports.UserQuery) (*UserPage, error) {
	if q.Limit <= 0 || q.Limit > 200 {
		q.Limit = 50 // 상한을 두어 한 번에 전량을 긁어가지 못하게 한다
	}
	users, total, err := s.users.List(ctx, q)
	if err != nil {
		return nil, err
	}
	items := make([]AdminUser, 0, len(users))
	for _, u := range users {
		items = append(items, toAdminUser(u))
	}
	return &UserPage{Items: items, Total: total, Offset: q.Offset, Limit: q.Limit}, nil
}

// GetUser 는 사용자 상세(진행 포함)를 반환한다.
func (s *AdminService) GetUser(ctx context.Context, id string) (*UserDetail, error) {
	u, err := s.users.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// 학습 진행은 **앱이 실제로 쓰는 곳**에서 읽는다.
	//
	// 예전에는 cards.ProgressCountFor(진행 상태 표)를 읽었다. 그런데 앱은
	// 오래전부터 /api/progress/grade → 간격반복 상태(SRS)로만 기록한다.
	// 그 표에는 아무도 쓰지 않으므로, 172회를 푼 사람에게도 관리 화면이
	// "아직 학습 기록이 없는 계정입니다"를 띄웠다. 같은 화면 아래쪽 진단은
	// 16장을 세고 있는데도 그랬다 — 한 화면이 서로 다른 말을 하면 담당자는
	// 둘 다 믿지 않게 된다.
	learning, err := s.learningOf(ctx, id)
	if err != nil {
		return nil, err
	}
	return &UserDetail{User: toAdminUser(*u), Learning: learning}, nil
}

// learningOf 는 간격반복 기록에서 한 사람의 진행을 센다.
//
// 상자(box)로 상태를 가른다 — 진단·저장소 집계와 **같은 기준**(masteredBoxLevel)을
// 써야 "숙달 6장"과 "완료 6장"이 어긋나지 않는다.
func (s *AdminService) learningOf(ctx context.Context, userID string) (LearningSummary, error) {
	if s.data == nil {
		// 개인 데이터 저장소가 없는 구성에서는 진행을 셀 수 없다.
		// 0 으로 채워 '기록 없음'이 아니라 '셀 수 없음'으로 읽히게 둔다.
		return LearningSummary{}, nil
	}

	snap, err := s.data.LoadSync(ctx, userID)
	if err != nil {
		return LearningSummary{}, err
	}
	cards, err := s.cards.AllCards(ctx)
	if err != nil {
		return LearningSummary{}, err
	}

	var learning, mastered int64
	for _, st := range snap.Cards {
		if st.Box >= masteredBoxLevel {
			mastered++
		} else {
			learning++
		}
	}
	// 손대지 않은 문제 = 전체 − 기록이 있는 문제. 음수가 되지 않게 막는다
	// (문제가 지워졌는데 학습 기록만 남아 있을 수 있다).
	newCount := int64(len(cards)) - (learning + mastered)
	if newCount < 0 {
		newCount = 0
	}

	total := newCount + learning + mastered
	rate := 0.0
	if total > 0 {
		rate = round2(float64(mastered) / float64(total) * 100)
	}
	return LearningSummary{New: newCount, Learning: learning, Mastered: mastered, Rate: rate}, nil
}

// Actor 는 변경을 수행하는 관리자(감사 기록용).
type Actor struct {
	ID   string
	Name string
}

// SetUserRole 은 사용자 권한을 바꾼다.
//
// 두 가지를 막는다.
//   - 자기 자신의 권한 변경: 실수 한 번에 콘솔에서 스스로 쫓겨난다.
//   - 마지막 관리자의 강등: 아무도 콘솔에 들어올 수 없게 된다(복구는 DB 직접 수정뿐).
func (s *AdminService) SetUserRole(ctx context.Context, actor Actor, targetID string, role domain.Role) (*AdminUser, error) {
	if role != domain.RoleUser && role != domain.RoleAdmin {
		return nil, ErrInvalidInput{Reason: "알 수 없는 권한입니다"}
	}
	if targetID == actor.ID {
		return nil, ErrSelfLockout
	}
	u, err := s.users.FindByID(ctx, targetID)
	if err != nil {
		return nil, err
	}
	before := u.Role()
	if before == role {
		au := toAdminUser(*u)
		return &au, nil // 이미 그 상태 — 감사로그를 남길 변경이 없다
	}
	if before == domain.RoleAdmin && role == domain.RoleUser {
		if err := s.guardLastAdmin(ctx); err != nil {
			return nil, err
		}
	}

	u.RoleCd = role
	if err := s.users.Update(ctx, u); err != nil {
		return nil, err
	}
	s.record(ctx, actor, "user.role_change", "user", u.ID,
		fmt.Sprintf("%s 권한을 %s → %s 로 변경", displayName(*u), before, role))

	au := toAdminUser(*u)
	return &au, nil
}

// SetUserStatus 는 계정 상태(A 활성 / I 정지 / D 삭제표시)를 바꾼다.
func (s *AdminService) SetUserStatus(ctx context.Context, actor Actor, targetID, status string) (*AdminUser, error) {
	switch status {
	case "A", "I", "D":
	default:
		return nil, ErrInvalidInput{Reason: "알 수 없는 상태입니다(A/I/D)"}
	}
	if targetID == actor.ID {
		return nil, ErrSelfLockout
	}
	u, err := s.users.FindByID(ctx, targetID)
	if err != nil {
		return nil, err
	}
	before := u.StatusCd
	if before == status {
		au := toAdminUser(*u)
		return &au, nil
	}
	// 관리자를 정지시키는 것도 관리자 수를 줄이는 행위다 — 같은 규칙을 적용한다.
	if u.Role() == domain.RoleAdmin && status != "A" {
		if err := s.guardLastAdmin(ctx); err != nil {
			return nil, err
		}
	}

	u.StatusCd = status
	if err := s.users.Update(ctx, u); err != nil {
		return nil, err
	}
	s.record(ctx, actor, "user.status_change", "user", u.ID,
		fmt.Sprintf("%s 상태를 %s → %s 로 변경", displayName(*u), statusLabel(before), statusLabel(status)))

	au := toAdminUser(*u)
	return &au, nil
}

// guardLastAdmin 은 '활성 관리자'가 2명 미만이면 강등을 거부한다.
// 정지된 관리자는 로그인할 수 없으므로 머릿수에 넣지 않는다 —
// 넣으면 "관리자는 2명인데 아무도 못 들어오는" 상태가 만들어진다.
func (s *AdminService) guardLastAdmin(ctx context.Context) error {
	// 필요한 것은 "둘 이상인가"뿐이다. 전체를 세어 오면 관리자가 많은 조직에서
	// 목록 상한(예전에는 200)에 걸려 판단이 어긋날 수 있고, 세는 비용도 낭비다.
	admins, total, err := s.users.List(ctx, ports.UserQuery{
		Role: string(domain.RoleAdmin), Status: "A", Limit: 2,
	})
	if err != nil {
		return err
	}
	if total < 2 && len(admins) < 2 {
		return ErrLastAdmin
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// 문제(카드) 관리
// ─────────────────────────────────────────────────────────────────────────────

// AdminCard 는 관리 콘솔이 보는 카드 — 콘텐츠 + 전체 사용자 학습 현황.
type AdminCard struct {
	domain.Card
	Learning int64 `json:"learning"`
	Mastered int64 `json:"mastered"`
}

// CardQuery 는 카드 목록 필터.
type CardQuery struct {
	Search   string
	Category string
	Type     string
	Offset   int
	Limit    int
	// Sort: "" (제목) | category | type | difficulty | learning | mastered
	Sort string
	Desc bool
}

// CardPage 는 카드 목록 한 페이지.
type CardPage struct {
	Items  []AdminCard `json:"items"`
	Total  int         `json:"total"`
	Offset int         `json:"offset"`
	Limit  int         `json:"limit"`
}

// ListCards 는 카드를 필터링해 페이지로 반환한다.
// 카드 수는 수백 장 규모라 저장소 전량 조회 후 메모리에서 거른다 —
// 수만 장으로 커지면 이 필터를 저장소로 내려야 한다(그때 CardQuery 를 ports 로 옮긴다).
func (s *AdminService) ListCards(ctx context.Context, q CardQuery) (*CardPage, error) {
	cards, err := s.cards.AllCards(ctx)
	if err != nil {
		return nil, err
	}
	stats, err := s.cards.CardProgressStats(ctx)
	if err != nil {
		return nil, err
	}

	needle := strings.ToLower(strings.TrimSpace(q.Search))
	matched := make([]AdminCard, 0, len(cards))
	for _, c := range cards {
		if q.Category != "" && c.CategoryCd != q.Category {
			continue
		}
		if q.Type != "" && string(c.CardTypeCd) != q.Type {
			continue
		}
		if needle != "" {
			hay := strings.ToLower(strings.Join([]string{
				c.TitleTxt, c.QuestionTxt, c.TopicNm, c.SubCategoryNm, c.SourceTxt,
			}, " "))
			if !strings.Contains(hay, needle) {
				continue
			}
		}
		st := stats[c.ID]
		matched = append(matched, AdminCard{Card: c, Learning: st.Learning, Mastered: st.Mastered})
	}
	sortCards(matched, q.Sort, q.Desc)

	limit := q.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	lo, hi := clampPage(q.Offset, limit, len(matched))
	return &CardPage{Items: matched[lo:hi], Total: len(matched), Offset: lo, Limit: limit}, nil
}

// sortCards 는 요청한 기준으로 카드를 정렬한다.
// 저장소 순서에 기대지 않고 항상 명시적으로 정렬해야 페이지가 흔들리지 않는다.
// 동률은 항상 ID 로 갈라 순서를 고정한다(페이지 간 중복/누락 방지).
func sortCards(cards []AdminCard, field string, desc bool) {
	sort.Slice(cards, func(i, j int) bool {
		a, b := cards[i], cards[j]
		var less, equal bool
		switch field {
		case "category":
			less, equal = a.CategoryCd < b.CategoryCd, a.CategoryCd == b.CategoryCd
		case "type":
			less, equal = a.CardTypeCd < b.CardTypeCd, a.CardTypeCd == b.CardTypeCd
		case "difficulty":
			// 사전순(EASY/HARD/MEDIUM)이 아니라 실제 난이도 순으로 정렬해야 의미가 있다.
			less, equal = difficultyRank(a.DifficultyCd) < difficultyRank(b.DifficultyCd),
				a.DifficultyCd == b.DifficultyCd
		case "learning":
			less, equal = a.Learning < b.Learning, a.Learning == b.Learning
		case "mastered":
			less, equal = a.Mastered < b.Mastered, a.Mastered == b.Mastered
		default: // 제목
			at, bt := firstNonEmpty(a.TitleTxt, a.QuestionTxt), firstNonEmpty(b.TitleTxt, b.QuestionTxt)
			less, equal = at < bt, at == bt
		}
		if equal {
			return a.ID < b.ID
		}
		if desc {
			return !less
		}
		return less
	})
}

// difficultyRank 는 난이도를 크기 비교가 가능한 순번으로 바꾼다.
func difficultyRank(d domain.Difficulty) int {
	switch d {
	case domain.Easy:
		return 0
	case domain.Medium:
		return 1
	case domain.Hard:
		return 2
	}
	return 3
}

// GetCard 는 카드 한 장을 반환한다.
func (s *AdminService) GetCard(ctx context.Context, id string) (*domain.Card, error) {
	return s.cards.FindCard(ctx, id)
}

// CreateCard 는 새 문제를 만든다. ID 는 서버가 정한다(클라이언트가 정하면 덮어쓰기 사고가 난다).
func (s *AdminService) CreateCard(ctx context.Context, actor Actor, c domain.Card) (*domain.Card, error) {
	if err := ValidateCard(c); err != nil {
		return nil, err
	}
	c = normalizeCard(c)
	c.ID = newID("card_")
	c.UpdatedAt = s.now()

	if err := s.cards.InsertCards(ctx, []domain.Card{c}); err != nil {
		return nil, err
	}
	s.record(ctx, actor, "card.create", "card", c.ID,
		fmt.Sprintf("문제 등록: %s", firstNonEmpty(c.TitleTxt, c.QuestionTxt)))
	return &c, nil
}

// UpdateCard 는 기존 문제를 고친다.
func (s *AdminService) UpdateCard(ctx context.Context, actor Actor, id string, c domain.Card) (*domain.Card, error) {
	current, err := s.cards.FindCard(ctx, id)
	if err != nil {
		return nil, err
	}
	// 낙관적 동시성 — 요청이 "내가 본 시각"을 보냈는데 저장소의 시각이 그보다 뒤라면,
	// 내가 화면을 연 뒤에 다른 사람이 먼저 고친 것이다. 그대로 저장하면 그 수정이
	// 조용히 사라지므로 거부하고 새로고침을 요구한다.
	// (시각을 보내지 않은 요청은 검사하지 않는다 — 기존 클라이언트가 깨지지 않게.)
	if !c.UpdatedAt.IsZero() && current.UpdatedAt.After(c.UpdatedAt) {
		return nil, ErrStaleWrite
	}
	if err := ValidateCard(c); err != nil {
		return nil, err
	}
	c = normalizeCard(c)
	c.ID = id // 경로의 ID 가 진실이다 — body 의 id 로 다른 카드를 덮어쓸 수 없게 한다
	c.UpdatedAt = s.now()

	if err := s.cards.UpdateCard(ctx, c); err != nil {
		return nil, err
	}
	s.record(ctx, actor, "card.update", "card", id,
		fmt.Sprintf("문제 수정: %s", firstNonEmpty(c.TitleTxt, c.QuestionTxt)))
	return &c, nil
}

// DeleteCard 는 문제를 지운다(딸린 진행 기록도 저장소가 함께 지운다).
func (s *AdminService) DeleteCard(ctx context.Context, actor Actor, id string) error {
	existing, err := s.cards.FindCard(ctx, id)
	if err != nil {
		return err
	}
	if err := s.cards.DeleteCard(ctx, id); err != nil {
		return err
	}
	s.record(ctx, actor, "card.delete", "card", id,
		fmt.Sprintf("문제 삭제: %s", firstNonEmpty(existing.TitleTxt, existing.QuestionTxt)))
	return nil
}

// ValidateCard 는 문제 한 장이 학습 화면에서 실제로 동작할 수 있는지 검사한다.
// 앱에서 깨지는 문제가 등록되면 그 카드를 만난 모든 사용자의 학습이 막히므로,
// 저장 전에 거른다(앱 쪽 validateCardDraft 와 같은 규칙).
func ValidateCard(c domain.Card) error {
	if strings.TrimSpace(c.CategoryCd) == "" {
		return ErrInvalidInput{Reason: "분야(category_cd)는 필수입니다"}
	}
	if strings.TrimSpace(c.QuestionTxt) == "" {
		return ErrInvalidInput{Reason: "문제 내용(question_txt)은 필수입니다"}
	}
	if strings.TrimSpace(c.PrincipleTxt) == "" {
		return ErrInvalidInput{Reason: "해설(principle_txt)은 필수입니다"}
	}
	switch c.CardTypeCd {
	case domain.Explanation:
		// 설명형은 보기·정답이 없다.
	case domain.OX, domain.Choice:
		if len(c.Choices) < 2 {
			return ErrInvalidInput{Reason: "보기는 2개 이상이어야 합니다"}
		}
		if c.AnswerIndex == nil {
			return ErrInvalidInput{Reason: "정답 번호(answer_index)는 필수입니다"}
		}
		// 범위를 벗어난 정답 번호는 앱에서 '정답 없음' 상태를 만들어 채점 자체가 불가능해진다.
		if *c.AnswerIndex < 0 || *c.AnswerIndex >= len(c.Choices) {
			return ErrInvalidInput{Reason: "정답 번호가 보기 범위를 벗어났습니다"}
		}
	default:
		return ErrInvalidInput{Reason: "알 수 없는 문제 형식입니다(EXPLANATION/OX/CHOICE)"}
	}
	switch c.DifficultyCd {
	case domain.Easy, domain.Medium, domain.Hard:
	default:
		return ErrInvalidInput{Reason: "알 수 없는 난이도입니다(EASY/MEDIUM/HARD)"}
	}
	return nil
}

// normalizeCard 는 저장 전에 값을 다듬는다.
// 앞뒤 공백은 화면에서 어긋난 정렬로 보이고, 설명형에 남은 보기·정답은
// 나중에 형식을 바꿨을 때 유령 데이터로 되살아난다.
func normalizeCard(c domain.Card) domain.Card {
	c.CategoryCd = strings.TrimSpace(c.CategoryCd)
	c.SubCategoryNm = strings.TrimSpace(c.SubCategoryNm)
	c.TopicNm = strings.TrimSpace(c.TopicNm)
	c.TitleTxt = strings.TrimSpace(c.TitleTxt)
	c.SituationTxt = strings.TrimSpace(c.SituationTxt)
	c.QuestionTxt = strings.TrimSpace(c.QuestionTxt)
	c.PrincipleTxt = strings.TrimSpace(c.PrincipleTxt)
	c.ProcessTxt = strings.TrimSpace(c.ProcessTxt)
	c.ConclusionTxt = strings.TrimSpace(c.ConclusionTxt)
	c.SourceTxt = strings.TrimSpace(c.SourceTxt)

	if c.CardTypeCd == domain.Explanation {
		c.Choices = nil
		c.AnswerIndex = nil
	} else {
		trimmed := make([]string, 0, len(c.Choices))
		for _, ch := range c.Choices {
			if t := strings.TrimSpace(ch); t != "" {
				trimmed = append(trimmed, t)
			}
		}
		c.Choices = trimmed
	}
	if c.StudySeconds <= 0 {
		c.StudySeconds = 60
	}
	return c
}

// ─────────────────────────────────────────────────────────────────────────────
// 감사 로그
// ─────────────────────────────────────────────────────────────────────────────

// MetricsSnapshot 은 실시간 지표 스냅샷을 반환한다(SSE·단발 조회 공용).
func (s *AdminService) MetricsSnapshot() MetricsSnapshot { return s.metrics.Snapshot() }

// AuditLogs 는 최근 관리 행위 이력을 반환한다.
func (s *AdminService) AuditLogs(ctx context.Context, limit int) ([]domain.AuditLog, error) {
	// 상한을 두지 않으면 ?limit=99999999 한 방으로 전체 이력을 한 응답에 실어 보내게 된다.
	if limit <= 0 || limit > maxAuditLimit {
		limit = 100
	}
	return s.audit.List(ctx, limit)
}

// record 는 감사 기록을 남긴다.
// 기록 실패가 이미 성공한 변경을 되돌리지는 않는다 — 그러면 사용자는
// "실패했다"는 응답을 받고도 변경은 반영된 더 나쁜 상태가 된다.
// 대신 흔적을 잃었다는 사실 자체를 반드시 알린다.
func (s *AdminService) record(ctx context.Context, actor Actor, action, targetType, targetID, summary string) {
	l := domain.AuditLog{
		ID:         fmt.Sprintf("audit-%d", s.now().UnixNano()),
		ActorID:    actor.ID,
		ActorName:  actor.Name,
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
		Summary:    summary,
		CreatedAt:  s.now(),
	}
	if err := s.audit.Append(ctx, l); err != nil {
		log.Printf("[admin] 감사 기록 실패 action=%s target=%s/%s: %v", action, targetType, targetID, err)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

func startOfDay(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

func clampPage(offset, limit, n int) (int, int) {
	if offset < 0 {
		offset = 0
	}
	if offset > n {
		offset = n
	}
	hi := offset + limit
	if hi > n {
		hi = n
	}
	return offset, hi
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func displayName(u domain.User) string {
	return firstNonEmpty(u.UserNm, u.Nickname, u.LoginID, u.ID)
}

func statusLabel(cd string) string {
	switch cd {
	case "A", "":
		return "활성"
	case "I":
		return "정지"
	case "D":
		return "삭제"
	}
	return cd
}

func cardTypeLabel(t domain.CardType) string {
	switch t {
	case domain.Explanation:
		return "설명형"
	case domain.OX:
		return "OX"
	case domain.Choice:
		return "객관식"
	}
	return string(t)
}

func difficultyLabel(d domain.Difficulty) string {
	switch d {
	case domain.Easy:
		return "쉬움"
	case domain.Medium:
		return "보통"
	case domain.Hard:
		return "어려움"
	}
	return string(d)
}

func sortedLabelCounts(m map[string]int64) []LabelCount {
	out := make([]LabelCount, 0, len(m))
	for label, n := range m {
		out = append(out, LabelCount{Label: label, Count: n})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count == out[j].Count {
			return out[i].Label < out[j].Label
		}
		return out[i].Count > out[j].Count
	})
	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 신고 · 공지
// ─────────────────────────────────────────────────────────────────────────────

// AdminReport 는 관리 콘솔이 보는 신고 한 건.
//
// 원본 Report 에는 id 만 들어 있다. 그대로 보여 주면 관리자는 "card_42 를 u_7f3a 가
// 신고했다"를 읽고, 무슨 문제인지 확인하려고 다시 검색해야 한다. 서버가 이미 알고
// 있는 정보를 붙여서 주면 그 왕복이 사라진다.
type AdminReport struct {
	domain.Report
	CardTitle    string `json:"card_title"`
	CardCategory string `json:"card_category"`
	// CardMissing 은 신고된 카드가 이미 삭제됐음을 뜻한다.
	// 이 표시가 없으면 관리자는 사라진 카드를 계속 찾아다닌다.
	CardMissing  bool   `json:"card_missing"`
	ReporterName string `json:"reporter_name"`
}

// Reports 는 최근 신고를 카드·신고자 정보와 함께 반환한다.
func (s *AdminService) Reports(ctx context.Context, limit int) ([]AdminReport, error) {
	if s.data == nil {
		return []AdminReport{}, nil
	}
	if limit <= 0 || limit > maxReportLimit {
		limit = 100
	}
	raw, err := s.data.ListReports(ctx, limit)
	if err != nil {
		return nil, err
	}

	// 카드는 한 번만 통째로 읽어 맵으로 쓴다 — 신고마다 조회하면 N+1 이 된다.
	cards, err := s.cards.AllCards(ctx)
	if err != nil {
		return nil, err
	}
	byID := make(map[string]domain.Card, len(cards))
	for _, c := range cards {
		byID[c.ID] = c
	}

	// 신고자 이름도 마찬가지다. 같은 사람이 여러 건 신고하는 경우가 흔하므로 캐시한다.
	names := map[string]string{}

	out := make([]AdminReport, 0, len(raw))
	for _, r := range raw {
		item := AdminReport{Report: r}
		if c, ok := byID[r.CardID]; ok {
			item.CardTitle = firstNonEmpty(c.TitleTxt, c.QuestionTxt)
			item.CardCategory = c.CategoryCd
		} else {
			item.CardMissing = true
		}
		if name, ok := names[r.UserID]; ok {
			item.ReporterName = name
			out = append(out, item)
			continue
		}

		u, err := s.users.FindByID(ctx, r.UserID)
		switch {
		case err == nil:
			item.ReporterName = displayName(*u)
			names[r.UserID] = item.ReporterName
		case isNotFound(err):
			// 탈퇴했거나 지워진 계정 — 신고 자체는 유효하므로 버리지 않는다.
			item.ReporterName = unknownReporter
			names[r.UserID] = item.ReporterName
		default:
			// 일시적인 조회 실패(연결 끊김 등)다. 여기서 캐시에 넣으면 이번 응답
			// 내내 '탈퇴한 사용자'로 굳어, 멀쩡한 계정이 사라진 것처럼 보인다.
			item.ReporterName = unknownReporter
		}
		out = append(out, item)
	}
	return out, nil
}

// maxReportLimit 은 신고 목록 한 번에 가져갈 수 있는 최대 건수.
const maxReportLimit = 500

// unknownReporter 는 신고자 계정을 찾지 못했을 때 보여 줄 이름.
const unknownReporter = "(알 수 없는 사용자)"

// NotifyInput 은 관리자 공지 발송 요청.
type NotifyInput struct {
	Title string
	Body  string
	// TypeCd 는 앱이 아이콘·색을 고르는 데 쓴다(NEW/REMIND/ACHIEVEMENT/SYSTEM).
	TypeCd string
	// UserID 가 비면 전체 발송, 있으면 그 사람에게만.
	UserID string
}

// notifyMaxRecipients 는 한 번에 보낼 수 있는 최대 인원.
//
// 상한이 필요한 이유 — 전체 공지는 사용자 수만큼 행을 만든다. 사용자가 수만 명으로
// 늘어난 뒤 실수로 누른 한 번의 발송이 저장소를 채울 수 있다. 여기서 막고,
// 넘어가면 "대상이 너무 많다"고 분명히 알린다(조용히 일부만 보내지 않는다).
const notifyMaxRecipients = 5000

// Notify 는 알림을 만들어 저장한다(전체 또는 한 사람).
//
// 알림 테이블은 있는데 그것을 만드는 주체가 없었다. 앱은 /api/notifications 를
// 부르지만 언제나 빈 배열만 받았다 — 기능이 반쪽이었던 셈이다.
func (s *AdminService) Notify(ctx context.Context, actor Actor, in NotifyInput) (int, error) {
	if s.data == nil {
		return 0, ErrInvalidInput{Reason: "알림 저장소가 연결되어 있지 않습니다"}
	}
	title := strings.TrimSpace(in.Title)
	body := strings.TrimSpace(in.Body)
	if title == "" {
		return 0, ErrInvalidInput{Reason: "제목은 필수입니다"}
	}
	if len([]rune(title)) > 60 {
		return 0, ErrInvalidInput{Reason: "제목은 60자를 넘을 수 없습니다"}
	}
	if len([]rune(body)) > 500 {
		return 0, ErrInvalidInput{Reason: "내용은 500자를 넘을 수 없습니다"}
	}
	typeCd := strings.ToUpper(strings.TrimSpace(in.TypeCd))
	switch typeCd {
	case "NEW", "REMIND", "ACHIEVEMENT", "SYSTEM":
	case "":
		typeCd = "SYSTEM"
	default:
		return 0, ErrInvalidInput{Reason: "알 수 없는 알림 종류입니다"}
	}

	recipients, scope, err := s.notifyRecipients(ctx, strings.TrimSpace(in.UserID))
	if err != nil {
		return 0, err
	}
	if len(recipients) == 0 {
		return 0, ErrInvalidInput{Reason: "받을 사람이 없습니다"}
	}

	now := s.now()
	list := make([]domain.Notification, 0, len(recipients))
	for _, uid := range recipients {
		list = append(list, domain.Notification{
			ID:        newID("nt_"),
			UserID:    uid,
			TypeCd:    typeCd,
			TitleTxt:  title,
			DescTxt:   body,
			CreatedAt: now,
		})
	}
	if err := s.data.AddNotifications(ctx, list); err != nil {
		return 0, err
	}
	s.record(ctx, actor, "notification.send", "notification", "",
		fmt.Sprintf("%s 알림 발송: %s (%d명)", scope, title, len(list)))
	return len(list), nil
}

// notifyRecipients 는 발송 대상과 그 범위 설명을 만든다.
func (s *AdminService) notifyRecipients(ctx context.Context, userID string) ([]string, string, error) {
	if userID != "" {
		u, err := s.users.FindByID(ctx, userID)
		if err != nil {
			return nil, "", err
		}
		return []string{u.ID}, "개별", nil
	}
	// 전체 발송 — 정지·삭제된 계정은 제외한다. 들어올 수 없는 사람에게 보내 봐야
	// 읽히지 않고 저장소만 채운다.
	users, total, err := s.users.List(ctx, ports.UserQuery{Status: "A", Limit: notifyMaxRecipients})
	if err != nil {
		return nil, "", err
	}
	if total > int64(len(users)) {
		return nil, "", ErrInvalidInput{
			Reason: fmt.Sprintf("대상이 %d명으로 한 번에 보낼 수 있는 %d명을 넘습니다", total, notifyMaxRecipients),
		}
	}
	ids := make([]string, 0, len(users))
	for _, u := range users {
		ids = append(ids, u.ID)
	}
	return ids, "전체", nil
}
