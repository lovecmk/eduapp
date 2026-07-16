// Package ports 는 서비스 계층이 의존하는 저장소 인터페이스(포트)를 정의한다.
// 서비스는 구체 구현(MongoDB)이 아니라 이 인터페이스에만 의존하므로,
// 저장소를 Postgres/메모리 등으로 교체해도 서비스 코드는 변경되지 않는다(이식성).
package ports

import (
	"context"

	"github.com/lovecmk/eduapp/backend/internal/domain"
)

// UserRepository 는 사용자 영속화 포트.
type UserRepository interface {
	FindByLoginID(ctx context.Context, loginID string) (*domain.User, error)
	FindByID(ctx context.Context, id string) (*domain.User, error)
	Create(ctx context.Context, u *domain.User) error
	Count(ctx context.Context) (int64, error)
}

// CardRepository 는 카드 콘텐츠 + 개인 진행 상태 영속화 포트.
type CardRepository interface {
	AllCards(ctx context.Context) ([]domain.Card, error)
	CountCards(ctx context.Context) (int64, error)
	InsertCards(ctx context.Context, cards []domain.Card) error

	// ProgressFor 는 특정 사용자의 (cardID -> Progress) 맵을 반환한다.
	ProgressFor(ctx context.Context, userID string) (map[string]domain.Progress, error)
	UpsertProgress(ctx context.Context, p domain.Progress) error
}

// ErrNotFound 는 조회 대상이 없을 때 저장소가 반환하는 표준 오류.
type ErrNotFound struct{ Entity string }

func (e ErrNotFound) Error() string { return e.Entity + " not found" }
