// Package server 는 Fiber 앱 구성(미들웨어·라우팅·의존성 조립)을 담당한다.
package server

import (
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/lovecmk/eduapp/backend/internal/config"
	"github.com/lovecmk/eduapp/backend/internal/handler"
	"github.com/lovecmk/eduapp/backend/internal/middleware"
	"github.com/lovecmk/eduapp/backend/internal/ports"
	"github.com/lovecmk/eduapp/backend/internal/service"
	"github.com/lovecmk/eduapp/backend/internal/token"
)

// loginAttemptsPerMinute 은 무인증 인증 경로에 허용하는 IP 당 분당 요청 수.
// 사람이 로그인하다 오타를 내는 횟수보다 넉넉하고, 자동화 대입에는 턱없이 모자란 값.
const loginAttemptsPerMinute = 20

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

	// 개인 학습 데이터 동기화(SRS·출석·반응·신고·알림)와 재전송 방어.
	Sync        *service.SyncService
	Idempotency *middleware.IdempotencyStore
	// Data 는 라우팅에 쓰이지 않지만, 테스트가 저장 결과를 직접 확인할 수 있게 둔다.
	Data ports.UserDataRepository

	// 관리 콘솔(Vue) 전용. Admin/Metrics/Users 가 모두 있어야 /api/admin/* 이 열린다 —
	// 하나라도 비면 라우트를 아예 등록하지 않아, 배선 실수로 무방비 관리 API 가
	// 노출되는 일이 없게 한다.
	Admin   *service.AdminService
	Metrics *service.Metrics
	Users   ports.UserRepository

	// Insight 는 데이터 분석(난이도 보정·이탈·코호트). 없으면 /insight 만 빠지고
	// 나머지 관리 API 는 그대로 동작한다 — 분석은 부가 기능이지 전제가 아니다.
	Insight *service.InsightService
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
	//
	// 두 경로에 같은 핸들러를 단다.
	//  · `/health`      — 로드밸런서·Docker healthcheck 의 관례적 경로.
	//  · `/api/health`  — 앱(ApiClient.health)이 부르는 경로. 앱은 API 주소 하나만 알고
	//    모든 요청에 `/api` 접두사를 붙이므로, 이 경로가 없으면 개발자 화면의
	//    서버 점검이 배포가 멀쩡해도 404 로 실패한다.
	started := time.Now()
	health := func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":         "ok",
			"version":        d.Cfg.Version,
			"store":          d.Cfg.Store,
			"uptime_seconds": int64(time.Since(started).Seconds()),
		})
	}
	app.Get("/health", health)
	app.Get("/api/health", health)

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

	// 무인증 진입점에는 반드시 속도 제한을 건다.
	//
	// 이것이 없으면 비밀번호를 초당 수백 번 시도해도 서버가 순순히 답한다.
	// 실제로 200회 연속 오답을 넣어도 아무 제동이 걸리지 않았고, 그 직후
	// 정상 로그인도 그대로 됐다 — 계정 잠금도 지연도 없었다는 뜻이다.
	//
	// 아이디 존재 확인(username/nickname-available)도 같이 묶는다. 이 두 경로는
	// 무인증으로 "이 아이디가 있는가"를 알려 주므로, 열어 두면 공격자가 먼저
	// 유효한 아이디 목록을 만든 뒤 그 목록만 집중해서 두드릴 수 있다.
	auth.Use(limiter.New(limiter.Config{
		Max:        loginAttemptsPerMinute,
		Expiration: time.Minute,
		// 회원가입·아이디 확인처럼 정상 사용자도 연달아 부르는 경로가 섞여 있으므로
		// IP 단위로 넉넉히 잡되, 자동화 도구는 확실히 걸리는 수준으로 둔다.
		KeyGenerator: func(c *fiber.Ctx) string { return c.IP() },
		LimitReached: func(c *fiber.Ctx) error {
			return fiber.NewError(fiber.StatusTooManyRequests, "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요")
		},
	}))

	auth.Post("/login", authH.Login)
	auth.Post("/register", authH.Register)
	auth.Post("/refresh", authH.Refresh)
	auth.Post("/logout", authH.Logout)
	auth.Get("/username-available", authH.UsernameAvailable)
	auth.Get("/nickname-available", authH.NicknameAvailable)
	// 정지된 계정을 액세스 토큰 만료(ACCESS_TTL) 전에 끊기 위한 게이트.
	// 짧은 TTL 캐시를 두어 요청마다 저장소를 왕복하지는 않는다.
	accounts := middleware.NewAccountGate(d.Users)
	if accounts == nil {
		log.Printf("[auth] Users 미주입 — 계정 상태 검사는 로그인·갱신 시점에만 수행합니다")
	}

	auth.Get("/me", middleware.RequireAuth(d.Tokens), authH.Me)
	auth.Patch("/me", middleware.RequireAuth(d.Tokens), authH.UpdateMe)

	// 이하 모두 인증 필요. 상태 검사를 그룹에 걸어 두면 나중에 추가되는 라우트도
	// 자동으로 보호된다 — 라우트마다 감싸는 방식은 새 엔드포인트에서 빠뜨리기 쉽다.
	protected := api.Group("",
		middleware.RequireAuth(d.Tokens),
		middleware.RequireActiveAccount(accounts),
	)

	protected.Get("/cards", cardH.All)
	protected.Get("/cards/today", cardH.Today)
	// 학습 콘텐츠 등록은 관리자만.
	//
	// 이 라우트는 문제 등록이 앱 안의 도구이던 시절에 만들어졌고, 그때는 "이 화면을
	// 볼 수 있는 사람만 쓴다"가 사실상의 권한 규칙이었다. 그런데 화면은 권한이 아니다 —
	// 토큰만 있으면 화면을 거치지 않고 직접 부를 수 있고, 그렇게 등록된 카드는
	// 검증도 감사 기록도 없이 전 사용자의 학습 목록에 배포된다.
	protected.Post("/cards", middleware.RequireAdmin(d.Users), cardH.Create)
	protected.Patch("/cards/:id", cardH.Mark)
	protected.Get("/stats", statsH.Get)
	protected.Get("/community/live", commH.Live)

	// 원격 푸시 — 기기 토큰 등록 + 앱발(發) 알림 트리거(텔레그램과 동일 3버전).
	protected.Post("/push/register", pushH.Register)
	protected.Post("/telegram/alert", tgH.Alert)

	registerSyncRoutes(protected, d)

	registerAdminRoutes(api, d)

	return app
}

// registerSyncRoutes 는 개인 학습 데이터 동기화 API 를 붙인다.
//
// 이 경로들은 앱과 계약서에는 오래 전부터 있었는데 서버에는 없었다. 앱이 목업으로
// 도는 동안에는 드러나지 않다가, 실서버로 전환하는 순간 출석·학습등급·신고·알림이
// 전부 404 로 실패하게 되어 있었다(404 는 재시도 대상이 아니라 오프라인 큐에도
// 담기지 않고 그대로 사라진다).
//
// 쓰기에는 모두 멱등 미들웨어를 건다. 앱은 이미 Idempotency-Key 를 실어 보내고
// 있었지만 서버가 그 헤더를 읽지 않아, 오프라인 큐가 재전송하면 출석이 두 번
// 찍히거나 신고가 중복 접수될 수 있었다.
func registerSyncRoutes(r fiber.Router, d Deps) {
	if d.Sync == nil {
		log.Printf("[sync] 의존성 미주입 — 학습 동기화 API 를 등록하지 않습니다")
		return
	}
	h := handler.NewSyncHandler(d.Sync)
	writes := middleware.Idempotent(d.Idempotency)

	r.Get("/progress", h.Pull)
	r.Post("/progress/grade", writes, h.Grade)
	r.Post("/progress/attendance", writes, h.Attend)

	r.Get("/engagement", h.Engagement)
	r.Post("/engagement/like", writes, h.Like)
	r.Post("/engagement/bookmark", writes, h.Bookmark)

	r.Post("/reports", writes, h.Report)
	r.Get("/reports/mine", h.MyReports)

	r.Get("/notifications", h.Notifications)
	r.Post("/notifications/read-all", writes, h.ReadAllNotifications)
	// :id 라우트는 read-all 뒤에 둔다 — 먼저 두면 "read-all" 이 id 로 잡힌다.
	r.Post("/notifications/:id/read", writes, h.ReadNotification)
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
	ih := handler.NewInsightHandler(d.Insight)

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

	admin.Get("/reports", h.Reports)
	admin.Post("/notifications", h.Notify)

	admin.Get("/audit", h.AuditLogs)

	// 분석은 저장소가 집계 읽기를 지원할 때만 연다. 없는 기능을 열어 두고
	// 500 을 돌려주면 화면은 '고장'으로 보인다 — 아예 없는 편이 정직하다.
	if d.Insight.Available() {
		admin.Get("/insight", ih.Insight)
		admin.Post("/insight/refresh", ih.Refresh)
		admin.Get("/insight/learner/:id", ih.Learner)
	} else {
		log.Printf("[admin] 저장소가 분석 읽기를 지원하지 않아 /insight 를 등록하지 않습니다")
	}
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
