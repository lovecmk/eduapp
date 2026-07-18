// Package service 는 비즈니스 로직(유스케이스)을 담는다.
// 저장소 인터페이스(ports)에만 의존하며 HTTP/DB 세부는 모른다.
package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sort"
	"strconv"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// CardService 는 카드 조회·개인 세션 구성·진행 상태 갱신을 담당한다.
type CardService struct {
	repo       ports.CardRepository
	sessionSec int // 개인별 1회 학습 세션 목표 시간(초) — 기본 180(3분)
}

// NewCardService 는 카드 서비스를 만든다.
func NewCardService(repo ports.CardRepository, sessionSec int) *CardService {
	if sessionSec <= 0 {
		sessionSec = 180
	}
	return &CardService{repo: repo, sessionSec: sessionSec}
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

// SessionOptions 는 오늘의 3분 세션 구성 옵션.
type SessionOptions struct {
	// Difficulty 가 지정되면 해당 난이도 카드만으로 세션을 채운다(빈 문자열이면 전체).
	Difficulty domain.Difficulty
	// TargetSec 이 0 이면 서비스 기본값(3분)을 사용한다.
	TargetSec int
}

// TodaySession 은 "3분 학습 분량"을 개인에게 맞춰 구성한다.
//
// 규칙:
//   - mastered 카드는 제외한다(이미 익힌 카드).
//   - 복습 예정(due) 카드를 오래된 순으로 우선 배치한다.
//   - 이후 신규(new) 카드를 난이도 오름차순(초→중→고)으로 채운다.
//   - 카드별 study_seconds 합이 목표 시간(기본 180초)에 도달하면 멈춘다.
//     (최소 1장은 보장한다.)
func (s *CardService) TodaySession(ctx context.Context, userID string, opt SessionOptions) ([]domain.CardWithProgress, error) {
	all, err := s.All(ctx, userID)
	if err != nil {
		return nil, err
	}

	target := opt.TargetSec
	if target <= 0 {
		target = s.sessionSec
	}

	now := time.Now()
	var due, fresh []domain.CardWithProgress
	for _, c := range all {
		if c.Status == domain.StatusMastered {
			continue
		}
		if opt.Difficulty != "" && c.DifficultyCd != opt.Difficulty {
			continue
		}
		if c.Status == domain.StatusLearning && c.DueAt != nil && !c.DueAt.After(now) {
			due = append(due, c)
		} else if c.Status == domain.StatusNew {
			fresh = append(fresh, c)
		} else if c.Status == domain.StatusLearning {
			// 아직 예정일이 남은 학습중 카드도 신규 뒤 후보로.
			fresh = append(fresh, c)
		}
	}

	// 복습: 예정일이 오래된 순(가장 오래 방치).
	sort.SliceStable(due, func(i, j int) bool {
		return dueTime(due[i]).Before(dueTime(due[j]))
	})
	// 신규: 쉬운 난이도부터.
	sort.SliceStable(fresh, func(i, j int) bool {
		return diffRank(fresh[i].DifficultyCd) < diffRank(fresh[j].DifficultyCd)
	})

	ordered := append(due, fresh...)

	// 목표 시간까지 채운다(최소 1장 보장).
	var session []domain.CardWithProgress
	acc := 0
	for _, c := range ordered {
		if len(session) > 0 && acc >= target {
			break
		}
		session = append(session, c)
		acc += cardSeconds(c)
	}
	return session, nil
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

func dueTime(c domain.CardWithProgress) time.Time {
	if c.DueAt != nil {
		return *c.DueAt
	}
	return time.Time{}
}

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

func cardSeconds(c domain.CardWithProgress) int {
	if c.StudySeconds > 0 {
		return c.StudySeconds
	}
	return 40
}
