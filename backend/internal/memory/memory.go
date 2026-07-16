// Package memory 는 ports 인터페이스의 인메모리 구현이다.
// 테스트·로컬 실행(무 MongoDB) 및 저장소 교체 가능성(이식성) 검증에 쓰인다.
package memory

import (
	"context"
	"sync"

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

func (r *UserRepo) Count(_ context.Context) (int64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return int64(len(r.byID)), nil
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
