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
	"github.com/lovecmk/eduapp/backend/internal/middleware"
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

	// 영속 저장소를 쓰는 배포에서 기본 JWT 시크릿이면 기동을 거부한다.
	//
	// 예전에는 경고만 찍고 그대로 떴는데, 로그의 경고는 아무도 읽지 않는다.
	// 이 기본값은 저장소에 공개돼 있으므로, 그대로 뜬 서버는 누구나 원하는 사용자의
	// 토큰을 위조할 수 있다 — 관리자 ID 로 서명하면 전체 사용자 데이터가 열린다.
	// 관리자 비밀번호를 코드에 박지 않는 것과 같은 이유이며, 시크릿 유출의 대가가 더 크다.
	// (STORE=memory 는 데이터가 남지 않는 로컬/테스트 실행이라 예외로 둔다.)
	if cfg.Store != "memory" && string(cfg.JWTSecret) == config.InsecureJWTSecret {
		log.Fatalf("[fatal] JWT_SECRET 이 기본 취약값입니다 — `make secret` 으로 교체 후 재기동하세요")
	}
	// CORS 를 전면 개방한 채로 뜬 것도 알린다(기본값이 아니라 명시적 선택이어야 한다).
	if cfg.Store != "memory" && cfg.CORSOrigins == "*" {
		log.Printf("[warn] CORS_ORIGINS 가 '*' 입니다 — 관리 콘솔 주소로 좁히는 것을 권장합니다")
	}

	// 저장소 선택 — 포트-어댑터 구조 덕에 구현만 교체된다(서비스 코드는 동일).
	var (
		userRepo  ports.UserRepository
		cardRepo  ports.CardRepository
		pushRepo  ports.PushTokenRepository
		auditRepo ports.AuditRepository
	)
	var dataRepo ports.UserDataRepository
	switch cfg.Store {
	case "memory":
		userRepo = memory.NewUserRepo()
		cardRepo = memory.NewCardRepo()
		pushRepo = memory.NewPushTokenRepo()
		auditRepo = memory.NewAuditRepo()
		dataRepo = memory.NewUserDataRepo()
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
		dataRepo = postgresadapter.NewUserDataRepo(pool)
	default: // "mongo"
		db, disconnect, err := mongoadapter.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
		if err != nil {
			log.Fatalf("[mongo] 연결 실패: %v", err)
		}
		defer func() { _ = disconnect(context.Background()) }()
		log.Printf("[mongo] 연결됨 db=%s", cfg.MongoDB)
		mongoUsers := mongoadapter.NewUserRepo(db)
		// 유일성 인덱스가 있어야 동시 가입이 실제로 막힌다(애플리케이션 검사만으로는 부족).
		if err := mongoUsers.EnsureIndexes(ctx); err != nil {
			log.Fatalf("[mongo] 유일성 인덱스 생성 실패: %v", err)
		}
		userRepo = mongoUsers
		cardRepo = mongoadapter.NewCardRepo(db)
		pushRepo = mongoadapter.NewPushTokenRepo(db)
		auditRepo = mongoadapter.NewAuditRepo(db)
		mongoData := mongoadapter.NewUserDataRepo(db)
		// "하루 1회 출석", "같은 신고는 한 건" 같은 규칙은 인덱스가 강제해야 한다.
		if err := mongoData.EnsureIndexes(ctx); err != nil {
			log.Fatalf("[mongo] 개인 데이터 인덱스 생성 실패: %v", err)
		}
		dataRepo = mongoData
	}

	tm := token.NewManager(cfg.JWTSecret, cfg.AccessTTL, cfg.RefreshTTL)

	authSvc := service.NewAuthService(userRepo, tm)
	cardSvc := service.NewCardService(cardRepo, cfg.StudySessionSec)
	statsSvc := service.NewStatsService(cardSvc)
	commSvc := service.NewCommunityService(cardSvc)
	pushSvc := service.NewPushService(pushRepo, cfg.ExpoPushURL)
	// 관리 콘솔(Vue) — 요청 지표 수집기와 관리 유스케이스.
	syncSvc := service.NewSyncService(dataRepo, cardRepo)
	metrics := service.NewMetrics()
	adminSvc := service.NewAdminService(userRepo, cardRepo, auditRepo, dataRepo, metrics, cfg.Store)

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
		Cfg:         cfg,
		Tokens:      tm,
		Auth:        authSvc,
		Cards:       cardSvc,
		Stats:       statsSvc,
		Community:   commSvc,
		Push:        pushSvc,
		Telegram:    tgSvc,
		Sync:        syncSvc,
		Idempotency: middleware.NewIdempotencyStore(),
		Admin:       adminSvc,
		Metrics:     metrics,
		Users:       userRepo,
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
