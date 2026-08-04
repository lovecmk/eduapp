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
	"github.com/lovecmk/eduapp/backend/internal/middleware"
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
		RefreshTTL: time.Hour, CORSOrigins: "*",
	}
	users := memory.NewUserRepo()
	cards := memory.NewCardRepo()

	tm := token.NewManager(cfg.JWTSecret, cfg.AccessTTL, cfg.RefreshTTL)
	authSvc := service.NewAuthService(users, tm)
	cardSvc := service.NewCardService(cards)

	if _, err := seed.EnsureCards(context.Background(), cards); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := authSvc.EnsureDemoUser(context.Background()); err != nil {
		t.Fatalf("demo user: %v", err)
	}

	pushSvc := service.NewPushService(memory.NewPushTokenRepo(), "")
	data := memory.NewUserDataRepo()
	// 오늘의 편성은 운영에서 늘 배선되고, /api/cards/today 도 그 편성을 돌려준다.
	// 여기서 빼면 테스트만 다른 서버를 검사하게 된다.
	settings := service.NewSettingsService(memory.NewSettingsRepo(), memory.NewAuditRepo())
	return &server.Deps{
		Settings: settings,
		Learning: service.NewLearningService(data, cards, settings),
		// Data 는 테스트가 저장 결과를 직접 확인할 수 있도록 노출한다.
		Data:        data,
		Sync:        service.NewSyncService(data, cards),
		Idempotency: middleware.NewIdempotencyStore(),
		// Users 는 테스트가 계정 상태를 직접 조작할 수 있도록 노출한다.
		// (Admin 이 nil 이므로 관리 라우트는 여전히 등록되지 않는다.)
		Users: users,
		Cfg:   cfg, Tokens: tm, Auth: authSvc, Cards: cardSvc,
		Stats:     service.NewStatsService(cardSvc),
		Community: service.NewCommunityService(cardSvc),
		Push:      pushSvc,
		Telegram:  service.NewTelegramService(service.TelegramConfig{}, pushSvc),
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

	// 9-b) 카드 등록 → 새 카드가 전체 목록에 추가되고 NEW 로 보인다(문제 등록 도구 연결).
	// 먼저 일반 사용자로는 막히는지 확인한다(승격 뒤에는 같은 계정이 관리자가 되므로 지금 해야 한다).
	if res, _ := doJSON(t, app, "POST", "/api/cards", tok, map[string]any{"question_txt": "x", "category_cd": "공통"}); res.StatusCode != 403 {
		t.Fatalf("비관리자 카드 등록 status=%d, want 403", res.StatusCode)
	}
	// 콘텐츠 등록은 관리자 전용이므로 데모 계정을 관리자로 올리고 토큰을 새로 받는다.
	adminTok := promoteToAdmin(t, deps, app, "demo", "demo1234")
	res, data = doJSON(t, app, "POST", "/api/cards", adminTok, map[string]any{
		"category_cd":     "전기 위험",
		"sub_category_nm": "감전",
		"topic_nm":        "누전",
		"title_txt":       "테스트 카드",
		"question_txt":    "누전차단기의 주 목적은?",
		"card_type_cd":    "EXPLANATION",
		"principle_txt":   "감전 보호가 주 목적이다.",
	})
	if res.StatusCode != 201 {
		t.Fatalf("create card status=%d body=%s", res.StatusCode, data)
	}
	var created map[string]any
	if err := json.Unmarshal(data, &created); err != nil {
		t.Fatalf("create decode: %v (%s)", err, data)
	}
	if created["status_cd"] != "NEW" || created["question_txt"] != "누전차단기의 주 목적은?" {
		t.Fatalf("create result=%+v", created)
	}
	// 미인증 등록은 401.
	if res, _ := doJSON(t, app, "POST", "/api/cards", "", map[string]any{"question_txt": "x", "category_cd": "공통"}); res.StatusCode != 401 {
		t.Fatalf("create without auth status=%d, want 401", res.StatusCode)
	}
	// 필수 항목 누락은 400.
	if res, _ := doJSON(t, app, "POST", "/api/cards", tok, map[string]any{"title_txt": "제목만"}); res.StatusCode != 400 {
		t.Fatalf("create missing required status=%d, want 400", res.StatusCode)
	}
	// 등록 후 전체 카드가 62장.
	_, data = doJSON(t, app, "GET", "/api/cards", tok, nil)
	var all2 []map[string]any
	_ = json.Unmarshal(data, &all2)
	if len(all2) != 62 {
		t.Fatalf("after create all cards=%d, want 62", len(all2))
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
	// 앞서 카드 1장을 등록했으므로 전체 62장.
	if stats.TotalCards != 62 || stats.TotalLearned < 1 {
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

	// 13) 푸시 토큰 등록 — 인증 필요.
	if res, _ := doJSON(t, app, "POST", "/api/push/register", "", map[string]string{"token": "ExponentPushToken[x]"}); res.StatusCode != 401 {
		t.Fatalf("push register without auth status=%d, want 401", res.StatusCode)
	}
	res, data = doJSON(t, app, "POST", "/api/push/register", tok, map[string]string{"token": "ExponentPushToken[abc]", "platform": "android"})
	if res.StatusCode != 200 {
		t.Fatalf("push register status=%d body=%s", res.StatusCode, data)
	}
	var reg struct {
		Registered bool `json:"registered"`
		Devices    int  `json:"devices"`
	}
	_ = json.Unmarshal(data, &reg)
	if !reg.Registered || reg.Devices != 1 {
		t.Fatalf("push register result=%+v", reg)
	}

	// 14) 앱발 알림 트리거(3가지 버전 중 1) — 등록 기기 1대로 발송 시도.
	//     외부 Expo 호출은 테스트 환경에서 실패할 수 있으므로 상태코드만 검증하지 않고
	//     요청 형식 검증(빈 version → 400)만 확정적으로 확인한다.
	if res, _ := doJSON(t, app, "POST", "/api/telegram/alert", tok, map[string]string{}); res.StatusCode != 400 {
		t.Fatalf("alert without version status=%d, want 400", res.StatusCode)
	}
}

// TestTelegramCommands 는 텔레그램 명령 처리(네트워크 없이)의 핵심 동작을 검증한다.
func TestTelegramCommands(t *testing.T) {
	push := service.NewPushService(memory.NewPushTokenRepo(), "")
	tg := service.NewTelegramService(service.TelegramConfig{}, push)

	if tg.Enabled() {
		t.Fatal("봇 토큰이 없는데 Enabled=true")
	}

	help := tg.HandleCommand(context.Background(), 1, "/help")
	for _, want := range []string{"/alert1", "/alert2", "/alert3", "/help"} {
		if !contains(help, want) {
			t.Fatalf("help 에 %q 누락:\n%s", want, help)
		}
	}

	// 등록 기기 0대 → alert1 은 "기기 없음" 안내.
	r1 := tg.HandleCommand(context.Background(), 1, "/alert1")
	if !contains(r1, "등록된 기기가 없") {
		t.Fatalf("alert1(무기기) 응답=%q", r1)
	}

	// 기기 1대 등록 후 alert2 는 성공 요약(외부 호출은 no-op URL 로 대체 못하므로
	// 여기서는 status 명령으로 등록 반영만 확인).
	_ = push.Register(context.Background(), "ExponentPushToken[z]", "ios", "u1")
	st := tg.HandleCommand(context.Background(), 1, "/status")
	if !contains(st, "1대") {
		t.Fatalf("status 응답=%q", st)
	}

	unknown := tg.HandleCommand(context.Background(), 1, "/nope")
	if !contains(unknown, "/help") {
		t.Fatalf("unknown 응답=%q", unknown)
	}

	// /whoami 는 chat_id 를 그대로 안내한다(화이트리스트 설정에 필요).
	who := tg.HandleCommand(context.Background(), 4242, "/whoami")
	if !contains(who, "4242") {
		t.Fatalf("whoami 에 chat_id 누락: %q", who)
	}

	// /ping 은 생존 응답(pong)을 돌려준다.
	if pong := tg.HandleCommand(context.Background(), 1, "/ping"); !contains(pong, "pong") {
		t.Fatalf("ping 응답=%q", pong)
	}
}

// TestTelegramWhitelist 는 화이트리스트가 설정됐을 때 모든 발송 명령(alert1~3·alertall·alert)이
// 권한 없는 채팅에서 차단되는지 확인한다(alertall/alert 권한 우회 회귀 방지).
func TestTelegramWhitelist(t *testing.T) {
	push := service.NewPushService(memory.NewPushTokenRepo(), "")
	tg := service.NewTelegramService(service.TelegramConfig{AllowedChats: []int64{100}}, push)

	const denied = "권한이 없습니다"
	const outsider, insider = int64(200), int64(100)

	// 권한 없는 채팅(200): 모든 발송 명령이 거부돼야 한다.
	for _, cmd := range []string{"/alert1", "/alert2", "/alert3", "/alertall", "/alert 1 2 3"} {
		if r := tg.HandleCommand(context.Background(), outsider, cmd); !contains(r, denied) {
			t.Fatalf("비인가 채팅 %q 가 차단되지 않음: %q", cmd, r)
		}
	}

	// 권한 있는 채팅(100): 발송 명령이 권한 오류 없이 처리된다(등록 기기 0 → "기기 없음").
	if r := tg.HandleCommand(context.Background(), insider, "/alertall"); contains(r, denied) {
		t.Fatalf("인가 채팅이 차단됨: %q", r)
	}

	// 읽기 전용 명령(status/whoami/ping)은 화이트리스트와 무관하게 허용된다.
	if r := tg.HandleCommand(context.Background(), outsider, "/status"); contains(r, denied) {
		t.Fatalf("status 가 화이트리스트로 차단됨: %q", r)
	}
}

// TestAuthLifecycle 는 회원가입 → 중복확인 → 내 정보 수정 흐름을 검증한다.
func TestAuthLifecycle(t *testing.T) {
	deps := buildApp(t)
	app := server.New(*deps)

	// 1) 아이디/닉네임 중복확인 — 신규는 미사용.
	_, data := doJSON(t, app, "GET", "/api/auth/username-available?username=newbie", "", nil)
	if string(data) == "" || indexOf(string(data), `"taken":false`) < 0 {
		t.Fatalf("username-available want taken=false, got %s", data)
	}

	// 2) 회원가입
	res, data := doJSON(t, app, "POST", "/api/auth/register", "", map[string]string{
		"username": "newbie", "password": "pw12345678", "name": "새내기", "nickname": "안전지킴이", "email": "new@x.com", "org": "현장1팀",
	})
	if res.StatusCode != 200 {
		t.Fatalf("register status=%d body=%s", res.StatusCode, data)
	}
	var auth struct {
		AccessToken string `json:"access_token"`
		User        struct {
			LoginID  string `json:"login_id"`
			Nickname string `json:"nickname"`
		} `json:"user"`
	}
	if err := json.Unmarshal(data, &auth); err != nil {
		t.Fatalf("register decode: %v", err)
	}
	if auth.AccessToken == "" || auth.User.LoginID != "newbie" || auth.User.Nickname != "안전지킴이" {
		t.Fatalf("register user fields wrong: %s", data)
	}

	// 3) 같은 아이디 재가입 → 409
	// 비밀번호는 정책을 통과하는 값으로 준다 — 그래야 409 가 '중복' 때문임이 분명해진다
	// (정책 위반이면 중복 검사에 닿기 전에 400 으로 끝난다).
	if res, _ := doJSON(t, app, "POST", "/api/auth/register", "", map[string]string{"username": "newbie", "password": "pw12345678"}); res.StatusCode != 409 {
		t.Fatalf("duplicate register status=%d, want 409", res.StatusCode)
	}

	// 4) 이제 아이디/닉네임은 사용 중.
	_, data = doJSON(t, app, "GET", "/api/auth/username-available?username=newbie", "", nil)
	if indexOf(string(data), `"taken":true`) < 0 {
		t.Fatalf("username-available want taken=true, got %s", data)
	}
	_, data = doJSON(t, app, "GET", "/api/auth/nickname-available?nickname=안전지킴이", "", nil)
	if indexOf(string(data), `"taken":true`) < 0 {
		t.Fatalf("nickname-available want taken=true, got %s", data)
	}

	// 5) 내 정보 수정(PATCH /me) — 닉네임/이메일 변경.
	res, data = doJSON(t, app, "PATCH", "/api/auth/me", auth.AccessToken, map[string]string{"nickname": "베테랑", "email": "vet@x.com"})
	if res.StatusCode != 200 {
		t.Fatalf("update me status=%d body=%s", res.StatusCode, data)
	}
	if indexOf(string(data), `"베테랑"`) < 0 || indexOf(string(data), "vet@x.com") < 0 {
		t.Fatalf("update me not applied: %s", data)
	}

	// 6) 기존 닉네임(데모왕)으로 변경 시도 → 409 충돌.
	if res, _ := doJSON(t, app, "PATCH", "/api/auth/me", auth.AccessToken, map[string]string{"nickname": "데모왕"}); res.StatusCode != 409 {
		t.Fatalf("nickname conflict status=%d, want 409", res.StatusCode)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
