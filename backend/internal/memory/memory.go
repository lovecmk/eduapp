// Package memory 는 ports 인터페이스의 인메모리 구현이다.
// 테스트·로컬 실행(무 MongoDB) 및 저장소 교체 가능성(이식성) 검증에 쓰인다.
package memory

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// UserRepo 는 인메모리 사용자 저장소.
type UserRepo struct {
	mu    sync.RWMutex
	byID  map[string]domain.User
	login map[string]string // loginID -> id
}

func NewUserRepo() *UserRepo {
	return &UserRepo{byID: map[string]domain.User{}, login: map[string]string{}}
}

func (r *UserRepo) FindByLoginID(_ context.Context, loginID string) (*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	id, ok := r.login[loginID]
	if !ok {
		return nil, ports.ErrNotFound{Entity: "user"}
	}
	u := r.byID[id]
	return &u, nil
}

func (r *UserRepo) FindByNickname(_ context.Context, nickname string) (*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, u := range r.byID {
		if u.Nickname != "" && strings.EqualFold(u.Nickname, nickname) {
			uu := u
			return &uu, nil
		}
	}
	return nil, ports.ErrNotFound{Entity: "user"}
}

func (r *UserRepo) FindByID(_ context.Context, id string) (*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	u, ok := r.byID[id]
	if !ok {
		return nil, ports.ErrNotFound{Entity: "user"}
	}
	return &u, nil
}

func (r *UserRepo) Create(_ context.Context, u *domain.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.byID[u.ID] = *u
	r.login[u.LoginID] = u.ID
	return nil
}

func (r *UserRepo) Update(_ context.Context, u *domain.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.byID[u.ID]; !ok {
		return ports.ErrNotFound{Entity: "user"}
	}
	r.byID[u.ID] = *u
	r.login[u.LoginID] = u.ID
	return nil
}

func (r *UserRepo) Count(_ context.Context) (int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return int64(len(r.byID)), nil
}

// List 는 조건에 맞는 사용자를 가입 최신순으로 잘라서 반환한다.
// 맵 순회는 순서가 무작위이므로 반드시 정렬해야 페이지가 안정적이다
// (정렬하지 않으면 같은 조건으로 두 번 요청했을 때 다른 결과가 나온다).
func (r *UserRepo) List(_ context.Context, q ports.UserQuery) ([]domain.User, int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	matched := make([]domain.User, 0, len(r.byID))
	for _, u := range r.byID {
		if matchUser(u, q) {
			matched = append(matched, u)
		}
	}
	sort.Slice(matched, func(i, j int) bool {
		if matched[i].CreatedAt.Equal(matched[j].CreatedAt) {
			return matched[i].ID < matched[j].ID // 동시 가입 시에도 순서를 고정
		}
		return matched[i].CreatedAt.After(matched[j].CreatedAt)
	})

	total := int64(len(matched))
	lo, hi := pageBounds(q.Offset, q.Limit, len(matched))
	return matched[lo:hi], total, nil
}

func (r *UserRepo) CountByRole(_ context.Context) (map[string]int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := map[string]int64{string(domain.RoleUser): 0, string(domain.RoleAdmin): 0}
	for _, u := range r.byID {
		out[string(u.Role())]++
	}
	return out, nil
}

func (r *UserRepo) CountCreatedSince(_ context.Context, since time.Time) (int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var n int64
	for _, u := range r.byID {
		if u.CreatedAt.After(since) {
			n++
		}
	}
	return n, nil
}

// matchUser 는 UserQuery 조건을 하나라도 어기면 false.
func matchUser(u domain.User, q ports.UserQuery) bool {
	if q.Role != "" && string(u.Role()) != q.Role {
		return false
	}
	if q.Status != "" && u.StatusCd != q.Status {
		return false
	}
	if q.Membership != "" && string(u.MembershipCd) != q.Membership {
		return false
	}
	if s := strings.TrimSpace(q.Search); s != "" {
		needle := strings.ToLower(s)
		hay := strings.ToLower(u.UserNm + " " + u.Nickname + " " + u.LoginID + " " + u.EmailAddr + " " + u.OrgNm)
		if !strings.Contains(hay, needle) {
			return false
		}
	}
	return true
}

// pageBounds 는 offset/limit 을 슬라이스 범위로 안전하게 환산한다.
// 범위를 넘는 offset 은 빈 페이지가 되어야지 panic 이 나서는 안 된다.
func pageBounds(offset, limit, n int) (int, int) {
	if limit <= 0 {
		limit = 50
	}
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

// CardRepo 는 인메모리 카드/진행 저장소.
type CardRepo struct {
	mu       sync.RWMutex
	cards    []domain.Card
	progress map[string]domain.Progress // key: userID|cardID
}

func NewCardRepo() *CardRepo {
	return &CardRepo{progress: map[string]domain.Progress{}}
}

func key(userID, cardID string) string { return userID + "|" + cardID }

func (r *CardRepo) AllCards(_ context.Context) ([]domain.Card, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]domain.Card, len(r.cards))
	copy(out, r.cards)
	return out, nil
}

func (r *CardRepo) CountCards(_ context.Context) (int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return int64(len(r.cards)), nil
}

func (r *CardRepo) InsertCards(_ context.Context, cards []domain.Card) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.cards = append(r.cards, cards...)
	return nil
}

func (r *CardRepo) ProgressFor(_ context.Context, userID string) (map[string]domain.Progress, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := map[string]domain.Progress{}
	for _, p := range r.progress {
		if p.UserID == userID {
			out[p.CardID] = p
		}
	}
	return out, nil
}

func (r *CardRepo) UpsertProgress(_ context.Context, p domain.Progress) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.progress[key(p.UserID, p.CardID)] = p
	return nil
}

func (r *CardRepo) FindCard(_ context.Context, id string) (*domain.Card, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, c := range r.cards {
		if c.ID == id {
			cc := c
			return &cc, nil
		}
	}
	return nil, ports.ErrNotFound{Entity: "card"}
}

func (r *CardRepo) UpdateCard(_ context.Context, c domain.Card) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range r.cards {
		if r.cards[i].ID == c.ID {
			r.cards[i] = c
			return nil
		}
	}
	return ports.ErrNotFound{Entity: "card"}
}

// DeleteCard 는 카드와 그에 딸린 모든 진행 기록을 함께 지운다.
// 진행 기록만 남으면 어떤 카드였는지 알 수 없어 통계가 영원히 어긋난다.
func (r *CardRepo) DeleteCard(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	idx := -1
	for i := range r.cards {
		if r.cards[i].ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return ports.ErrNotFound{Entity: "card"}
	}
	r.cards = append(r.cards[:idx], r.cards[idx+1:]...)
	for k, p := range r.progress {
		if p.CardID == id {
			delete(r.progress, k)
		}
	}
	return nil
}

func (r *CardRepo) ProgressSummary(_ context.Context) (map[string]int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := emptyStatusCounts()
	for _, p := range r.progress {
		out[string(p.Status)]++
	}
	return out, nil
}

func (r *CardRepo) ProgressCountFor(_ context.Context, userID string) (map[string]int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := emptyStatusCounts()
	for _, p := range r.progress {
		if p.UserID == userID {
			out[string(p.Status)]++
		}
	}
	return out, nil
}

func (r *CardRepo) CardProgressStats(_ context.Context) (map[string]ports.CardStat, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := map[string]ports.CardStat{}
	for _, p := range r.progress {
		s := out[p.CardID]
		switch p.Status {
		case domain.StatusLearning:
			s.Learning++
		case domain.StatusMastered:
			s.Mastered++
		}
		out[p.CardID] = s
	}
	return out, nil
}

// emptyStatusCounts 는 세 상태를 모두 0 으로 채운 맵을 만든다.
// 없는 상태를 키 자체가 없는 채로 두면 대시보드에서 "0" 대신 빈칸이 뜬다.
func emptyStatusCounts() map[string]int64 {
	return map[string]int64{
		string(domain.StatusNew):      0,
		string(domain.StatusLearning): 0,
		string(domain.StatusMastered): 0,
	}
}

// AuditRepo 는 인메모리 감사로그 저장소.
// 무제한으로 쌓이면 장시간 구동 시 메모리를 먹으므로 상한을 둔다
// (영구 보존이 필요하면 STORE=postgres/mongo 를 쓴다).
type AuditRepo struct {
	mu   sync.RWMutex
	logs []domain.AuditLog // 오래된 것이 앞
	max  int
}

func NewAuditRepo() *AuditRepo { return &AuditRepo{max: 1000} }

func (r *AuditRepo) Append(_ context.Context, l domain.AuditLog) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.logs = append(r.logs, l)
	if len(r.logs) > r.max {
		r.logs = r.logs[len(r.logs)-r.max:]
	}
	return nil
}

func (r *AuditRepo) List(_ context.Context, limit int) ([]domain.AuditLog, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if limit <= 0 || limit > len(r.logs) {
		limit = len(r.logs)
	}
	// 최신순으로 뒤집어 반환.
	out := make([]domain.AuditLog, 0, limit)
	for i := len(r.logs) - 1; i >= len(r.logs)-limit; i-- {
		out = append(out, r.logs[i])
	}
	return out, nil
}

// PushTokenRepo 는 인메모리 푸시 토큰 저장소.
type PushTokenRepo struct {
	mu     sync.RWMutex
	tokens map[string]domain.PushToken // token -> record
}

func NewPushTokenRepo() *PushTokenRepo {
	return &PushTokenRepo{tokens: map[string]domain.PushToken{}}
}

func (r *PushTokenRepo) Save(_ context.Context, t domain.PushToken) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tokens[t.Token] = t
	return nil
}

func (r *PushTokenRepo) All(_ context.Context) ([]domain.PushToken, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]domain.PushToken, 0, len(r.tokens))
	for _, t := range r.tokens {
		out = append(out, t)
	}
	return out, nil
}

func (r *PushTokenRepo) Delete(_ context.Context, token string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.tokens, token)
	return nil
}
