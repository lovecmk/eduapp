package handler

import (
	"bufio"
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/valyala/fasthttp"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/middleware"
	"github.com/lovecmk/eduapp/backend/internal/ports"
	"github.com/lovecmk/eduapp/backend/internal/service"
)

// AdminHandler 는 관리 콘솔용 HTTP 어댑터.
type AdminHandler struct{ svc *service.AdminService }

// NewAdminHandler 는 관리 핸들러를 만든다.
func NewAdminHandler(svc *service.AdminService) *AdminHandler { return &AdminHandler{svc: svc} }

// actorOf 는 RequireAdmin 이 컨텍스트에 넣어 둔 관리자 정보를 꺼낸다.
func actorOf(c *fiber.Ctx) service.Actor {
	id, _ := c.Locals(middleware.LocalAdminID).(string)
	name, _ := c.Locals(middleware.LocalAdminName).(string)
	return service.Actor{ID: id, Name: name}
}

// adminError 는 서비스 오류를 적절한 HTTP 상태로 옮긴다.
// 서비스가 정의한 의미(잠금 방지·검증 실패·없음)를 그대로 상태 코드로 표현해야
// 프런트가 "왜 안 됐는지"를 사용자에게 설명할 수 있다.
func adminError(err error) error {
	var invalid service.ErrInvalidInput
	var notFound ports.ErrNotFound
	switch {
	case errors.As(err, &invalid):
		return fiber.NewError(fiber.StatusBadRequest, invalid.Reason)
	case errors.Is(err, service.ErrLastAdmin), errors.Is(err, service.ErrSelfLockout):
		// 규칙상 막힌 요청 — 재시도해도 같은 결과이므로 409(충돌)로 알린다.
		return fiber.NewError(fiber.StatusConflict, err.Error())
	case errors.As(err, &notFound):
		return fiber.NewError(fiber.StatusNotFound, "대상을 찾을 수 없습니다")
	}
	return err // 그 외는 ErrorHandler 가 500 으로 처리하고 로그를 남긴다
}

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드 · 서비스 상태
// ─────────────────────────────────────────────────────────────────────────────

// Dashboard 는 GET /api/admin/dashboard — 첫 화면이 필요한 모든 집계.
func (h *AdminHandler) Dashboard(c *fiber.Ctx) error {
	d, err := h.svc.Dashboard(c.Context())
	if err != nil {
		return adminError(err)
	}
	return c.JSON(d)
}

// Status 는 GET /api/admin/status — 저장소 왕복까지 확인한 서비스 상태.
func (h *AdminHandler) Status(c *fiber.Ctx) error {
	return c.JSON(h.svc.ServiceStatus(c.Context()))
}

// Metrics 는 GET /api/admin/metrics — 실시간 지표 단발 조회(SSE 를 못 쓰는 환경용).
func (h *AdminHandler) Metrics(c *fiber.Ctx) error {
	return c.JSON(h.svc.MetricsSnapshot())
}

// streamInterval 은 SSE 로 지표를 밀어 주는 주기.
// 더 짧게 잡아도 사람이 인지하지 못하고 서버·브라우저만 바빠진다.
const streamInterval = 2 * time.Second

// streamHeartbeat 는 데이터 변화가 없어도 연결을 살려 두기 위한 주석 프레임 주기.
// 중간 프록시(Caddy/nginx)는 조용한 연결을 끊는다.
const streamHeartbeat = 20 * time.Second

// Stream 은 GET /api/admin/stream — 대시보드 실시간 갱신(Server-Sent Events).
//
// WebSocket 이 아니라 SSE 를 쓰는 이유:
//   - 대시보드는 서버 → 화면 단방향이다. 양방향 채널이 필요 없다.
//   - EventSource 는 브라우저가 끊김을 감지해 **자동 재연결**한다. 직접 만들 필요가 없다.
//   - 일반 HTTP 라 리버스 프록시·인증 헤더가 그대로 통한다(업그레이드 협상 없음).
func (h *AdminHandler) Stream(c *fiber.Ctx) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	// nginx/Caddy 가 스트림을 버퍼링해 화면이 멈춘 것처럼 보이는 것을 막는다.
	c.Set("X-Accel-Buffering", "no")

	// 이 시점의 컨텍스트는 응답을 쓰는 동안 살아 있어야 하므로 미리 스냅샷 함수만 붙잡는다.
	snapshot := h.svc.MetricsSnapshot

	c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
		ticker := time.NewTicker(streamInterval)
		defer ticker.Stop()
		heartbeat := time.NewTicker(streamHeartbeat)
		defer heartbeat.Stop()

		// 첫 프레임은 즉시 보낸다 — 화면이 2초간 빈 채로 있으면 고장으로 보인다.
		if !writeSSE(w, "metrics", snapshot()) {
			return
		}

		for {
			select {
			case <-ticker.C:
				if !writeSSE(w, "metrics", snapshot()) {
					return // 클라이언트가 끊었다 — 고루틴을 여기서 끝낸다
				}
			case <-heartbeat.C:
				if _, err := w.WriteString(": ping\n\n"); err != nil {
					return
				}
				if err := w.Flush(); err != nil {
					return
				}
			}
		}
	}))
	return nil
}

// writeSSE 는 이벤트 한 건을 흘려보낸다. 쓰기가 실패하면(연결 종료) false.
func writeSSE(w *bufio.Writer, event string, payload any) bool {
	body, err := json.Marshal(payload)
	if err != nil {
		return false
	}
	if _, err := w.WriteString("event: " + event + "\ndata: "); err != nil {
		return false
	}
	if _, err := w.Write(body); err != nil {
		return false
	}
	if _, err := w.WriteString("\n\n"); err != nil {
		return false
	}
	// Flush 실패 = 상대가 끊긴 것. 이걸 확인하지 않으면 죽은 연결에 계속 쓰며 고루틴이 샌다.
	return w.Flush() == nil
}

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 관리
// ─────────────────────────────────────────────────────────────────────────────

// ListUsers 는 GET /api/admin/users — 검색·필터·페이지네이션.
func (h *AdminHandler) ListUsers(c *fiber.Ctx) error {
	page, err := h.svc.ListUsers(c.Context(), ports.UserQuery{
		Search:     c.Query("search"),
		Role:       c.Query("role"),
		Status:     c.Query("status"),
		Membership: c.Query("membership"),
		Offset:     queryInt(c, "offset", 0),
		Limit:      queryInt(c, "limit", 50),
		// 정렬은 저장소가 한다 — 화면에서 페이지만 정렬하면 관리자가
		// '전체가 정렬된 것'으로 오해한다.
		Sort: ports.ParseSortField(c.Query("sort")),
		Desc: c.Query("dir") == "desc",
	})
	if err != nil {
		return adminError(err)
	}
	return c.JSON(page)
}

// GetUser 는 GET /api/admin/users/:id — 상세 + 학습 진행.
func (h *AdminHandler) GetUser(c *fiber.Ctx) error {
	d, err := h.svc.GetUser(c.Context(), c.Params("id"))
	if err != nil {
		return adminError(err)
	}
	return c.JSON(d)
}

type setRoleReq struct {
	Role string `json:"role_cd"`
}

// SetUserRole 은 PATCH /api/admin/users/:id/role.
func (h *AdminHandler) SetUserRole(c *fiber.Ctx) error {
	var req setRoleReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "요청 형식이 올바르지 않습니다")
	}
	u, err := h.svc.SetUserRole(c.Context(), actorOf(c), c.Params("id"), domain.Role(req.Role))
	if err != nil {
		return adminError(err)
	}
	return c.JSON(u)
}

type setStatusReq struct {
	Status string `json:"status_cd"`
}

// SetUserStatus 는 PATCH /api/admin/users/:id/status.
func (h *AdminHandler) SetUserStatus(c *fiber.Ctx) error {
	var req setStatusReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "요청 형식이 올바르지 않습니다")
	}
	u, err := h.svc.SetUserStatus(c.Context(), actorOf(c), c.Params("id"), req.Status)
	if err != nil {
		return adminError(err)
	}
	return c.JSON(u)
}

// ─────────────────────────────────────────────────────────────────────────────
// 문제(카드) 관리
// ─────────────────────────────────────────────────────────────────────────────

// ListCards 는 GET /api/admin/cards.
func (h *AdminHandler) ListCards(c *fiber.Ctx) error {
	page, err := h.svc.ListCards(c.Context(), service.CardQuery{
		Search:   c.Query("search"),
		Category: c.Query("category"),
		Type:     c.Query("type"),
		Offset:   queryInt(c, "offset", 0),
		Limit:    queryInt(c, "limit", 50),
		Sort:     c.Query("sort"),
		Desc:     c.Query("dir") == "desc",
	})
	if err != nil {
		return adminError(err)
	}
	return c.JSON(page)
}

// GetCard 는 GET /api/admin/cards/:id.
func (h *AdminHandler) GetCard(c *fiber.Ctx) error {
	card, err := h.svc.GetCard(c.Context(), c.Params("id"))
	if err != nil {
		return adminError(err)
	}
	return c.JSON(card)
}

// CreateCard 는 POST /api/admin/cards — 문제 만들기.
func (h *AdminHandler) CreateCard(c *fiber.Ctx) error {
	card, err := parseCardBody(c)
	if err != nil {
		return err
	}
	created, err := h.svc.CreateCard(c.Context(), actorOf(c), card)
	if err != nil {
		return adminError(err)
	}
	return c.Status(fiber.StatusCreated).JSON(created)
}

// UpdateCard 는 PUT /api/admin/cards/:id — 문제 고치기.
func (h *AdminHandler) UpdateCard(c *fiber.Ctx) error {
	card, err := parseCardBody(c)
	if err != nil {
		return err
	}
	updated, err := h.svc.UpdateCard(c.Context(), actorOf(c), c.Params("id"), card)
	if err != nil {
		return adminError(err)
	}
	return c.JSON(updated)
}

// DeleteCard 는 DELETE /api/admin/cards/:id.
func (h *AdminHandler) DeleteCard(c *fiber.Ctx) error {
	if err := h.svc.DeleteCard(c.Context(), actorOf(c), c.Params("id")); err != nil {
		return adminError(err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// parseCardBody 는 요청 본문을 도메인 Card 로 읽는다.
// domain.Card 의 json 태그가 곧 API 계약이므로 별도 DTO 를 두지 않는다
// (앱의 카드 시드 파일과도 같은 형식이라 그대로 복붙해 등록할 수 있다).
func parseCardBody(c *fiber.Ctx) (domain.Card, error) {
	var card domain.Card
	if err := c.BodyParser(&card); err != nil {
		return card, fiber.NewError(fiber.StatusBadRequest, "요청 형식이 올바르지 않습니다")
	}
	return card, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// 감사 로그
// ─────────────────────────────────────────────────────────────────────────────

// AuditLogs 는 GET /api/admin/audit — 최근 관리 행위 이력.
func (h *AdminHandler) AuditLogs(c *fiber.Ctx) error {
	logs, err := h.svc.AuditLogs(c.Context(), queryInt(c, "limit", 100))
	if err != nil {
		return adminError(err)
	}
	return c.JSON(fiber.Map{"items": logs})
}

// queryInt 는 쿼리 파라미터를 정수로 읽는다. 잘못된 값은 기본값으로 —
// 관리 화면의 목록이 오타 하나로 500 을 내서는 안 된다.
func queryInt(c *fiber.Ctx, key string, fallback int) int {
	raw := c.Query(key)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return fallback
	}
	return n
}
