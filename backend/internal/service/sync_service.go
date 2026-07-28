package service

import (
	"context"
	"strings"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// SyncService 는 "기기가 바뀌어도 남아야 하는" 개인 데이터의 유스케이스를 담는다.
//
// 이 엔드포인트들은 앱과 계약서에는 오래 전부터 있었지만 서버에는 없었다.
// 앱이 목업으로 도는 동안에는 드러나지 않다가, 실서버로 전환하는 순간
// 출석·학습등급·신고·알림 읽음이 전부 404 로 실패하게 되어 있었다.
// (게다가 404 는 재시도 대상이 아니라 오프라인 큐에도 담기지 않고 그대로 사라진다.)
type SyncService struct {
	data  ports.UserDataRepository
	cards ports.CardRepository
	now   func() time.Time
}

// NewSyncService 는 동기화 서비스를 만든다.
func NewSyncService(data ports.UserDataRepository, cards ports.CardRepository) *SyncService {
	return &SyncService{data: data, cards: cards, now: time.Now}
}

// 입력 상한 — 사용자가 보내는 문자열은 반드시 길이를 제한한다.
// 제한이 없으면 한 요청으로 저장소를 가득 채울 수 있다.
const (
	maxReasonLen = 40
	maxDetailLen = 1000
	maxDayKeyLen = 12 // "2026-12-31"
	maxIDLen     = 64
)

// Pull 은 앱 복원에 필요한 학습 스냅샷을 준다.
func (s *SyncService) Pull(ctx context.Context, userID string) (domain.SyncSnapshot, error) {
	return s.data.LoadSync(ctx, userID)
}

// GradeInput 은 카드 한 장의 채점 보고.
type GradeInput struct {
	CardID         string
	Grade          string
	Box            int
	Ease           float64
	DueAt          time.Time
	Reps           int
	Lapses         int
	LastReviewedAt *time.Time
}

// Grade 는 채점 결과를 기록한다.
//
// 존재하지 않는 카드는 거부한다 — 받아 두면 어떤 카드였는지 알 수 없는 진행 기록이
// 남아 통계가 영원히 어긋난다(카드를 지울 때 진행 기록을 함께 지우는 것과 같은 이유).
func (s *SyncService) Grade(ctx context.Context, userID string, in GradeInput) error {
	cardID := strings.TrimSpace(in.CardID)
	if cardID == "" || len(cardID) > maxIDLen {
		return ErrInvalidInput{Reason: "card_id 가 올바르지 않습니다"}
	}
	if _, err := s.cards.FindCard(ctx, cardID); err != nil {
		return err
	}
	state := domain.SrsState{
		UserID:         userID,
		CardID:         cardID,
		Box:            clampInt(in.Box, 0, 12),
		Ease:           clampFloat(in.Ease, 1.3, 5.0),
		DueAt:          in.DueAt,
		Reps:           clampInt(in.Reps, 0, 100_000),
		Lapses:         clampInt(in.Lapses, 0, 100_000),
		LastGrade:      strings.ToUpper(strings.TrimSpace(in.Grade)),
		LastReviewedAt: in.LastReviewedAt,
	}
	if state.DueAt.IsZero() {
		state.DueAt = s.now()
	}
	return s.data.SaveSrs(ctx, state, DayKey(s.now()))
}

// Attend 는 출석 도장을 찍는다.
func (s *SyncService) Attend(ctx context.Context, userID, day string) error {
	day = strings.TrimSpace(day)
	if day == "" {
		day = DayKey(s.now())
	}
	if len(day) > maxDayKeyLen {
		return ErrInvalidInput{Reason: "날짜 키가 올바르지 않습니다"}
	}
	return s.data.MarkAttendance(ctx, userID, day, s.now())
}

// Engagement 는 내 반응 목록을 준다.
func (s *SyncService) Engagement(ctx context.Context, userID string) (domain.EngagementSnapshot, error) {
	return s.data.Engagement(ctx, userID)
}

// SetEngagement 는 추천·저장 상태를 설정한다.
func (s *SyncService) SetEngagement(ctx context.Context, userID, cardID string, kind domain.EngagementKind, on bool) error {
	cardID = strings.TrimSpace(cardID)
	if cardID == "" || len(cardID) > maxIDLen {
		return ErrInvalidInput{Reason: "card_id 가 올바르지 않습니다"}
	}
	if _, err := s.cards.FindCard(ctx, cardID); err != nil {
		return err
	}
	return s.data.SetEngagement(ctx, userID, cardID, kind, on)
}

// ReportInput 은 문제 신고.
type ReportInput struct {
	CardID string
	Reason string
	Detail string
}

// Report 는 신고를 접수한다.
func (s *SyncService) Report(ctx context.Context, userID string, in ReportInput) error {
	cardID := strings.TrimSpace(in.CardID)
	reason := strings.TrimSpace(in.Reason)
	if cardID == "" || len(cardID) > maxIDLen {
		return ErrInvalidInput{Reason: "card_id 가 올바르지 않습니다"}
	}
	if reason == "" || len(reason) > maxReasonLen {
		return ErrInvalidInput{Reason: "신고 사유가 올바르지 않습니다"}
	}
	if _, err := s.cards.FindCard(ctx, cardID); err != nil {
		return err
	}
	return s.data.AddReport(ctx, domain.Report{
		ID:        newID("rp_"),
		UserID:    userID,
		CardID:    cardID,
		Reason:    reason,
		Detail:    truncate(strings.TrimSpace(in.Detail), maxDetailLen),
		CreatedAt: s.now(),
	})
}

// MyReports 는 내가 신고한 카드 id 목록.
func (s *SyncService) MyReports(ctx context.Context, userID string) ([]string, error) {
	return s.data.ReportedCardIDs(ctx, userID)
}

// Notifications 는 내 알림 목록.
func (s *SyncService) Notifications(ctx context.Context, userID string) ([]domain.Notification, error) {
	return s.data.Notifications(ctx, userID)
}

// ReadNotification 은 알림 하나를 읽음 처리한다.
func (s *SyncService) ReadNotification(ctx context.Context, userID, id string) error {
	id = strings.TrimSpace(id)
	if id == "" || len(id) > maxIDLen {
		return ErrInvalidInput{Reason: "알림 id 가 올바르지 않습니다"}
	}
	return s.data.MarkNotificationRead(ctx, userID, id)
}

// ReadAllNotifications 는 전체를 읽음 처리한다.
func (s *SyncService) ReadAllNotifications(ctx context.Context, userID string) error {
	return s.data.MarkAllNotificationsRead(ctx, userID)
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func clampFloat(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	// 룬 경계에서 자른다 — 바이트로 자르면 한글이 깨진다.
	r := []rune(s)
	for len(string(r)) > max {
		r = r[:len(r)-1]
	}
	return string(r)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
