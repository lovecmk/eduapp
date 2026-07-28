package handler

import (
	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/service"
)

// InsightHandler 는 분석 API 의 HTTP 어댑터.
type InsightHandler struct{ svc *service.InsightService }

// NewInsightHandler 는 분석 핸들러를 만든다.
func NewInsightHandler(svc *service.InsightService) *InsightHandler {
	return &InsightHandler{svc: svc}
}

// Insight 는 GET /api/admin/insight — 분석 전체를 한 번에 준다.
//
// 쪼개지 않는 이유: 화면이 여러 지표를 나란히 놓고 비교하는데, 조각마다 따로
// 받으면 서로 다른 시점의 값이 한 화면에 섞인다("이탈은 방금, 활동은 1분 전").
// 비교를 위한 화면에서 시점이 다른 것은 그냥 틀린 값이다.
func (h *InsightHandler) Insight(c *fiber.Ctx) error {
	out, err := h.svc.Insight(c.Context())
	if err != nil {
		return adminError(err)
	}
	return c.JSON(out)
}

// Refresh 는 POST /api/admin/insight/refresh — 캐시를 버리고 다시 계산한다.
//
// 문제를 고친 직후 반영을 눈으로 확인하고 싶을 때 쓴다. 이것이 없으면
// 관리자는 캐시가 만료될 때까지 자기가 고친 것이 먹혔는지 알 수 없다.
func (h *InsightHandler) Refresh(c *fiber.Ctx) error {
	h.svc.Invalidate()
	out, err := h.svc.Insight(c.Context())
	if err != nil {
		return adminError(err)
	}
	return c.JSON(out)
}
