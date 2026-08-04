package handler

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/middleware"
	"github.com/lovecmk/eduapp/backend/internal/ports"
	"github.com/lovecmk/eduapp/backend/internal/service"
)

// SyncHandler 는 개인 학습 데이터 동기화 엔드포인트.
// 응답 형식은 앱의 저장소 구현(ProgressRepository 등)과 계약서에 맞춘다.
type SyncHandler struct{ svc *service.SyncService }

// NewSyncHandler 는 동기화 핸들러를 만든다.
func NewSyncHandler(svc *service.SyncService) *SyncHandler { return &SyncHandler{svc: svc} }

// syncError 는 서비스 오류를 적절한 HTTP 상태로 옮긴다.
func syncError(err error) error {
	var invalid service.ErrInvalidInput
	var notFound ports.ErrNotFound
	switch {
	case errors.As(err, &invalid):
		return fiber.NewError(fiber.StatusBadRequest, invalid.Reason)
	case errors.As(err, &notFound):
		return fiber.NewError(fiber.StatusNotFound, "대상을 찾을 수 없습니다")
	}
	return err
}

func userOf(c *fiber.Ctx) string {
	id := middleware.UserID(c)
	return id
}

// ─────────────────────────────────────────────────────────────────────────────
// 학습 진행
// ─────────────────────────────────────────────────────────────────────────────

// Pull 은 GET /api/progress — 앱 복원용 전체 스냅샷.
func (h *SyncHandler) Pull(c *fiber.Ctx) error {
	snap, err := h.svc.Pull(c.Context(), userOf(c))
	if err != nil {
		return syncError(err)
	}
	return c.JSON(snap)
}

type gradeReq struct {
	CardID         string  `json:"card_id"`
	Grade          string  `json:"grade"`
	Box            int     `json:"box"`
	Ease           float64 `json:"ease"`
	DueAt          string  `json:"due_at"`
	Reps           int     `json:"reps"`
	Lapses         int     `json:"lapses"`
	LastReviewedAt *string `json:"last_reviewed_at"`
}

// Grade 는 POST /api/progress/grade — 카드 채점 보고.
func (h *SyncHandler) Grade(c *fiber.Ctx) error {
	var req gradeReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "잘못된 요청입니다")
	}
	in := service.GradeInput{
		CardID: req.CardID, Grade: req.Grade,
		Box: req.Box, Ease: req.Ease, Reps: req.Reps, Lapses: req.Lapses,
		DueAt: parseTime(req.DueAt),
	}
	if req.LastReviewedAt != nil {
		if t := parseTime(*req.LastReviewedAt); !t.IsZero() {
			in.LastReviewedAt = &t
		}
	}
	if err := h.svc.Grade(c.Context(), userOf(c), in); err != nil {
		return syncError(err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

type attendanceReq struct {
	Day string `json:"day"`
}

// Attend 는 POST /api/progress/attendance — 출석 도장.
func (h *SyncHandler) Attend(c *fiber.Ctx) error {
	var req attendanceReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "잘못된 요청입니다")
	}
	if err := h.svc.Attend(c.Context(), userOf(c), req.Day); err != nil {
		return syncError(err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ─────────────────────────────────────────────────────────────────────────────
// 카드 반응
// ─────────────────────────────────────────────────────────────────────────────

// Engagement 는 GET /api/engagement — 내가 추천·저장한 카드.
func (h *SyncHandler) Engagement(c *fiber.Ctx) error {
	snap, err := h.svc.Engagement(c.Context(), userOf(c))
	if err != nil {
		return syncError(err)
	}
	return c.JSON(snap)
}

type likeReq struct {
	CardID string `json:"card_id"`
	Liked  bool   `json:"liked"`
}

// Like 는 POST /api/engagement/like.
func (h *SyncHandler) Like(c *fiber.Ctx) error {
	var req likeReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "잘못된 요청입니다")
	}
	if err := h.svc.SetEngagement(c.Context(), userOf(c), req.CardID, domain.Liked, req.Liked); err != nil {
		return syncError(err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

type bookmarkReq struct {
	CardID     string `json:"card_id"`
	Bookmarked bool   `json:"bookmarked"`
}

// Bookmark 는 POST /api/engagement/bookmark.
func (h *SyncHandler) Bookmark(c *fiber.Ctx) error {
	var req bookmarkReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "잘못된 요청입니다")
	}
	if err := h.svc.SetEngagement(c.Context(), userOf(c), req.CardID, domain.Bookmarked, req.Bookmarked); err != nil {
		return syncError(err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ─────────────────────────────────────────────────────────────────────────────
// 신고
// ─────────────────────────────────────────────────────────────────────────────

type reportReq struct {
	CardID string `json:"card_id"`
	Reason string `json:"reason"`
	Detail string `json:"detail"`
}

// Report 는 POST /api/reports — 문제 신고 접수.
func (h *SyncHandler) Report(c *fiber.Ctx) error {
	var req reportReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "잘못된 요청입니다")
	}
	if err := h.svc.Report(c.Context(), userOf(c), service.ReportInput{
		CardID: req.CardID, Reason: req.Reason, Detail: req.Detail,
	}); err != nil {
		return syncError(err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"ok": true})
}

// MyReports 는 GET /api/reports/mine.
func (h *SyncHandler) MyReports(c *fiber.Ctx) error {
	ids, err := h.svc.MyReports(c.Context(), userOf(c))
	if err != nil {
		return syncError(err)
	}
	return c.JSON(fiber.Map{"card_ids": ids})
}

// ─────────────────────────────────────────────────────────────────────────────
// 알림
// ─────────────────────────────────────────────────────────────────────────────

// Notifications 는 GET /api/notifications — 앱은 배열을 기대한다.
func (h *SyncHandler) Notifications(c *fiber.Ctx) error {
	list, err := h.svc.Notifications(c.Context(), userOf(c))
	if err != nil {
		return syncError(err)
	}
	// nil 을 그대로 내보내면 JSON 이 null 이 되어 앱의 배열 처리와 어긋난다.
	if list == nil {
		list = []domain.Notification{}
	}
	return c.JSON(list)
}

// ReadNotification 은 POST /api/notifications/:id/read.
func (h *SyncHandler) ReadNotification(c *fiber.Ctx) error {
	if err := h.svc.ReadNotification(c.Context(), userOf(c), param(c, "id")); err != nil {
		return syncError(err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ReadAllNotifications 는 POST /api/notifications/read-all.
func (h *SyncHandler) ReadAllNotifications(c *fiber.Ctx) error {
	if err := h.svc.ReadAllNotifications(c.Context(), userOf(c)); err != nil {
		return syncError(err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

// parseTime 은 ISO 시각을 읽는다. 읽을 수 없으면 제로값 —
// 호출부가 "값이 없다"로 처리하도록 두는 편이, 잘못된 시각을 저장하는 것보다 낫다.
func parseTime(raw string) time.Time {
	if raw == "" {
		return time.Time{}
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return time.Time{}
	}
	return t
}
