// Package service 는 비즈니스 로직(유스케이스)을 담는다.
// 저장소 인터페이스(ports)에만 의존하며 HTTP/DB 세부는 모른다.
package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"strconv"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// CardService 는 카드 조회·등록·진행 상태 갱신을 담당한다.
//
// '오늘 무엇을 낼 것인가'는 여기 없다 — 그것은 사람마다 다른 편성이라
// LearningService(+daily_plan.go)가 맡는다.
type CardService struct {
	repo ports.CardRepository
}

// NewCardService 는 카드 서비스를 만든다.
func NewCardService(repo ports.CardRepository) *CardService {
	return &CardService{repo: repo}
}

// merge 는 카드 콘텐츠에 사용자 진행 상태를 결합한다.
func (s *CardService) merge(cards []domain.Card, prog map[string]domain.Progress) []domain.CardWithProgress {
	out := make([]domain.CardWithProgress, 0, len(cards))
	for _, c := range cards {
		cw := domain.CardWithProgress{Card: c, Status: domain.StatusNew}
		if p, ok := prog[c.ID]; ok {
			cw.Status = p.Status
			cw.DueAt = p.DueAt
		}
		out = append(out, cw)
	}
	return out
}

// All 은 전체 카드(개인 진행 상태 포함)를 반환한다.
func (s *CardService) All(ctx context.Context, userID string) ([]domain.CardWithProgress, error) {
	cards, err := s.repo.AllCards(ctx)
	if err != nil {
		return nil, err
	}
	prog, err := s.repo.ProgressFor(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.merge(cards, prog), nil
}

// Create 는 새 학습카드(콘텐츠)를 저장하고 저장된 카드를 반환한다.
// 프런트의 문제 등록 화면(author-card)이 보내는 draftToDTO 페이로드를 받아
// 서버 카드로 영속화한다. 진행 상태(Progress)는 만들지 않으므로 모든 사용자에게 NEW 로 보인다.
func (s *CardService) Create(ctx context.Context, card domain.Card) (*domain.Card, error) {
	if card.ID == "" {
		card.ID = newCardID()
	}
	// 누락 필드는 프런트 draftToSeedCard 와 동일한 기본값으로 보정한다.
	if card.StudySeconds <= 0 {
		card.StudySeconds = 40
	}
	if card.DifficultyCd == "" {
		card.DifficultyCd = domain.Medium
	}
	if card.CardTypeCd == "" {
		card.CardTypeCd = domain.Explanation
	}
	if err := s.repo.InsertCards(ctx, []domain.Card{card}); err != nil {
		return nil, err
	}
	return &card, nil
}

// newCardID 는 사용자 등록 카드의 고유 id 를 만든다(usr- 접두사로 시드 id 와 구분).
func newCardID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		// 엔트로피 실패 시에도 충돌 확률이 낮은 시각 기반 id 로 폴백.
		return "usr-" + strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return "usr-" + hex.EncodeToString(b[:])
}

// Mark 는 개인 진행 상태를 갱신하고 갱신된 카드를 반환한다.
func (s *CardService) Mark(ctx context.Context, userID, cardID string, status domain.CardStatus) (*domain.CardWithProgress, error) {
	cards, err := s.repo.AllCards(ctx)
	if err != nil {
		return nil, err
	}
	var found *domain.Card
	for i := range cards {
		if cards[i].ID == cardID {
			found = &cards[i]
			break
		}
	}
	if found == nil {
		return nil, ports.ErrNotFound{Entity: "card"}
	}

	p := domain.Progress{UserID: userID, CardID: cardID, Status: status, DueAt: nextDue(status)}
	if err := s.repo.UpsertProgress(ctx, p); err != nil {
		return nil, err
	}
	return &domain.CardWithProgress{Card: *found, Status: p.Status, DueAt: p.DueAt}, nil
}

// nextDue 는 상태 전환 시 다음 복습 예정일을 정한다(단순 간격반복).
func nextDue(status domain.CardStatus) *time.Time {
	now := time.Now()
	switch status {
	case domain.StatusLearning:
		t := now.Add(24 * time.Hour)
		return &t
	case domain.StatusMastered:
		t := now.Add(7 * 24 * time.Hour)
		return &t
	default:
		return nil
	}
}

// diffRank 는 난이도를 크기 비교가 가능한 순번으로 바꾼다(편성 규칙이 함께 쓴다).
func diffRank(d domain.Difficulty) int {
	switch d {
	case domain.Easy:
		return 0
	case domain.Medium:
		return 1
	case domain.Hard:
		return 2
	}
	return 1
}
