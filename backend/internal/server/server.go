// Package server 는 Fiber 앱 구성(미들웨어·라우팅·의존성 조립)을 담당한다.
package server

import (
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/lovecmk/eduapp/backend/internal/config"
	"github.com/lovecmk/eduapp/backend/internal/handler"
	"github.com/lovecmk/eduapp/backend/internal/middleware"
	"github.com/lovecmk/eduapp/backend/internal/ports"
	"github.com/lovecmk/eduapp/backend/internal/service"
	"github.com/lovecmk/eduapp/backend/internal/token"
)

// Deps 는 서버가 라우팅에 필요로 하는 조립된 의존성 묶음.
type Deps struct {
	Cfg       config.Config
	Tokens    *token.Manager
	Auth      *service.AuthService
	Cards     *service.CardService
	Stats     *service.StatsService
	Community *service.CommunityService
	Push      *service.PushService
	Telegram  *service.TelegramService

	// 관리 콘솔(Vue) 전용. Admin/Metrics/Users 가 모두 있어야 /api/admin/* 이 열린다 —
	// 하나라도 비면 라우트를 아예 등록하지 않아, 배선 실수로 무방비 관리 API 가
	// 노출되는 일이 없게 한다.
	Admin   *service.AdminService
	Metrics *service.Metrics
	Users   ports.UserRepository
}

// New 는 라우트가 모두 등록된 Fiber 앱을 만든다.
func New(d Deps) *fiber.App {
	app := fiber.New(fiber.Config{
		ErrorHandler: errorHandler,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: d.Cfg.CORSOrigins,
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		// 관리 콘솔이 문제 수정에 PUT 을, 삭제에 DELETE 를 쓴다.
		AllowMethods: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
	}))

	// 요청 지표 수집 — 관리 대시보드의 실시간 트래픽·에러율·지연이 여기서 나온다.
	// recover/logger 다음, 라우팅 앞에 두어 모든 요청을 빠짐없이 센다.
	if d.Metrics != nil {
		app.Use(middleware.Metrics(d.Metrics))
	}

	// 헬스체크(무인증) — 로드밸런서/이식 검증용.
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	authH := handler.NewAuthHandler(d.Auth)
	cardH := handler.NewCardHandler(d.Cards)
	statsH := handler.NewStatsHandler(d.Stats)
	commH := handler.NewCommunityHandler(d.Community)
	pushH := handler.NewPushHandler(d.Push)
	tgH := handler.NewTelegramHandler(d.Telegram, d.Cfg.TelegramBotToken)

	// 텔레그램 웹훅(무인증 진입점 — secret 헤더로 위조 방지). long-polling 과 택일 사용.
	app.Post("/api/telegram/webhook", tgH.Webhook)

	api := app.Group("/api")

	// 인증 (무인증 진입점 + 인증 필요 me)
	auth := api.Group("/auth")
	auth.Post("/login", authH.Login)
	auth.Post("/register", authH.Register)
	auth.Post("/refresh", authH.Refresh)
	auth.Post("/logout", authH.Logout)
	auth.Get("/username-available", authH.UsernameAvailable)
	auth.Get("/nickname-available", authH.NicknameAvailable)
	auth.Get("/me", middleware.RequireAuth(d.Tokens), authH.Me)
	auth.Patch("/me", middleware.RequireAuth(d.Tokens), authH.UpdateMe)

	// 이하 모두 인증 필요.
	protected := api.Group("", middleware.RequireAuth(d.Tokens))

	protected.Get("/cards", cardH.All)
	protected.Get("/cards/today", cardH.Today)
	protected.Post("/cards", cardH.Create)
	protected.Patch("/cards/:id", cardH.Mark)
	protected.Get("/stats", statsH.Get)
	protected.Get("/community/live", commH.Live)

	// 원격 푸시 — 기기 토큰 등록 + 앱발(發) 알림 트리거(텔레그램과 동일 3버전).
	protected.Post("/push/register", pushH.Register)
	protected.Post("/telegram/alert", tgH.Alert)

	registerAdminRoutes(api, d)

	return app
}

// registerAdminRoutes 는 관리 콘솔(Vue) 전용 API 를 붙인다.
//
// 이중 게이트: RequireAuth(로그인했는가) → RequireAdmin(관리자인가).
// 두 미들웨어를 그룹에 걸어 두면 이후 추가되는 라우트도 자동으로 보호된다 —
// 라우트를 하나씩 감싸는 방식은 새 엔드포인트를 추가할 때 빠뜨리기 쉽다.
func registerAdminRoutes(api fiber.Router, d Deps) {
	if d.Admin == nil || d.Users == nil {
		log.Printf("[admin] 의존성 미주입 — 관리 API 를 등록하지 않습니다")
		return
	}
	h := handler.NewAdminHandler(d.Admin)

	admin := api.Group("/admin",
		middleware.RequireAuth(d.Tokens),
		middleware.RequireAdmin(d.Users),
	)

	admin.Get("/dashboard", h.Dashboard)
	admin.Get("/status", h.Status)
	admin.Get("/metrics", h.Metrics)
	admin.Get("/stream", h.Stream)

	admin.Get("/users", h.ListUsers)
	admin.Get("/users/:id", h.GetUser)
	admin.Patch("/users/:id/role", h.SetUserRole)
	admin.Patch("/users/:id/status", h.SetUserStatus)

	admin.Get("/cards", h.ListCards)
	admin.Post("/cards", h.CreateCard)
	admin.Get("/cards/:id", h.GetCard)
	admin.Put("/cards/:id", h.UpdateCard)
	admin.Delete("/cards/:id", h.DeleteCard)

	admin.Get("/audit", h.AuditLogs)
}

// errorHandler 는 fiber.Error 를 { "message": ... } 형태로 정규화한다.
// (프런트 ApiClient 가 body.message 를 읽어 에러 메시지를 표시함)
func errorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	msg := "서버 오류가 발생했습니다"
	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
		msg = e.Message
	}
	// 5xx(서버 내부 오류)는 원인을 로그로 남겨 디버깅할 수 있게 한다.
	// 4xx(클라이언트 오류)는 정상 흐름이므로 로깅하지 않는다(로그 노이즈 방지).
	if code >= fiber.StatusInternalServerError {
		log.Printf("[http] %s %s -> %d: %v", c.Method(), c.Path(), code, err)
	}
	return c.Status(code).JSON(fiber.Map{"message": msg})
}
