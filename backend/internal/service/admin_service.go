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
	metrics *Metrics,
	storeKind string,
) *AdminService {
	return &AdminService{
		users: users, cards: cards, audit: audit,
		metrics: metrics, storeKind: storeKind, now: time.Now,
	}
}

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
		Learning: learningSummary(progress),
		Metrics:  snapshot,
		Service:  s.ServiceStatus(ctx),
	}, nil
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
	progress, err := s.cards.ProgressCountFor(ctx, id)
	if err != nil {
		return nil, err
	}
	return &UserDetail{User: toAdminUser(*u), Learning: learningSummary(progress)}, nil
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
	admins, _, err := s.users.List(ctx, ports.UserQuery{
		Role: string(domain.RoleAdmin), Status: "A", Limit: 200,
	})
	if err != nil {
		return err
	}
	if len(admins) < 2 {
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
	// 저장소 순서에 기대지 않도록 명시적으로 정렬한다(페이지가 흔들리지 않게).
	sort.Slice(matched, func(i, j int) bool { return matched[i].ID < matched[j].ID })

	limit := q.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	lo, hi := clampPage(q.Offset, limit, len(matched))
	return &CardPage{Items: matched[lo:hi], Total: len(matched), Offset: lo, Limit: limit}, nil
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
	c.ID = fmt.Sprintf("card-%d", s.now().UnixNano())

	if err := s.cards.InsertCards(ctx, []domain.Card{c}); err != nil {
		return nil, err
	}
	s.record(ctx, actor, "card.create", "card", c.ID,
		fmt.Sprintf("문제 등록: %s", firstNonEmpty(c.TitleTxt, c.QuestionTxt)))
	return &c, nil
}

// UpdateCard 는 기존 문제를 고친다.
func (s *AdminService) UpdateCard(ctx context.Context, actor Actor, id string, c domain.Card) (*domain.Card, error) {
	if _, err := s.cards.FindCard(ctx, id); err != nil {
		return nil, err
	}
	if err := ValidateCard(c); err != nil {
		return nil, err
	}
	c = normalizeCard(c)
	c.ID = id // 경로의 ID 가 진실이다 — body 의 id 로 다른 카드를 덮어쓸 수 없게 한다

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
