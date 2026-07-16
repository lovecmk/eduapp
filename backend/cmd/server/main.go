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
	"github.com/lovecmk/eduapp/backend/internal/seed"
	"github.com/lovecmk/eduapp/backend/internal/server"
	"github.com/lovecmk/eduapp/backend/internal/service"
	"github.com/lovecmk/eduapp/backend/internal/token"
)

func main() {
	cfg := config.Load()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// 저장소 선택 — 포트-어댑터 구조 덕에 구현만 교체된다(서비스 코드는 동일).
	var (
		userRepo ports.UserRepository
		cardRepo ports.CardRepository
	)
	if cfg.Store == "memory" {
		userRepo = memory.NewUserRepo()
		cardRepo = memory.NewCardRepo()
		log.Printf("[store] 인메모리 모드(무 MongoDB)")
	} else {
		db, disconnect, err := mongoadapter.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
		if err != nil {
			log.Fatalf("[mongo] 연결 실패: %v", err)
		}
		defer func() { _ = disconnect(context.Background()) }()
		log.Printf("[mongo] 연결됨 db=%s", cfg.MongoDB)
		userRepo = mongoadapter.NewUserRepo(db)
		cardRepo = mongoadapter.NewCardRepo(db)
	}

	tm := token.NewManager(cfg.JWTSecret, cfg.AccessTTL, cfg.RefreshTTL)

	authSvc := service.NewAuthService(userRepo, tm)
	cardSvc := service.NewCardService(cardRepo, cfg.StudySessionSec)
	statsSvc := service.NewStatsService(cardSvc)
	commSvc := service.NewCommunityService(cardSvc)

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

	app := server.New(server.Deps{
		Cfg:       cfg,
		Tokens:    tm,
		Auth:      authSvc,
		Cards:     cardSvc,
		Stats:     statsSvc,
		Community: commSvc,
	})

	log.Printf("[http] 리스닝 :%s", cfg.Port)
	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Fatalf("[http] 서버 종료: %v", err)
	}
}
