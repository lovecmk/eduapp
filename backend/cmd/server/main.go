// eduapp 백엔드 진입점 — Go Fiber + MongoDB.
//
// 아키텍처(포트-어댑터 / 클린 아키텍처):
//
//	handler(HTTP) → service(유스케이스) → ports(인터페이스) ← mongo(어댑터)
//	                                    └ domain(순수 모델)
//
// 서비스 계층은 인터페이스에만 의존하므로 DB/프레임워크 교체 시 이식이 쉽다.
package main

import (
	"context"
	"log"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/config"
	"github.com/lovecmk/eduapp/backend/internal/memory"
	mongoadapter "github.com/lovecmk/eduapp/backend/internal/mongo"
	"github.com/lovecmk/eduapp/backend/internal/ports"
	postgresadapter "github.com/lovecmk/eduapp/backend/internal/postgres"
	"github.com/lovecmk/eduapp/backend/internal/seed"
	"github.com/lovecmk/eduapp/backend/internal/server"
	"github.com/lovecmk/eduapp/backend/internal/service"
	"github.com/lovecmk/eduapp/backend/internal/token"
)

func main() {
	cfg := config.Load()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// 운영 저장소인데 JWT 시크릿이 기본(취약)값이면 경고 — 무설정 테스트는 허용하되
	// 영속 DB 를 켠 배포에서는 반드시 교체하도록 유도한다(외부 노출 시 계정 위조 위험).
	if cfg.Store != "memory" && string(cfg.JWTSecret) == "dev-insecure-secret-change-me" {
		log.Printf("[warn] JWT_SECRET 이 기본 취약값입니다 — 운영 배포 전 `make secret` 으로 교체하세요")
	}

	// 저장소 선택 — 포트-어댑터 구조 덕에 구현만 교체된다(서비스 코드는 동일).
	var (
		userRepo  ports.UserRepository
		cardRepo  ports.CardRepository
		pushRepo  ports.PushTokenRepository
		auditRepo ports.AuditRepository
	)
	switch cfg.Store {
	case "memory":
		userRepo = memory.NewUserRepo()
		cardRepo = memory.NewCardRepo()
		pushRepo = memory.NewPushTokenRepo()
		auditRepo = memory.NewAuditRepo()
		log.Printf("[store] 인메모리 모드(무 DB)")
	case "postgres":
		pool, err := postgresadapter.Connect(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("[postgres] 연결 실패: %v", err)
		}
		defer pool.Close()
		if err := postgresadapter.EnsureSchema(ctx, pool); err != nil {
			log.Fatalf("[postgres] 스키마 적용 실패: %v", err)
		}
		log.Printf("[postgres] 연결됨")
		userRepo = postgresadapter.NewUserRepo(pool)
		cardRepo = postgresadapter.NewCardRepo(pool)
		pushRepo = postgresadapter.NewPushTokenRepo(pool)
		auditRepo = postgresadapter.NewAuditRepo(pool)
	default: // "mongo"
		db, disconnect, err := mongoadapter.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
		if err != nil {
			log.Fatalf("[mongo] 연결 실패: %v", err)
		}
		defer func() { _ = disconnect(context.Background()) }()
		log.Printf("[mongo] 연결됨 db=%s", cfg.MongoDB)
		userRepo = mongoadapter.NewUserRepo(db)
		cardRepo = mongoadapter.NewCardRepo(db)
		pushRepo = mongoadapter.NewPushTokenRepo(db)
		auditRepo = mongoadapter.NewAuditRepo(db)
	}

	tm := token.NewManager(cfg.JWTSecret, cfg.AccessTTL, cfg.RefreshTTL)

	authSvc := service.NewAuthService(userRepo, tm)
	cardSvc := service.NewCardService(cardRepo, cfg.StudySessionSec)
	statsSvc := service.NewStatsService(cardSvc)
	commSvc := service.NewCommunityService(cardSvc)
	pushSvc := service.NewPushService(pushRepo, cfg.ExpoPushURL)
	// 관리 콘솔(Vue) — 요청 지표 수집기와 관리 유스케이스.
	metrics := service.NewMetrics()
	adminSvc := service.NewAdminService(userRepo, cardRepo, auditRepo, metrics, cfg.Store)

	tgSvc := service.NewTelegramService(service.TelegramConfig{
		BotToken:     cfg.TelegramBotToken,
		APIBase:      cfg.TelegramAPIBase,
		AllowedChats: cfg.TelegramAllowedChats,
	}, pushSvc)

	if cfg.SeedOnStart {
		if n, err := seed.EnsureCards(ctx, cardRepo); err != nil {
			log.Printf("[seed] 카드 시드 실패: %v", err)
		} else if n > 0 {
			log.Printf("[seed] 카드 %d장 주입", n)
		}
		if err := authSvc.EnsureDemoUser(ctx); err != nil {
			log.Printf("[seed] 데모 사용자 생성 실패: %v", err)
		}
	}

	// 관리자 보장은 시드 여부와 무관하게 항상 수행한다 —
	// SEED_ON_START=false 인 운영 환경에서도 콘솔에는 들어갈 수 있어야 한다.
	if err := authSvc.EnsureAdmin(ctx, cfg.AdminLoginID, cfg.AdminPassword); err != nil {
		log.Printf("[admin] 관리자 계정 보장 실패: %v", err)
	}

	app := server.New(server.Deps{
		Cfg:       cfg,
		Tokens:    tm,
		Auth:      authSvc,
		Cards:     cardSvc,
		Stats:     statsSvc,
		Community: commSvc,
		Push:      pushSvc,
		Telegram:  tgSvc,
		Admin:     adminSvc,
		Metrics:   metrics,
		Users:     userRepo,
	})

	// 텔레그램 long-polling — 봇 토큰이 설정돼 있고 폴링이 켜져 있으면 백그라운드로 수신 대기.
	// (별도의 장기 컨텍스트를 써서 부팅용 15초 타임아웃 ctx 와 분리한다.)
	if tgSvc.Enabled() && cfg.TelegramPoll {
		pollCtx, pollCancel := context.WithCancel(context.Background())
		defer pollCancel()
		go tgSvc.Poll(pollCtx)
	} else if !tgSvc.Enabled() {
		log.Printf("[telegram] 미설정 — 활성화하려면 TELEGRAM_BOT_TOKEN 을 주입하세요")
	}

	log.Printf("[http] 리스닝 :%s", cfg.Port)
	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Fatalf("[http] 서버 종료: %v", err)
	}
}
