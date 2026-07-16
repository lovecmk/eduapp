package handler

import (
	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/service"
)

// TelegramHandler 는 텔레그램 웹훅 수신과 앱발(發) 알림 트리거 엔드포인트.
type TelegramHandler struct {
	svc          *service.TelegramService
	webhookToken string // 웹훅 위조 방지용 secret(비면 검증 생략)
}

// NewTelegramHandler 는 텔레그램 핸들러를 만든다.
func NewTelegramHandler(svc *service.TelegramService, webhookToken string) *TelegramHandler {
	return &TelegramHandler{svc: svc, webhookToken: webhookToken}
}

// tgWebhookUpdate 는 텔레그램이 웹훅으로 보내는 업데이트 페이로드(필요 필드만).
type tgWebhookUpdate struct {
	Message *struct {
		Chat struct {
			ID int64 `json:"id"`
		} `json:"chat"`
		Text string `json:"text"`
	} `json:"message"`
}

// Webhook POST /api/telegram/webhook — 텔레그램 업데이트를 수신·처리한다.
// (long-polling 대신 웹훅 배포를 쓰는 경우의 진입점. 무인증이되 secret 헤더로 위조 방지.)
func (h *TelegramHandler) Webhook(c *fiber.Ctx) error {
	if h.webhookToken != "" {
		if c.Get("X-Telegram-Bot-Api-Secret-Token") != h.webhookToken {
			return fiber.NewError(fiber.StatusUnauthorized, "invalid secret")
		}
	}
	var up tgWebhookUpdate
	if err := c.BodyParser(&up); err != nil {
		return c.JSON(fiber.Map{"ok": true}) // 파싱 실패도 200 으로 흘려보낸다(재전송 폭주 방지).
	}
	if up.Message != nil && up.Message.Text != "" {
		h.svc.Dispatch(c.Context(), up.Message.Chat.ID, up.Message.Text)
	}
	return c.JSON(fiber.Map{"ok": true})
}

// AlertReq 는 앱/서버가 직접 알림을 트리거할 때의 요청 바디.
type AlertReq struct {
	Version string `json:"version"` // "1" | "2" | "3" | "alert1" ...
}

// Alert POST /api/telegram/alert — 앱에서 3가지 알림 버전 중 하나를 전체 기기에 발송.
func (h *TelegramHandler) Alert(c *fiber.Ctx) error {
	var req AlertReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "잘못된 요청 형식입니다")
	}
	if req.Version == "" {
		return fiber.NewError(fiber.StatusBadRequest, "알림 버전(version)이 필요합니다")
	}
	n, tmpl, err := h.svc.BroadcastTemplate(c.Context(), req.Version)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(fiber.Map{"sent": n, "key": tmpl.Key, "label": tmpl.Label, "title": tmpl.Title})
}
