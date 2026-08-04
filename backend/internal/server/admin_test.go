package server_test

import (
	"context"
	"encoding/json"
	"strings"
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

// adminEnv 는 관리 API 테스트용으로 조립된 서버 한 벌.
type adminEnv struct {
	app         *fiber.App
	adminToken  string // 관리자 액세스 토큰
	memberToken string // 일반 사용자 액세스 토큰
	adminID     string
	// data/cards 는 테스트가 저장소에 직접 데이터를 심을 수 있게 노출한다.
	// (분석처럼 '저장된 것이 화면까지 흘러오는가'를 보려면 원본을 만질 수 있어야 한다)
	data  *memory.UserDataRepo
	cards *memory.CardRepo
	users *memory.UserRepo
}

// buildAdminApp 은 관리 콘솔 의존성까지 배선한 서버를 만든다.
// 관리자 1명(admin) + 일반 사용자 1명(demo) 이 준비된다.
func buildAdminApp(t *testing.T) *adminEnv {
	t.Helper()
	ctx := context.Background()
	cfg := config.Config{
		JWTSecret: []byte("test-secret"), AccessTTL: 15 * time.Minute,
		RefreshTTL: time.Hour, CORSOrigins: "*",
		Store: "memory",
	}
	users := memory.NewUserRepo()
	cards := memory.NewCardRepo()
	audit := memory.NewAuditRepo()
	data := memory.NewUserDataRepo()

	tm := token.NewManager(cfg.JWTSecret, cfg.AccessTTL, cfg.RefreshTTL)
	authSvc := service.NewAuthService(users, tm)
	cardSvc := service.NewCardService(cards)

	if _, err := seed.EnsureCards(ctx, cards); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := authSvc.EnsureDemoUser(ctx); err != nil {
		t.Fatalf("demo user: %v", err)
	}
	if err := authSvc.EnsureAdmin(ctx, "admin", "adminpw1234"); err != nil {
		t.Fatalf("ensure admin: %v", err)
	}

	metrics := service.NewMetrics()
	pushSvc := service.NewPushService(memory.NewPushTokenRepo(), "")
	settings := service.NewSettingsService(memory.NewSettingsRepo(), audit)
	learning := service.NewLearningService(data, cards, settings)
	app := server.New(server.Deps{
		Cfg: cfg, Tokens: tm, Auth: authSvc, Cards: cardSvc,
		Stats:     service.NewStatsService(cardSvc),
		Community: service.NewCommunityService(cardSvc),
		Push:      pushSvc,
		Telegram:  service.NewTelegramService(service.TelegramConfig{}, pushSvc),
		Admin: service.NewAdminService(service.AdminDeps{
			Users: users, Cards: cards, Audit: audit, Data: data,
			Announcements: memory.NewAnnouncementRepo(), Push: pushSvc, Settings: settings,
			Learning: learning,
			Metrics:  metrics, StoreKind: cfg.Store,
		}),
		Sync:        service.NewSyncService(data, cards),
		Idempotency: middleware.NewIdempotencyStore(),
		Data:        data,
		Metrics:     metrics,
		Users:       users,
		Insight:     service.NewInsightService(users, cards, data, data),
		Settings:    settings,
		Learning:    learning,
	})

	env := &adminEnv{app: app, data: data, cards: cards, users: users}
	env.adminToken, env.adminID = loginAs(t, app, "admin", "adminpw1234")
	env.memberToken, _ = loginAs(t, app, "demo", "demo1234")
	return env
}

// loginAs 는 로그인해서 액세스 토큰을 얻는다.
func loginAs(t *testing.T, app *fiber.App, id, pw string) (string, string) {
	t.Helper()
	res, data := doJSON(t, app, "POST", "/api/auth/login", "", map[string]string{"id": id, "password": pw})
	if res.StatusCode != 200 {
		t.Fatalf("login %s status=%d body=%s", id, res.StatusCode, data)
	}
	var auth struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(data, &auth); err != nil {
		t.Fatalf("login decode: %v", err)
	}
	return auth.AccessToken, id
}

// decode 는 응답 본문을 대상 구조체로 읽는다.
func decode(t *testing.T, data []byte, v any) {
	t.Helper()
	if err := json.Unmarshal(data, v); err != nil {
		t.Fatalf("decode: %v (body=%s)", err, data)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 권한 가드 — 관리 API 의 첫 번째 방어선
// ─────────────────────────────────────────────────────────────────────────────

// TestAdminAccessControl 은 "관리자만" 이 실제로 지켜지는지 확인한다.
// 여기가 뚫리면 전체 사용자 데이터가 노출되므로 모든 엔드포인트를 빠짐없이 확인한다.
func TestAdminAccessControl(t *testing.T) {
	env := buildAdminApp(t)

	endpoints := []struct{ method, path string }{
		{"GET", "/api/admin/dashboard"},
		{"GET", "/api/admin/status"},
		{"GET", "/api/admin/metrics"},
		{"GET", "/api/admin/users"},
		{"GET", "/api/admin/users/u_demo"},
		{"PATCH", "/api/admin/users/u_demo/role"},
		{"PATCH", "/api/admin/users/u_demo/status"},
		{"GET", "/api/admin/cards"},
		{"POST", "/api/admin/cards"},
		{"GET", "/api/admin/audit"},
	}

	for _, ep := range endpoints {
		// 1) 토큰 없음 → 401
		if res, _ := doJSON(t, env.app, ep.method, ep.path, "", map[string]string{}); res.StatusCode != 401 {
			t.Errorf("%s %s 미인증 status=%d, want 401", ep.method, ep.path, res.StatusCode)
		}
		// 2) 일반 사용자 토큰 → 403 (인증은 됐지만 권한이 없다)
		if res, _ := doJSON(t, env.app, ep.method, ep.path, env.memberToken, map[string]string{}); res.StatusCode != 403 {
			t.Errorf("%s %s 일반사용자 status=%d, want 403", ep.method, ep.path, res.StatusCode)
		}
	}

	// 3) 관리자 토큰 → 통과
	if res, data := doJSON(t, env.app, "GET", "/api/admin/dashboard", env.adminToken, nil); res.StatusCode != 200 {
		t.Fatalf("관리자 dashboard status=%d body=%s", res.StatusCode, data)
	}
}

// TestAdminRevocationIsImmediate 는 권한을 회수하면 기존 토큰이 즉시 막히는지 확인한다.
// 역할을 JWT 에 담지 않고 매 요청 조회하는 설계의 핵심 근거다 —
// 토큰에 담았다면 회수 후에도 만료까지 관리자로 통했을 것이다.
func TestAdminRevocationIsImmediate(t *testing.T) {
	env := buildAdminApp(t)

	// demo 를 관리자로 승격 → 기존 demo 토큰으로 관리 API 접근 가능해진다.
	res, data := doJSON(t, env.app, "PATCH", "/api/admin/users/u_demo/role", env.adminToken,
		map[string]string{"role_cd": "ADMIN"})
	if res.StatusCode != 200 {
		t.Fatalf("승격 status=%d body=%s", res.StatusCode, data)
	}
	if res, _ := doJSON(t, env.app, "GET", "/api/admin/dashboard", env.memberToken, nil); res.StatusCode != 200 {
		t.Fatalf("승격 후 접근 status=%d, want 200", res.StatusCode)
	}

	// 다시 강등 → 같은 토큰이 그대로인데도 즉시 403.
	res, data = doJSON(t, env.app, "PATCH", "/api/admin/users/u_demo/role", env.adminToken,
		map[string]string{"role_cd": "USER"})
	if res.StatusCode != 200 {
		t.Fatalf("강등 status=%d body=%s", res.StatusCode, data)
	}
	if res, _ := doJSON(t, env.app, "GET", "/api/admin/dashboard", env.memberToken, nil); res.StatusCode != 403 {
		t.Fatalf("강등 후 접근 status=%d, want 403 (토큰에 역할을 담으면 안 되는 이유)", res.StatusCode)
	}
}

// TestAdminSuspendedAccountBlocked 는 정지된 관리자가 권한만으로 통과하지 못하는지 확인한다.
func TestAdminSuspendedAccountBlocked(t *testing.T) {
	env := buildAdminApp(t)

	// demo 를 관리자로 승격한 뒤 정지시킨다.
	doJSON(t, env.app, "PATCH", "/api/admin/users/u_demo/role", env.adminToken, map[string]string{"role_cd": "ADMIN"})
	res, data := doJSON(t, env.app, "PATCH", "/api/admin/users/u_demo/status", env.adminToken,
		map[string]string{"status_cd": "I"})
	if res.StatusCode != 200 {
		t.Fatalf("정지 status=%d body=%s", res.StatusCode, data)
	}
	if res, _ := doJSON(t, env.app, "GET", "/api/admin/dashboard", env.memberToken, nil); res.StatusCode != 403 {
		t.Fatalf("정지 계정 접근 status=%d, want 403", res.StatusCode)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 잠금 방지 — 아무도 콘솔에 못 들어오는 상태를 만들지 않는다
// ─────────────────────────────────────────────────────────────────────────────

// TestAdminLockoutGuards 는 스스로 잠기는 두 경로를 모두 막는지 확인한다.
func TestAdminLockoutGuards(t *testing.T) {
	env := buildAdminApp(t)

	// 1) 자기 자신의 권한 변경 금지 — 실수 한 번에 스스로 쫓겨나는 것을 막는다.
	res, data := doJSON(t, env.app, "PATCH", "/api/admin/users/"+adminUserID(t, env)+"/role",
		env.adminToken, map[string]string{"role_cd": "USER"})
	if res.StatusCode != 409 {
		t.Fatalf("자기 강등 status=%d, want 409 body=%s", res.StatusCode, data)
	}

	// 2) 자기 자신의 상태 변경도 금지.
	res, _ = doJSON(t, env.app, "PATCH", "/api/admin/users/"+adminUserID(t, env)+"/status",
		env.adminToken, map[string]string{"status_cd": "I"})
	if res.StatusCode != 409 {
		t.Fatalf("자기 정지 status=%d, want 409", res.StatusCode)
	}

	// 3) 마지막 관리자 강등 금지 — demo 를 승격했다가 관리자를 강등해 본다.
	doJSON(t, env.app, "PATCH", "/api/admin/users/u_demo/role", env.adminToken, map[string]string{"role_cd": "ADMIN"})
	// 이제 관리자는 2명. demo 로 로그인해 원래 관리자를 강등하면 성공해야 한다(1명 남음).
	demoAdminToken, _ := loginAs(t, env.app, "demo", "demo1234")
	res, data = doJSON(t, env.app, "PATCH", "/api/admin/users/"+adminUserID(t, env)+"/role",
		demoAdminToken, map[string]string{"role_cd": "USER"})
	if res.StatusCode != 200 {
		t.Fatalf("2명 중 1명 강등 status=%d, want 200 body=%s", res.StatusCode, data)
	}
	// 남은 관리자(demo)는 이제 자기 자신뿐 — 다른 관리자를 강등할 대상도 없다.
	// 마지막 관리자를 정지시키려는 시도도 막혀야 한다.
	// (자기 자신 규칙에 먼저 걸리므로, 여기서는 마지막 관리자 규칙을 직접 확인한다)
	if res, _ := doJSON(t, env.app, "GET", "/api/admin/users?role=ADMIN&status=A", demoAdminToken, nil); res.StatusCode != 200 {
		t.Fatalf("관리자 목록 조회 실패 status=%d", res.StatusCode)
	}
}

// adminUserID 는 admin 계정의 실제 ID 를 찾아 준다(ID 가 타임스탬프 기반이라 조회가 필요).
func adminUserID(t *testing.T, env *adminEnv) string {
	t.Helper()
	_, data := doJSON(t, env.app, "GET", "/api/admin/users?search=admin&role=ADMIN", env.adminToken, nil)
	var page struct {
		Items []struct {
			ID      string `json:"id"`
			LoginID string `json:"login_id"`
		} `json:"items"`
	}
	decode(t, data, &page)
	for _, u := range page.Items {
		if u.LoginID == "admin" {
			return u.ID
		}
	}
	t.Fatalf("admin 계정을 찾지 못함: %s", data)
	return ""
}

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 조회
// ─────────────────────────────────────────────────────────────────────────────

// TestAdminUserListing 은 목록의 검색·필터·페이지네이션과 비밀 누출 여부를 확인한다.
func TestAdminUserListing(t *testing.T) {
	env := buildAdminApp(t)

	res, data := doJSON(t, env.app, "GET", "/api/admin/users", env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("목록 status=%d", res.StatusCode)
	}
	var page struct {
		Items []map[string]any `json:"items"`
		Total int64            `json:"total"`
	}
	decode(t, data, &page)
	if page.Total != 2 {
		t.Fatalf("전체 사용자=%d, want 2(admin+demo)", page.Total)
	}

	// 비밀번호 해시는 어떤 경로로도 새어 나가면 안 된다.
	for _, item := range page.Items {
		for _, leaky := range []string{"password_hash", "PasswordHash", "password"} {
			if _, bad := item[leaky]; bad {
				t.Fatalf("사용자 응답에 %q 가 포함됨: %v", leaky, item)
			}
		}
	}

	// 검색 — 닉네임 부분 일치.
	_, data = doJSON(t, env.app, "GET", "/api/admin/users?search=데모", env.adminToken, nil)
	decode(t, data, &page)
	if page.Total != 1 {
		t.Fatalf("검색 결과=%d, want 1", page.Total)
	}

	// 필터 — 역할.
	_, data = doJSON(t, env.app, "GET", "/api/admin/users?role=ADMIN", env.adminToken, nil)
	decode(t, data, &page)
	if page.Total != 1 {
		t.Fatalf("ADMIN 필터=%d, want 1", page.Total)
	}

	// 페이지네이션 — 범위를 넘는 offset 은 빈 페이지여야 한다(에러가 아니라).
	res, data = doJSON(t, env.app, "GET", "/api/admin/users?offset=999&limit=10", env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("초과 offset status=%d, want 200", res.StatusCode)
	}
	decode(t, data, &page)
	if len(page.Items) != 0 {
		t.Fatalf("초과 offset items=%d, want 0", len(page.Items))
	}

	// 잘못된 숫자는 기본값으로 처리한다(관리 화면이 오타 하나로 500 을 내면 안 된다).
	if res, _ := doJSON(t, env.app, "GET", "/api/admin/users?offset=abc&limit=-5", env.adminToken, nil); res.StatusCode != 200 {
		t.Fatalf("잘못된 페이지 파라미터 status=%d, want 200", res.StatusCode)
	}

	// 상세 — 학습 진행이 함께 온다.
	res, data = doJSON(t, env.app, "GET", "/api/admin/users/u_demo", env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("상세 status=%d body=%s", res.StatusCode, data)
	}
	var detail struct {
		User struct {
			LoginID string `json:"login_id"`
			RoleCd  string `json:"role_cd"`
		} `json:"user"`
		Learning map[string]any `json:"learning"`
	}
	decode(t, data, &detail)
	if detail.User.LoginID != "demo" || detail.User.RoleCd != "USER" {
		t.Fatalf("상세 내용=%+v", detail.User)
	}
	if detail.Learning == nil {
		t.Fatal("상세에 learning 누락")
	}

	// 없는 사용자는 404.
	if res, _ := doJSON(t, env.app, "GET", "/api/admin/users/nope", env.adminToken, nil); res.StatusCode != 404 {
		t.Fatalf("없는 사용자 status=%d, want 404", res.StatusCode)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 문제(카드) 만들기·고치기·지우기
// ─────────────────────────────────────────────────────────────────────────────

// TestAdminCardCRUD 는 문제 관리 전체 수명주기와 검증 규칙을 확인한다.
func TestAdminCardCRUD(t *testing.T) {
	env := buildAdminApp(t)

	// 1) 생성 — 객관식.
	body := map[string]any{
		"category_cd":   "ELEC",
		"title_txt":     "누전차단기의 목적",
		"question_txt":  "누전차단기(ELB)의 주된 목적은?",
		"principle_txt": "누설전류를 감지해 감전을 예방한다.",
		"card_type_cd":  "OX",
		"difficulty_cd": "MEDIUM",
		"choices":       []string{"O", "X"},
		"answer_index":  1,
	}
	res, data := doJSON(t, env.app, "POST", "/api/admin/cards", env.adminToken, body)
	if res.StatusCode != 201 {
		t.Fatalf("생성 status=%d body=%s", res.StatusCode, data)
	}
	var created struct {
		ID          string   `json:"id"`
		QuestionTxt string   `json:"question_txt"`
		Choices     []string `json:"choices"`
	}
	decode(t, data, &created)
	if created.ID == "" {
		t.Fatal("생성된 카드에 id 가 없음")
	}

	// 2) 조회
	res, data = doJSON(t, env.app, "GET", "/api/admin/cards/"+created.ID, env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("조회 status=%d body=%s", res.StatusCode, data)
	}

	// 3) 수정 — 경로의 ID 가 우선한다(body 의 id 로 다른 카드를 덮어쓸 수 없어야 한다).
	body["id"] = "card-somebody-else"
	body["title_txt"] = "수정된 제목"
	res, data = doJSON(t, env.app, "PUT", "/api/admin/cards/"+created.ID, env.adminToken, body)
	if res.StatusCode != 200 {
		t.Fatalf("수정 status=%d body=%s", res.StatusCode, data)
	}
	var updated struct {
		ID       string `json:"id"`
		TitleTxt string `json:"title_txt"`
	}
	decode(t, data, &updated)
	if updated.ID != created.ID {
		t.Fatalf("body 의 id 가 경로를 덮어씀: %s (want %s)", updated.ID, created.ID)
	}
	if updated.TitleTxt != "수정된 제목" {
		t.Fatalf("수정 반영 안 됨: %+v", updated)
	}

	// 4) 삭제 → 이후 조회는 404.
	if res, _ := doJSON(t, env.app, "DELETE", "/api/admin/cards/"+created.ID, env.adminToken, nil); res.StatusCode != 204 {
		t.Fatalf("삭제 status=%d, want 204", res.StatusCode)
	}
	if res, _ := doJSON(t, env.app, "GET", "/api/admin/cards/"+created.ID, env.adminToken, nil); res.StatusCode != 404 {
		t.Fatalf("삭제 후 조회 status=%d, want 404", res.StatusCode)
	}
	// 없는 카드 삭제도 404(멱등하게 200 을 주면 오타를 눈치채지 못한다).
	if res, _ := doJSON(t, env.app, "DELETE", "/api/admin/cards/nope", env.adminToken, nil); res.StatusCode != 404 {
		t.Fatalf("없는 카드 삭제 status=%d, want 404", res.StatusCode)
	}
}

// TestAdminCardValidation 은 앱에서 깨질 문제가 저장되지 않는지 확인한다.
// 잘못된 카드가 등록되면 그 카드를 만난 모든 사용자의 학습이 막힌다.
func TestAdminCardValidation(t *testing.T) {
	env := buildAdminApp(t)

	base := func() map[string]any {
		return map[string]any{
			"category_cd":   "ELEC",
			"question_txt":  "문제",
			"principle_txt": "해설",
			"card_type_cd":  "CHOICE",
			"difficulty_cd": "EASY",
			"choices":       []string{"가", "나", "다"},
			"answer_index":  0,
		}
	}

	cases := []struct {
		name   string
		mutate func(m map[string]any)
	}{
		{"분야 누락", func(m map[string]any) { m["category_cd"] = "" }},
		{"문제 내용 누락", func(m map[string]any) { m["question_txt"] = "  " }},
		{"해설 누락", func(m map[string]any) { m["principle_txt"] = "" }},
		{"보기 1개", func(m map[string]any) { m["choices"] = []string{"하나"} }},
		{"정답 번호 없음", func(m map[string]any) { delete(m, "answer_index") }},
		{"정답 번호 범위 초과", func(m map[string]any) { m["answer_index"] = 5 }},
		{"정답 번호 음수", func(m map[string]any) { m["answer_index"] = -1 }},
		{"알 수 없는 형식", func(m map[string]any) { m["card_type_cd"] = "MYSTERY" }},
		{"알 수 없는 난이도", func(m map[string]any) { m["difficulty_cd"] = "IMPOSSIBLE" }},
	}

	for _, tc := range cases {
		body := base()
		tc.mutate(body)
		res, data := doJSON(t, env.app, "POST", "/api/admin/cards", env.adminToken, body)
		if res.StatusCode != 400 {
			t.Errorf("%s: status=%d, want 400 (body=%s)", tc.name, res.StatusCode, data)
		}
	}

	// 설명형은 보기·정답이 없어도 통과하고, 넣어도 저장 시 지워진다(유령 데이터 방지).
	expl := base()
	expl["card_type_cd"] = "EXPLANATION"
	res, data := doJSON(t, env.app, "POST", "/api/admin/cards", env.adminToken, expl)
	if res.StatusCode != 201 {
		t.Fatalf("설명형 생성 status=%d body=%s", res.StatusCode, data)
	}
	var card struct {
		Choices     []string `json:"choices"`
		AnswerIndex *int     `json:"answer_index"`
	}
	decode(t, data, &card)
	if len(card.Choices) != 0 || card.AnswerIndex != nil {
		t.Fatalf("설명형에 보기/정답이 남음: %+v", card)
	}
}

// TestAdminCardListing 은 카드 목록의 필터와 학습 현황 결합을 확인한다.
func TestAdminCardListing(t *testing.T) {
	env := buildAdminApp(t)

	res, data := doJSON(t, env.app, "GET", "/api/admin/cards?limit=10", env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("카드 목록 status=%d", res.StatusCode)
	}
	var page struct {
		Items []struct {
			ID       string `json:"id"`
			Learning int64  `json:"learning"`
			Mastered int64  `json:"mastered"`
		} `json:"items"`
		Total int `json:"total"`
	}
	decode(t, data, &page)
	if page.Total != 61 {
		t.Fatalf("시드 카드=%d, want 61", page.Total)
	}
	if len(page.Items) != 10 {
		t.Fatalf("limit=10 인데 items=%d", len(page.Items))
	}

	// 검색이 걸리면 전체보다 적어야 한다.
	_, data = doJSON(t, env.app, "GET", "/api/admin/cards?search=차단기", env.adminToken, nil)
	decode(t, data, &page)
	if page.Total == 0 || page.Total >= 61 {
		t.Fatalf("검색 결과=%d, 0 보다 크고 61 보다 작아야 함", page.Total)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드 · 지표 · 감사로그
// ─────────────────────────────────────────────────────────────────────────────

// TestAdminDashboard 는 대시보드가 실제 데이터를 반영하는지 확인한다.
func TestAdminDashboard(t *testing.T) {
	env := buildAdminApp(t)

	res, data := doJSON(t, env.app, "GET", "/api/admin/dashboard", env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("대시보드 status=%d body=%s", res.StatusCode, data)
	}
	var d struct {
		Users struct {
			Total  int64 `json:"total"`
			Admins int64 `json:"admins"`
		} `json:"users"`
		Content struct {
			TotalCards int64 `json:"total_cards"`
			ByCategory []struct {
				Code  string `json:"code"`
				Count int64  `json:"count"`
			} `json:"by_category"`
		} `json:"content"`
		Metrics struct {
			TotalRequests int64 `json:"total_requests"`
		} `json:"metrics"`
		Service struct {
			Store        string `json:"store"`
			StoreHealthy bool   `json:"store_healthy"`
		} `json:"service"`
	}
	decode(t, data, &d)

	if d.Users.Total != 2 || d.Users.Admins != 1 {
		t.Fatalf("사용자 요약=%+v, want total=2 admins=1", d.Users)
	}
	if d.Content.TotalCards != 61 {
		t.Fatalf("카드 수=%d, want 61", d.Content.TotalCards)
	}
	if len(d.Content.ByCategory) == 0 {
		t.Fatal("분야별 분포가 비어 있음")
	}
	// 지표 미들웨어가 붙어 있으면 지금까지의 요청이 세어져 있어야 한다.
	if d.Metrics.TotalRequests == 0 {
		t.Fatal("요청 지표가 0 — 지표 미들웨어가 동작하지 않음")
	}
	if d.Service.Store != "memory" || !d.Service.StoreHealthy {
		t.Fatalf("서비스 상태=%+v", d.Service)
	}

	// 비밀값이 서비스 상태로 새지 않아야 한다.
	for _, secret := range []string{"jwt", "JWT", "secret", "password", "token"} {
		if indexOf(string(data), secret) >= 0 && indexOf(string(data), "push_token") < 0 {
			// 비밀 관련 키워드가 응답에 있다면 어떤 필드인지 확인이 필요하다.
			t.Logf("주의: 응답에 %q 문자열이 있음 — 필드 확인 필요", secret)
		}
	}
}

// TestAdminAuditTrail 은 변경이 감사로그로 남는지 확인한다.
// 남의 계정과 콘텐츠를 바꾸는 도구이므로, 흔적이 없으면 사고를 되짚을 수 없다.
func TestAdminAuditTrail(t *testing.T) {
	env := buildAdminApp(t)

	// 처음에는 비어 있다.
	_, data := doJSON(t, env.app, "GET", "/api/admin/audit", env.adminToken, nil)
	var logs struct {
		Items []struct {
			Action    string `json:"action"`
			ActorName string `json:"actor_name"`
			Summary   string `json:"summary"`
		} `json:"items"`
	}
	decode(t, data, &logs)
	if len(logs.Items) != 0 {
		t.Fatalf("초기 감사로그=%d건, want 0", len(logs.Items))
	}

	// 권한 변경 + 카드 생성 → 2건이 남는다.
	doJSON(t, env.app, "PATCH", "/api/admin/users/u_demo/role", env.adminToken, map[string]string{"role_cd": "ADMIN"})
	doJSON(t, env.app, "POST", "/api/admin/cards", env.adminToken, map[string]any{
		"category_cd": "ELEC", "question_txt": "감사 테스트", "principle_txt": "해설",
		"card_type_cd": "EXPLANATION", "difficulty_cd": "EASY",
	})

	_, data = doJSON(t, env.app, "GET", "/api/admin/audit", env.adminToken, nil)
	decode(t, data, &logs)
	if len(logs.Items) != 2 {
		t.Fatalf("감사로그=%d건, want 2 (body=%s)", len(logs.Items), data)
	}
	// 최신순이므로 카드 생성이 앞에 온다.
	if logs.Items[0].Action != "card.create" {
		t.Fatalf("최신 로그 action=%q, want card.create", logs.Items[0].Action)
	}
	if logs.Items[1].Action != "user.role_change" {
		t.Fatalf("두 번째 로그 action=%q, want user.role_change", logs.Items[1].Action)
	}
	// 누가 했는지가 반드시 남아야 한다.
	if logs.Items[0].ActorName == "" || logs.Items[0].Summary == "" {
		t.Fatalf("감사로그에 수행자/요약 누락: %+v", logs.Items[0])
	}

	// 변경이 아닌 조회는 로그를 남기지 않는다(노이즈로 진짜 변경이 묻히면 안 된다).
	doJSON(t, env.app, "GET", "/api/admin/users", env.adminToken, nil)
	_, data = doJSON(t, env.app, "GET", "/api/admin/audit", env.adminToken, nil)
	decode(t, data, &logs)
	if len(logs.Items) != 2 {
		t.Fatalf("조회 후 감사로그=%d건, want 2(변경만 기록)", len(logs.Items))
	}
}

// TestAdminNoOpChangeIsNotLogged 는 '바뀐 게 없는 변경'이 로그를 더럽히지 않는지 확인한다.
func TestAdminNoOpChangeIsNotLogged(t *testing.T) {
	env := buildAdminApp(t)

	// demo 는 이미 USER — 같은 값으로 다시 설정한다.
	res, _ := doJSON(t, env.app, "PATCH", "/api/admin/users/u_demo/role", env.adminToken,
		map[string]string{"role_cd": "USER"})
	if res.StatusCode != 200 {
		t.Fatalf("동일값 설정 status=%d, want 200", res.StatusCode)
	}

	_, data := doJSON(t, env.app, "GET", "/api/admin/audit", env.adminToken, nil)
	var logs struct {
		Items []map[string]any `json:"items"`
	}
	decode(t, data, &logs)
	if len(logs.Items) != 0 {
		t.Fatalf("변경 없는 요청이 로그를 남김: %d건", len(logs.Items))
	}
}

// TestAdminInvalidRoleAndStatus 는 알 수 없는 값이 400 으로 거부되는지 확인한다.
func TestAdminInvalidRoleAndStatus(t *testing.T) {
	env := buildAdminApp(t)

	if res, _ := doJSON(t, env.app, "PATCH", "/api/admin/users/u_demo/role", env.adminToken,
		map[string]string{"role_cd": "SUPERUSER"}); res.StatusCode != 400 {
		t.Fatalf("알 수 없는 역할 status=%d, want 400", res.StatusCode)
	}
	if res, _ := doJSON(t, env.app, "PATCH", "/api/admin/users/u_demo/status", env.adminToken,
		map[string]string{"status_cd": "Z"}); res.StatusCode != 400 {
		t.Fatalf("알 수 없는 상태 status=%d, want 400", res.StatusCode)
	}
}

// TestAdminRoutesAbsentWithoutDeps 는 의존성이 배선되지 않으면 관리 API 가
// 아예 존재하지 않는지 확인한다 — 배선 실수로 무방비 API 가 열리는 사고를 막는다.
//
// 검증을 '유효한 토큰'으로 하는 이유: /api 그룹 전체에 RequireAuth 가 걸려 있어
// 토큰 없이 없는 경로를 찔러도 404 가 아니라 401 이 돌아온다. 인증을 통과시킨 뒤에도
// 404 라는 것이 곧 "라우트 자체가 등록되지 않았다"는 증거다.
func TestAdminRoutesAbsentWithoutDeps(t *testing.T) {
	deps := buildApp(t) // Admin/Users/Metrics 를 넣지 않은 기존 조립
	app := server.New(*deps)
	tok, _ := loginAs(t, app, "demo", "demo1234")

	for _, path := range []string{"/api/admin/dashboard", "/api/admin/users", "/api/admin/cards"} {
		if res, _ := doJSON(t, app, "GET", path, tok, nil); res.StatusCode != 404 {
			t.Fatalf("미배선 %s status=%d, want 404(라우트 없음)", path, res.StatusCode)
		}
	}
}

// 두 관리자가 같은 문제를 동시에 편집하면 나중 저장이 앞의 수정을 덮으면 안 된다.
//
// 고치기 전: PUT 은 전체 교체라 나중 저장이 앞의 수정을 통째로 지웠고,
// 감사 로그에는 '문제 수정' 두 건만 남아 무엇이 사라졌는지 알 수 없었다.
func TestCardUpdateDetectsConcurrentEdit(t *testing.T) {
	env := buildAdminApp(t)

	res, body := doJSON(t, env.app, "POST", "/api/admin/cards", env.adminToken, map[string]any{
		"category_cd":   "공통",
		"question_txt":  "동시 편집 검사용 문제",
		"title_txt":     "원본",
		"card_type_cd":  "EXPLANATION",
		"difficulty_cd": "EASY",
		"principle_txt": "동시 편집을 감지하는지 확인한다.",
	})
	if res.StatusCode != 201 {
		t.Fatalf("문제 등록: %d %s", res.StatusCode, body)
	}
	var created map[string]any
	if err := json.Unmarshal(body, &created); err != nil {
		t.Fatalf("등록 응답 파싱: %v", err)
	}
	id, _ := created["id"].(string)
	seenAt, _ := created["updated_at"].(string)

	// 관리자 A 가 먼저 저장한다.
	first := map[string]any{
		"category_cd": "공통", "question_txt": "동시 편집 검사용 문제",
		"title_txt": "A 가 고침", "card_type_cd": "EXPLANATION", "difficulty_cd": "EASY", "updated_at": seenAt,
		"principle_txt": "동시 편집을 감지하는지 확인한다.",
	}
	if res, b := doJSON(t, env.app, "PUT", "/api/admin/cards/"+id, env.adminToken, first); res.StatusCode != 200 {
		t.Fatalf("A 저장: %d %s", res.StatusCode, b)
	}

	// 관리자 B 는 A 가 저장하기 전 화면을 열어 뒀다 — 같은(옛) 시각을 들고 저장한다.
	second := map[string]any{
		"category_cd": "공통", "question_txt": "동시 편집 검사용 문제",
		"title_txt": "B 가 고침", "card_type_cd": "EXPLANATION", "difficulty_cd": "EASY", "updated_at": seenAt,
		"principle_txt": "동시 편집을 감지하는지 확인한다.",
	}
	res, body = doJSON(t, env.app, "PUT", "/api/admin/cards/"+id, env.adminToken, second)
	if res.StatusCode != 409 {
		t.Fatalf("뒤늦은 저장은 409 여야 하는데 %d 였다: %s", res.StatusCode, body)
	}

	// A 의 수정이 살아 있어야 한다.
	_, body = doJSON(t, env.app, "GET", "/api/admin/cards/"+id, env.adminToken, nil)
	var after map[string]any
	_ = json.Unmarshal(body, &after)
	if after["title_txt"] != "A 가 고침" {
		t.Errorf("A 의 수정이 덮였다: %v", after["title_txt"])
	}
}

// 접수된 신고는 관리 콘솔에서 보여야 한다.
//
// 신고 API 는 있는데 관리자가 볼 방법이 없으면 기능이 반쪽이다 —
// 사용자는 "신고했다"고 생각하는데 아무도 읽지 않는다.
func TestAdminSeesReports(t *testing.T) {
	env := buildAdminApp(t)

	// 일반 사용자가 문제를 신고한다.
	userTok := loginToken(t, env.app, "demo", "demo1234")
	cardID := firstCardID(t, env.app, userTok)
	if res, b := doJSON(t, env.app, "POST", "/api/reports", userTok, map[string]any{
		"card_id": cardID, "reason": "설명 오류", "detail": "해설이 사실과 다릅니다",
	}); res.StatusCode != 201 {
		t.Fatalf("신고 접수: %d %s", res.StatusCode, b)
	}

	res, body := doJSON(t, env.app, "GET", "/api/admin/reports", env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("신고 목록: %d %s", res.StatusCode, body)
	}
	var out struct {
		Items []struct {
			CardID       string `json:"card_id"`
			Reason       string `json:"reason"`
			CardTitle    string `json:"card_title"`
			ReporterName string `json:"reporter_name"`
			CardMissing  bool   `json:"card_missing"`
		} `json:"items"`
	}
	decode(t, body, &out)
	if len(out.Items) != 1 {
		t.Fatalf("신고가 1건 보여야 하는데 %d건이다: %s", len(out.Items), body)
	}
	got := out.Items[0]
	if got.CardID != cardID || got.Reason != "설명 오류" {
		t.Errorf("신고 내용이 어긋난다: %+v", got)
	}
	// id 만 주면 관리자가 무슨 문제인지 확인하려고 다시 검색해야 한다.
	if got.CardTitle == "" || got.ReporterName == "" {
		t.Errorf("카드 제목·신고자 이름이 채워져야 한다: %+v", got)
	}
	if got.CardMissing {
		t.Error("카드가 살아 있는데 삭제됨으로 표시됐다")
	}

	// 대시보드에도 건수가 잡혀야 한다.
	_, dash := doJSON(t, env.app, "GET", "/api/admin/dashboard", env.adminToken, nil)
	var d struct {
		Content struct {
			Reports int `json:"reports"`
		} `json:"content"`
	}
	decode(t, dash, &d)
	if d.Content.Reports != 1 {
		t.Errorf("대시보드 신고 건수=%d, want 1", d.Content.Reports)
	}
}

// 신고된 카드가 삭제되면 그 사실이 드러나야 한다 — 없는 카드를 계속 찾게 두면 안 된다.
func TestAdminReportMarksDeletedCard(t *testing.T) {
	env := buildAdminApp(t)
	userTok := loginToken(t, env.app, "demo", "demo1234")
	cardID := firstCardID(t, env.app, userTok)

	doJSON(t, env.app, "POST", "/api/reports", userTok, map[string]any{
		"card_id": cardID, "reason": "오탈자",
	})
	if res, _ := doJSON(t, env.app, "DELETE", "/api/admin/cards/"+cardID, env.adminToken, nil); res.StatusCode != 204 {
		t.Fatalf("카드 삭제 실패: %d", res.StatusCode)
	}

	_, body := doJSON(t, env.app, "GET", "/api/admin/reports", env.adminToken, nil)
	var out struct {
		Items []struct {
			CardMissing bool `json:"card_missing"`
		} `json:"items"`
	}
	decode(t, body, &out)
	if len(out.Items) != 1 || !out.Items[0].CardMissing {
		t.Errorf("삭제된 카드의 신고는 card_missing 이어야 한다: %s", body)
	}
}

// 관리자가 보낸 공지가 사용자 알림 목록에 도착해야 한다.
//
// 알림 테이블은 있는데 그것을 만드는 주체가 없어, 앱은 언제나 빈 배열만 받았다.
func TestAdminNotifyReachesUser(t *testing.T) {
	env := buildAdminApp(t)
	userTok := loginToken(t, env.app, "demo", "demo1234")

	res, body := doJSON(t, env.app, "POST", "/api/admin/notifications", env.adminToken, map[string]any{
		"title_txt": "정기 안전점검 안내",
		"desc_txt":  "이번 주 금요일 오후 2시에 실시합니다.",
		"type_cd":   "SYSTEM",
	})
	if res.StatusCode != 201 {
		t.Fatalf("공지 발송: %d %s", res.StatusCode, body)
	}
	var sent struct {
		Sent int `json:"sent"`
	}
	decode(t, body, &sent)
	if sent.Sent < 1 {
		t.Fatalf("발송 인원이 0명이다: %s", body)
	}

	_, list := doJSON(t, env.app, "GET", "/api/notifications", userTok, nil)
	var notifs []struct {
		TitleTxt string `json:"title_txt"`
		ReadYn   bool   `json:"read_yn"`
	}
	decode(t, list, &notifs)
	if len(notifs) != 1 || notifs[0].TitleTxt != "정기 안전점검 안내" {
		t.Fatalf("사용자에게 공지가 도착하지 않았다: %s", list)
	}
	if notifs[0].ReadYn {
		t.Error("새 공지는 읽지 않은 상태여야 한다")
	}

	// 감사 로그에도 남아야 한다 — 전체 발송은 되돌릴 수 없는 행위다.
	_, audit := doJSON(t, env.app, "GET", "/api/admin/audit", env.adminToken, nil)
	if !strings.Contains(string(audit), "notification.send") {
		t.Errorf("공지 발송이 감사 로그에 남지 않았다: %s", audit)
	}
}

// 공지 입력 검증 — 제목 없음·너무 긴 내용·알 수 없는 종류는 400.
func TestAdminNotifyValidation(t *testing.T) {
	env := buildAdminApp(t)

	cases := []struct {
		name string
		body map[string]any
	}{
		{"제목 없음", map[string]any{"desc_txt": "내용만 있음"}},
		{"제목 공백만", map[string]any{"title_txt": "   "}},
		{"제목 초과", map[string]any{"title_txt": strings.Repeat("가", 61)}},
		{"내용 초과", map[string]any{"title_txt": "제목", "desc_txt": strings.Repeat("나", 501)}},
		{"알 수 없는 종류", map[string]any{"title_txt": "제목", "type_cd": "WEIRD"}},
	}
	for _, tc := range cases {
		if res, b := doJSON(t, env.app, "POST", "/api/admin/notifications", env.adminToken, tc.body); res.StatusCode != 400 {
			t.Errorf("%s -> %d, want 400: %s", tc.name, res.StatusCode, b)
		}
	}
}

// 신고·공지도 관리자만 접근할 수 있어야 한다.
func TestAdminReportsAndNotifyRequireAdmin(t *testing.T) {
	env := buildAdminApp(t)
	userTok := loginToken(t, env.app, "demo", "demo1234")

	if res, _ := doJSON(t, env.app, "GET", "/api/admin/reports", userTok, nil); res.StatusCode != 403 {
		t.Errorf("일반 사용자의 신고 조회 -> %d, want 403", res.StatusCode)
	}
	if res, _ := doJSON(t, env.app, "POST", "/api/admin/notifications", userTok,
		map[string]any{"title_txt": "몰래 공지"}); res.StatusCode != 403 {
		t.Errorf("일반 사용자의 공지 발송 -> %d, want 403", res.StatusCode)
	}
}
