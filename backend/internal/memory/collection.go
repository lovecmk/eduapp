package memory

import (
	"context"
	"sync"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// CollectionRepo 는 ports.CollectionRepository 의 인메모리 구현.
type CollectionRepo struct {
	mu    sync.RWMutex
	items map[string]domain.Collection
}

// NewCollectionRepo 는 인메모리 도감 저장소를 만든다.
func NewCollectionRepo() *CollectionRepo {
	return &CollectionRepo{items: map[string]domain.Collection{}}
}

func (r *CollectionRepo) LoadCollection(_ context.Context, userID string) (domain.Collection, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	c, ok := r.items[userID]
	if !ok {
		return domain.NewCollection(userID), nil
	}
	return cloneCollection(c), nil
}

func (r *CollectionRepo) SaveCollection(_ context.Context, c domain.Collection) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	// 저장할 때도 복사해 둔다 — 호출자가 들고 있는 맵을 나중에 고치면
	// 저장소 안의 값이 함께 바뀌어 버린다(인메모리 어댑터의 고전적인 함정).
	r.items[c.UserID] = cloneCollection(c)
	return nil
}

func cloneCollection(c domain.Collection) domain.Collection {
	out := c
	out.Owned = make(map[string]int, len(c.Owned))
	for k, v := range c.Owned {
		out.Owned[k] = v
	}
	out.ClaimedRules = make(map[string]int, len(c.ClaimedRules))
	for k, v := range c.ClaimedRules {
		out.ClaimedRules[k] = v
	}
	out.RedeemedCodes = append([]string(nil), c.RedeemedCodes...)
	return out
}

var _ ports.CollectionRepository = (*CollectionRepo)(nil)
