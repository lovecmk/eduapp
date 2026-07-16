package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/config"
	"github.com/lovecmk/eduapp/backend/internal/memory"
	"github.com/lovecmk/eduapp/backend/internal/seed"
	"github.com/lovecmk/eduapp/backend/internal/server"
	"github.com/lovecmk/eduapp/backend/internal/service"
	"github.com/lovecmk/eduapp/backend/internal/token"
)

// buildApp 는 인메모리 저장소로 실제 서버(Fiber)를 조립한다.
func buildApp(t *testing.T) *server.Deps {
	t.Helper()
	cfg := config.Config{
		JWTSecret: []byte("test-secret"), AccessTTL: 15 * time.Minute,
		RefreshTTL: time.Hour, CORSOrigins: "*", StudySessionSec: 180,
	}
	users := memory.NewUserRepo()
	cards := memory.NewCardRepo()

	tm := token.NewManager(cfg.JWTSecret, cfg.AccessTTL, cfg.RefreshTTL)
	authSvc := service.NewAuthService(users, tm)
	cardSvc := service.NewCardService(cards, cfg.StudySessionSec)

	if _, err := seed.EnsureCards(context.Background(), cards); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := authSvc.EnsureDemoUser(context.Background()); err != nil {
		t.Fatalf("demo user: %v", err)
	}

	return &server.Deps{
		Cfg: cfg, Tokens: tm, Auth: authSvc, Cards: cardSvc,
		Stats:     service.NewStatsService(cardSvc),
		Community: service.NewCommunityService(cardSvc),
	}
}

func doJSON(t *testing.T, app *fiber.App, method, path, tokenStr string, body any) (*http.Response, []byte) {
	t.Helper()
	var rdr io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, path, rdr)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if tokenStr != "" {
		req.Header.Set("Authorization", "Bearer "+tokenStr)
	}
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	data, _ := io.ReadAll(res.Body)
	return res, data
}

func TestEndToEnd(t *testing.T) {
	deps := buildApp(t)
	app := server.New(*deps)

	// 1) 헬스체크
	if res, _ := doJSON(t, app, "GET", "/health", "", nil); res.StatusCode != 200 {
		t.Fatalf("health status=%d", res.StatusCode)
	}

	// 2) 미인증 접근은 401
	if res, _ := doJSON(t, app, "GET", "/api/cards", "", nil); res.StatusCode != 401 {
		t.Fatalf("cards without auth status=%d, want 401", res.StatusCode)
	}

	// 3) 로그인
	res, data := doJSON(t, app, "POST", "/api/auth/login", "", map[string]string{"id": "demo", "password": "demo1234"})
	if res.StatusCode != 200 {
		t.Fatalf("login status=%d body=%s", res.StatusCode, data)
	}
	var auth struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		User         struct {
			UserNm    string `json:"user_nm"`
			EmailAddr string `json:"email_addr"`
		} `json:"user"`
	}
	if err := json.Unmarshal(data, &auth); err != nil {
		t.Fatalf("login decode: %v", err)
	}
	if auth.AccessToken == "" || auth.User.EmailAddr == "" {
		t.Fatalf("login missing fields: %s", data)
	}
	tok := auth.AccessToken

	// 4) 로그인 실패
	if res, _ := doJSON(t, app, "POST", "/api/auth/login", "", map[string]string{"id": "demo", "password": "wrong"}); res.StatusCode != 401 {
		t.Fatalf("bad login status=%d, want 401", res.StatusCode)
	}

	// 5) me
	if res, _ := doJSON(t, app, "GET", "/api/auth/me", tok, nil); res.StatusCode != 200 {
		t.Fatalf("me status=%d", res.StatusCode)
	}

	// 6) 전체 카드 = 61장
	res, data = doJSON(t, app, "GET", "/api/cards", tok, nil)
	var all []map[string]any
	if err := json.Unmarshal(data, &all); err != nil {
		t.Fatalf("cards decode: %v (%s)", err, data)
	}
	if len(all) != 61 {
		t.Fatalf("all cards=%d, want 61", len(all))
	}

	// 7) 오늘 세션 = 3분(180초) 분량. study_seconds 합이 목표 근처에서 멈춰야 한다.
	res, data = doJSON(t, app, "GET", "/api/cards/today", tok, nil)
	var today []map[string]any
	if err := json.Unmarshal(data, &today); err != nil {
		t.Fatalf("today decode: %v (%s)", err, data)
	}
	if len(today) == 0 {
		t.Fatal("today session empty")
	}
	sum := 0
	for _, c := range today {
		sum += int(c["study_seconds"].(float64))
	}
	// 마지막 한 장으로 목표를 넘길 수 있으므로 상한은 목표+한장(최대 40).
	if sum < 140 || sum > 220 {
		t.Fatalf("today session seconds=%d, want ~180 (140~220)", sum)
	}
	t.Logf("today session: %d cards, %d seconds", len(today), sum)

	// 8) 난이도 필터 — EASY 만.
	_, data = doJSON(t, app, "GET", "/api/cards/today?difficulty=EASY", tok, nil)
	var easy []map[string]any
	_ = json.Unmarshal(data, &easy)
	for _, c := range easy {
		if c["difficulty_cd"] != "EASY" {
			t.Fatalf("difficulty filter leaked: %v", c["difficulty_cd"])
		}
	}

	// 9) 카드 마킹 → mastered
	firstID := all[0]["id"].(string)
	res, data = doJSON(t, app, "PATCH", "/api/cards/"+firstID, tok, map[string]string{"status_cd": "MASTERED"})
	if res.StatusCode != 200 {
		t.Fatalf("mark status=%d body=%s", res.StatusCode, data)
	}
	var marked map[string]any
	_ = json.Unmarshal(data, &marked)
	if marked["status_cd"] != "MASTERED" {
		t.Fatalf("mark result=%v, want MASTERED", marked["status_cd"])
	}

	// 10) stats
	res, data = doJSON(t, app, "GET", "/api/stats", tok, nil)
	if res.StatusCode != 200 {
		t.Fatalf("stats status=%d", res.StatusCode)
	}
	var stats struct {
		TotalCards   int `json:"total_cards"`
		TotalLearned int `json:"total_learned"`
	}
	_ = json.Unmarshal(data, &stats)
	if stats.TotalCards != 61 || stats.TotalLearned < 1 {
		t.Fatalf("stats=%+v", stats)
	}

	// 11) community/live
	if res, _ := doJSON(t, app, "GET", "/api/community/live", tok, nil); res.StatusCode != 200 {
		t.Fatalf("community status=%d", res.StatusCode)
	}

	// 12) refresh
	res, data = doJSON(t, app, "POST", "/api/auth/refresh", "", map[string]string{"refresh_token": auth.RefreshToken})
	if res.StatusCode != 200 {
		t.Fatalf("refresh status=%d body=%s", res.StatusCode, data)
	}
}
