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
		AllowMethods: "GET, POST, PATCH, DELETE, OPTIONS",
	}))

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

	return app
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
