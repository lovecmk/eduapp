package server_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/lovecmk/eduapp/backend/internal/server"
)

// 관리 콘솔의 '정지'가 실제로 접근을 끊는지 확인한다.
//
// 예전에는 상태를 저장만 하고 아무 길목에서도 보지 않아, 정지된 사용자가
// 그대로 재로그인하고 API 를 계속 썼다. 정지는 세 길목 모두에서 막혀야 한다:
// 로그인(신규 세션) · 토큰 갱신(세션 연장) · 세션 복구(/api/auth/me).
func TestSuspendedAccountIsBlocked(t *testing.T) {
	deps := buildApp(t)
	app := server.New(*deps)
	ctx := context.Background()

	// 정지 전에 로그인해 살아 있는 토큰 한 쌍을 확보한다.
	res, data := doJSON(t, app, "POST", "/api/auth/login", "", map[string]string{
		"id": "demo", "password": "demo1234",
	})
	if res.StatusCode != 200 {
		t.Fatalf("login status=%d body=%s", res.StatusCode, data)
	}
	var auth struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.Unmarshal(data, &auth); err != nil {
		t.Fatalf("login decode: %v", err)
	}

	// 관리자가 계정을 정지시킨다(I).
	u, err := deps.Users.FindByLoginID(ctx, "demo")
	if err != nil {
		t.Fatalf("find demo: %v", err)
	}
	u.StatusCd = "I"
	if err := deps.Users.Update(ctx, u); err != nil {
		t.Fatalf("suspend: %v", err)
	}

	// 1) 재로그인 불가 — 비밀번호는 맞지만 403.
	if res, data := doJSON(t, app, "POST", "/api/auth/login", "", map[string]string{
		"id": "demo", "password": "demo1234",
	}); res.StatusCode != 403 {
		t.Fatalf("정지 계정 로그인 status=%d, want 403 (body=%s)", res.StatusCode, data)
	}

	// 2) 세션 복구 불가 — 이미 들고 있는 액세스 토큰으로도 통과하지 못한다.
	if res, data := doJSON(t, app, "GET", "/api/auth/me", auth.AccessToken, nil); res.StatusCode != 403 {
		t.Fatalf("정지 계정 me status=%d, want 403 (body=%s)", res.StatusCode, data)
	}

	// 3) 토큰 갱신 불가.
	if res, data := doJSON(t, app, "POST", "/api/auth/refresh", "", map[string]string{
		"refresh_token": auth.RefreshToken,
	}); res.StatusCode != 403 {
		t.Fatalf("정지 계정 refresh status=%d, want 403 (body=%s)", res.StatusCode, data)
	}

	// 4) 일반 API 도 곧바로 끊긴다. 액세스 토큰은 아직 유효하지만 계정 상태 게이트가
	//    막는다 — 이게 없으면 정지된 사람이 토큰 만료(15분)까지 학습을 계속한다.
	if res, data := doJSON(t, app, "GET", "/api/cards", auth.AccessToken, nil); res.StatusCode != 403 {
		t.Fatalf("정지 계정 cards status=%d, want 403 (body=%s)", res.StatusCode, data)
	}

	// 다시 활성(A)으로 되돌리면 정상 복귀해야 한다 — 정지가 되돌릴 수 없는 처분이면 곤란하다.
	u.StatusCd = "A"
	if err := deps.Users.Update(ctx, u); err != nil {
		t.Fatalf("reactivate: %v", err)
	}
	if res, data := doJSON(t, app, "POST", "/api/auth/login", "", map[string]string{
		"id": "demo", "password": "demo1234",
	}); res.StatusCode != 200 {
		t.Fatalf("복구 후 로그인 status=%d, want 200 (body=%s)", res.StatusCode, data)
	}
}

// 앱(ApiClient.health)은 /api/health 를 부른다. 로드밸런서용 /health 와 함께
// 두 경로가 모두 살아 있어야 개발자 화면의 서버 점검이 배포 상태를 제대로 비춘다.
func TestHealthOnBothPaths(t *testing.T) {
	deps := buildApp(t)
	deps.Cfg.Version = "1.2.3"
	app := server.New(*deps)

	for _, path := range []string{"/health", "/api/health"} {
		res, data := doJSON(t, app, "GET", path, "", nil)
		if res.StatusCode != 200 {
			t.Fatalf("%s status=%d", path, res.StatusCode)
		}
		var body struct {
			Status  string `json:"status"`
			Version string `json:"version"`
		}
		if err := json.Unmarshal(data, &body); err != nil {
			t.Fatalf("%s decode: %v", path, err)
		}
		if body.Status != "ok" {
			t.Fatalf("%s status=%q, want ok", path, body.Status)
		}
		// 앱은 이 값으로 "지금 붙은 서버가 어느 빌드인가"를 보여준다.
		if body.Version != "1.2.3" {
			t.Fatalf("%s version=%q, want 1.2.3", path, body.Version)
		}
	}
}
