// Package seed 는 초기 카드 콘텐츠를 임베드하고 저장소에 주입한다.
package seed

import (
	"context"
	_ "embed"
	"encoding/json"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

//go:embed cards_seed.json
var cardsJSON []byte

// Cards 는 임베드된 시드 JSON 을 도메인 카드로 파싱한다.
func Cards() ([]domain.Card, error) {
	var cards []domain.Card
	if err := json.Unmarshal(cardsJSON, &cards); err != nil {
		return nil, err
	}
	return cards, nil
}

// EnsureCards 는 cards 컬렉션이 비어 있으면 시드를 주입한다(idempotent).
func EnsureCards(ctx context.Context, repo ports.CardRepository) (int, error) {
	n, err := repo.CountCards(ctx)
	if err != nil {
		return 0, err
	}
	if n > 0 {
		return 0, nil
	}
	cards, err := Cards()
	if err != nil {
		return 0, err
	}
	if err := repo.InsertCards(ctx, cards); err != nil {
		return 0, err
	}
	return len(cards), nil
}
