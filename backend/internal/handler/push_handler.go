package handler

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/service"
)

// PushHandler 는 원격 푸시 토큰 등록 엔드포인트.
type PushHandler struct{ svc *service.PushService }

// NewPushHandler 는 푸시 핸들러를 만든다.
func NewPushHandler(svc *service.PushService) *PushHandler { return &PushHandler{svc: svc} }

// RegisterPushReq 는 기기 푸시 토큰 등록 요청 바디.
type RegisterPushReq struct {
	Token    string `json:"token"`
	Platform string `json:"platform"`
}

// Register POST /api/push/register — 로그인한 사용자의 기기 토큰을 저장한다.
func (h *PushHandler) Register(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(string)
	var req RegisterPushReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "잘못된 요청 형식입니다")
	}
	if strings.TrimSpace(req.Token) == "" {
		return fiber.NewError(fiber.StatusBadRequest, "푸시 토큰이 필요합니다")
	}
	if err := h.svc.Register(c.Context(), req.Token, req.Platform, userID); err != nil {
		return err
	}
	n, _ := h.svc.TokenCount(c.Context())
	return c.JSON(fiber.Map{"registered": true, "devices": n})
}
