package handler

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
	"github.com/lovecmk/eduapp/backend/internal/service"
)

// CardHandler 는 카드 관련 HTTP 엔드포인트.
type CardHandler struct{ svc *service.CardService }

// NewCardHandler 는 카드 핸들러를 만든다.
func NewCardHandler(svc *service.CardService) *CardHandler { return &CardHandler{svc: svc} }

// All GET /api/cards
func (h *CardHandler) All(c *fiber.Ctx) error {
	userID := c.Locals("userID").(string)
	cards, err := h.svc.All(c.Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(toCardDTOList(cards))
}

// Today GET /api/cards/today
// 쿼리: ?difficulty=EASY|MEDIUM|HARD (선택), ?minutes=3 (선택)
// 개인에게 "3분 학습 분량"을 난이도 규칙에 따라 구성해 돌려준다.
func (h *CardHandler) Today(c *fiber.Ctx) error {
	userID := c.Locals("userID").(string)

	opt := service.SessionOptions{}
	if d := strings.ToUpper(strings.TrimSpace(c.Query("difficulty"))); d != "" {
		switch domain.Difficulty(d) {
		case domain.Easy, domain.Medium, domain.Hard:
			opt.Difficulty = domain.Difficulty(d)
		}
	}
	if m := strings.TrimSpace(c.Query("minutes")); m != "" {
		if n, err := strconv.Atoi(m); err == nil && n > 0 {
			opt.TargetSec = n * 60
		}
	}

	cards, err := h.svc.TodaySession(c.Context(), userID, opt)
	if err != nil {
		return err
	}
	return c.JSON(toCardDTOList(cards))
}

type markReq struct {
	StatusCd string `json:"status_cd"`
}

// Mark PATCH /api/cards/:id
func (h *CardHandler) Mark(c *fiber.Ctx) error {
	userID := c.Locals("userID").(string)
	id := c.Params("id")

	var req markReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "잘못된 요청입니다")
	}
	status := domain.CardStatus(strings.ToUpper(strings.TrimSpace(req.StatusCd)))
	switch status {
	case domain.StatusNew, domain.StatusLearning, domain.StatusMastered:
	default:
		return fiber.NewError(fiber.StatusBadRequest, "알 수 없는 status_cd 입니다")
	}

	card, err := h.svc.Mark(c.Context(), userID, id, status)
	if err != nil {
		var nf ports.ErrNotFound
		if errors.As(err, &nf) {
			return fiber.NewError(fiber.StatusNotFound, "카드를 찾을 수 없습니다")
		}
		return err
	}
	return c.JSON(toCardDTO(*card))
}
