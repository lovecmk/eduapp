package handler

import (
	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/middleware"
	"github.com/lovecmk/eduapp/backend/internal/service"
)

// SettingsHandler 는 운영 설정(점검 모드·하루 상한·공지 배너) HTTP 어댑터.
type SettingsHandler struct{ svc *service.SettingsService }

// NewSettingsHandler 는 운영 설정 핸들러를 만든다.
func NewSettingsHandler(svc *service.SettingsService) *SettingsHandler {
	return &SettingsHandler{svc: svc}
}

// Get 은 GET /api/admin/settings — 현재 운영 설정.
func (h *SettingsHandler) Get(c *fiber.Ctx) error {
	return c.JSON(h.svc.Get(c.Context()).Normalized())
}

// settingsReq 는 설정 변경 요청.
//
// 모든 필드가 포인터인 것이 핵심이다. 값 타입이면 화면이 공지 문구 하나만
// 보내도 나머지가 false/0 으로 함께 전송되어, 문구를 고치는 순간 점검 모드가
// 꺼지고 하루 상한이 0 이 된다. 포인터면 "보내지 않음"이 그대로 전달된다.
type settingsReq struct {
	MaintenanceYn  *bool   `json:"maintenance_yn"`
	MaintenanceMsg *string `json:"maintenance_msg"`
	SignupEnabled  *bool   `json:"signup_enabled"`
	DailyNewLimit  *int    `json:"daily_new_limit"`
	NoticeTxt      *string `json:"notice_txt"`
	NoticeLevel    *string `json:"notice_level"`
}

// Update 는 PUT /api/admin/settings — 운영 설정 변경.
func (h *SettingsHandler) Update(c *fiber.Ctx) error {
	var req settingsReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "요청 형식이 올바르지 않습니다")
	}
	updated, err := h.svc.Update(c.Context(), actorOf(c), service.SettingsInput{
		MaintenanceYn:  req.MaintenanceYn,
		MaintenanceMsg: req.MaintenanceMsg,
		SignupEnabled:  req.SignupEnabled,
		DailyNewLimit:  req.DailyNewLimit,
		NoticeTxt:      req.NoticeTxt,
		NoticeLevel:    req.NoticeLevel,
	})
	if err != nil {
		return adminError(err)
	}
	return c.JSON(updated)
}

// PublicConfig 는 앱이 부팅 때 한 번 받아 가는 '지금 서비스가 어떤 상태인가'다.
//
// 비밀값은 절대 담지 않는다. 여기 있는 것은 모두 앱 화면에 그대로 보이는 값이고,
// 무인증으로 열려 있다 — 점검 중이라 로그인조차 못 하는 사람에게도
// "왜 안 되는지"는 전달돼야 하기 때문이다.
type PublicConfig struct {
	MaintenanceYn  bool   `json:"maintenance_yn"`
	MaintenanceMsg string `json:"maintenance_msg"`
	SignupEnabled  bool   `json:"signup_enabled"`
	DailyNewLimit  int    `json:"daily_new_limit"`
	NoticeTxt      string `json:"notice_txt"`
	NoticeLevel    string `json:"notice_level"`
	Version        string `json:"version"`
}

// PublicConfigHandler 는 무인증 서비스 상태 공개 어댑터.
type PublicConfigHandler struct {
	svc     *service.SettingsService
	version string
}

// NewPublicConfigHandler 는 공개 설정 핸들러를 만든다.
func NewPublicConfigHandler(svc *service.SettingsService, version string) *PublicConfigHandler {
	return &PublicConfigHandler{svc: svc, version: version}
}

// Get 은 GET /api/config — 앱이 읽는 공개 설정.
func (h *PublicConfigHandler) Get(c *fiber.Ctx) error {
	s := h.svc.Get(c.Context()).Normalized()
	return c.JSON(PublicConfig{
		MaintenanceYn:  s.MaintenanceYn,
		MaintenanceMsg: s.MaintenanceMsg,
		SignupEnabled:  s.SignupEnabled,
		DailyNewLimit:  s.DailyNewLimit,
		NoticeTxt:      s.NoticeTxt,
		NoticeLevel:    string(s.NoticeLevel),
		Version:        h.version,
	})
}

// LearningHandler 는 하루 학습 상한 HTTP 어댑터(앱 전용).
type LearningHandler struct{ svc *service.LearningService }

// NewLearningHandler 는 학습 상한 핸들러를 만든다.
func NewLearningHandler(svc *service.LearningService) *LearningHandler {
	return &LearningHandler{svc: svc}
}

// Quota 는 GET /api/learning/quota — 오늘 남은 신규 학습 수.
func (h *LearningHandler) Quota(c *fiber.Ctx) error {
	q, err := h.svc.Get(c.Context(), middleware.UserID(c))
	if err != nil {
		return err
	}
	return c.JSON(q)
}

type completeReq struct {
	Count int `json:"count"`
}

// Complete 는 POST /api/learning/complete — 새로 배운 카드 수 보고.
//
// 멱등 미들웨어를 함께 건다(라우팅 참고). 앱은 이 보고를 오프라인 큐로 보내므로
// 재전송이 일상인데, 그때마다 누계가 늘면 상한이 실제보다 빨리 찬다.
func (h *LearningHandler) Complete(c *fiber.Ctx) error {
	var req completeReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "요청 형식이 올바르지 않습니다")
	}
	q, err := h.svc.Record(c.Context(), middleware.UserID(c), req.Count)
	if err != nil {
		return err
	}
	return c.JSON(q)
}
