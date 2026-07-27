package server_test

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
	"github.com/lovecmk/eduapp/backend/internal/server"
)

// 이 파일은 QA 진단에서 실제로 재현된 결함들을 고정한다.
// 각 테스트는 "고치기 전에는 어떻게 실패했는지"를 함께 적어 둔다 —
// 나중에 누군가 이 검사를 지우려 할 때 무엇을 잃는지 알 수 있어야 한다.

// 학습 콘텐츠 등록은 관리자만 할 수 있어야 한다.
//
// 고치기 전: 로그인만 하면 누구나 POST /api/cards 로 카드를 만들 수 있었고,
// 그 카드는 검증도 감사 기록도 없이 전 사용자의 학습 목록에 배포됐다.
func TestCardCreateRequiresAdmin(t *testing.T) {
	d := buildApp(t)
	app := server.New(*d)

	userToken := loginToken(t, app, "demo", "demo1234")
	res, body := doJSON(t, app, "POST", "/api/cards", userToken, map[string]any{
		"category_cd":  "FIRE",
		"question_txt": "일반 사용자가 주입을 시도한 문제",
		"title_txt":    "INJECTED",
	})
	if res.StatusCode != 403 {
		t.Fatalf("일반 사용자의 카드 등록은 403 이어야 하는데 %d 였다: %s", res.StatusCode, body)
	}

	// 실제로 콘텐츠가 들어가지 않았는지까지 확인한다 —
	// 상태 코드만 보면 "막혔다고 답하고 저장은 된" 경우를 놓친다.
	_, list := doJSON(t, app, "GET", "/api/cards", userToken, nil)
	if strings.Contains(string(list), "INJECTED") {
		t.Fatal("403 으로 막혔는데도 카드가 목록에 남아 있다")
	}
}

// 비밀번호 정책이 없으면 한 자리 비밀번호로도 계정이 만들어진다.
func TestRegisterPasswordPolicy(t *testing.T) {
	d := buildApp(t)
	app := server.New(*d)

	cases := []struct {
		name     string
		password string
		want     int
	}{
		{"한 자리", "1", 400},
		{"공백만", "        ", 400},
		{"경계값 7자", "1234567", 400},
		{"경계값 8자", "12345678", 200},
		// bcrypt 는 72바이트를 넘기면 오류를 낸다. 그건 서버 장애가 아니라 입력 오류이므로
		// 500 이 아니라 400 으로 답해야 한다(고치기 전에는 500 이었다).
		{"72바이트 초과", strings.Repeat("a", 73), 400},
		{"경계값 72바이트", strings.Repeat("a", 72), 200},
	}
	for i, tc := range cases {
		res, body := doJSON(t, app, "POST", "/api/auth/register", "", map[string]string{
			"username": fmt.Sprintf("pw_case_%d", i),
			"password": tc.password,
			"name":     "정책검사",
		})
		if res.StatusCode != tc.want {
			t.Errorf("%s 비밀번호: %d 를 기대했는데 %d 였다 (%s)", tc.name, tc.want, res.StatusCode, body)
		}
	}
}

// 같은 아이디로 동시에 가입해도 계정은 하나만 만들어져야 한다.
//
// 고치기 전: 8건이 전부 200 으로 성공했고, 그중 마지막 하나만 로그인할 수 있었다.
// 나머지 7명은 "가입 성공" 과 토큰까지 받았지만 다시는 들어올 수 없는 계정을 받았다.
func TestConcurrentRegisterCreatesOneAccount(t *testing.T) {
	d := buildApp(t)
	app := server.New(*d)

	const attempts = 8
	codes := make([]int, attempts)
	var wg sync.WaitGroup
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			res, _ := doJSON(t, app, "POST", "/api/auth/register", "", map[string]string{
				"username": "racer", "password": "pw12345678",
				"name": fmt.Sprintf("동시가입%d", i),
			})
			codes[i] = res.StatusCode
		}(i)
	}
	wg.Wait()

	created := 0
	for _, c := range codes {
		if c == 200 {
			created++
		}
	}
	if created != 1 {
		t.Errorf("동시 가입 %d건 중 1건만 성공해야 하는데 %d건 성공했다 (codes=%v)", attempts, created, codes)
	}

	// 저장소에 실제로 몇 개가 들어갔는지 본다. 응답 코드만 보면
	// "409 를 답하고 저장은 된" 경우를 놓친다.
	list, _, err := d.Users.List(context.Background(), ports.UserQuery{Search: "racer", Limit: 50})
	if err != nil {
		t.Fatalf("목록 조회: %v", err)
	}
	if len(list) != 1 {
		t.Errorf("저장소에 racer 계정이 1개여야 하는데 %d개다 — 로그인 불가 고아 계정이 생겼다", len(list))
	}
}

// 중복 가입은 500(서버 오류)이 아니라 409(충돌)로 답해야 한다.
func TestDuplicateRegisterReturns409(t *testing.T) {
	d := buildApp(t)
	app := server.New(*d)

	first, _ := doJSON(t, app, "POST", "/api/auth/register", "", map[string]string{
		"username": "dup", "password": "pw12345678", "name": "첫번째",
	})
	if first.StatusCode != 200 {
		t.Fatalf("첫 가입은 성공해야 한다: %d", first.StatusCode)
	}
	second, body := doJSON(t, app, "POST", "/api/auth/register", "", map[string]string{
		"username": "dup", "password": "pw12345678", "name": "두번째",
	})
	if second.StatusCode != 409 {
		t.Errorf("중복 가입은 409 여야 하는데 %d 였다: %s", second.StatusCode, body)
	}
}

// 무인증 인증 경로에는 속도 제한이 걸려 있어야 한다.
//
// 고치기 전: 200회 연속 오답에도 아무 제동이 없었고 직후 정상 로그인도 그대로 됐다.
func TestLoginRateLimited(t *testing.T) {
	d := buildApp(t)
	app := server.New(*d)

	blocked := 0
	for i := 0; i < 60; i++ {
		res, _ := doJSON(t, app, "POST", "/api/auth/login", "", map[string]string{
			"id": "demo", "password": fmt.Sprintf("wrong%d", i),
		})
		if res.StatusCode == 429 {
			blocked++
		}
	}
	if blocked == 0 {
		t.Error("60회 연속 로그인 실패에도 429 가 한 번도 나오지 않았다 — 무차별 대입을 막지 못한다")
	}
}

// 정상 사용자가 오타 몇 번으로 잠기면 안 된다(제한이 지나치게 빡빡하지 않은지).
func TestLoginRateLimitAllowsHumanRetries(t *testing.T) {
	d := buildApp(t)
	app := server.New(*d)

	for i := 0; i < 3; i++ {
		res, _ := doJSON(t, app, "POST", "/api/auth/login", "", map[string]string{
			"id": "demo", "password": "oops",
		})
		if res.StatusCode != 401 {
			t.Fatalf("%d번째 오타 시도는 401 이어야 한다: %d", i+1, res.StatusCode)
		}
	}
	res, body := doJSON(t, app, "POST", "/api/auth/login", "", map[string]string{
		"id": "demo", "password": "demo1234",
	})
	if res.StatusCode != 200 {
		t.Errorf("오타 3번 뒤 정상 로그인은 되어야 하는데 %d 였다: %s", res.StatusCode, body)
	}
}

// loginToken 은 로그인해서 액세스 토큰만 꺼내 온다.
func loginToken(t *testing.T, app *fiber.App, id, password string) string {
	t.Helper()
	res, body := doJSON(t, app, "POST", "/api/auth/login", "", map[string]string{"id": id, "password": password})
	if res.StatusCode != 200 {
		t.Fatalf("로그인 실패(%s): %d %s", id, res.StatusCode, body)
	}
	var out struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("토큰 파싱: %v", err)
	}
	return out.AccessToken
}

// promoteToAdmin 은 기존 계정을 관리자로 올리고 새 액세스 토큰을 돌려준다.
// 콘텐츠 등록처럼 관리자만 할 수 있는 흐름을 검증할 때 쓴다.
func promoteToAdmin(t *testing.T, d *server.Deps, app *fiber.App, loginID, password string) string {
	t.Helper()
	u, err := d.Users.FindByLoginID(context.Background(), loginID)
	if err != nil {
		t.Fatalf("승격 대상 조회(%s): %v", loginID, err)
	}
	u.RoleCd = domain.RoleAdmin
	if err := d.Users.Update(context.Background(), u); err != nil {
		t.Fatalf("승격: %v", err)
	}
	return loginToken(t, app, loginID, password)
}

// 저장된 학습 기록은 이후 요청이 지나가도 그대로 남아 있어야 한다.
//
// 고치기 전: 진행 기록에 저장된 CardID 가 요청 버퍼를 그대로 가리키고 있어서,
// 다음 요청이 그 버퍼를 재사용하면 "q1" 이 "og" 같은 값으로 조용히 바뀌었다.
// 키는 그대로라 기록은 남아 있는데 내용이 어긋나, 학습 통계가 0 으로 돌아갔다.
// 오류도 로그도 남지 않아 사용자는 "기록이 사라졌다"고만 느낀다.
func TestProgressSurvivesLaterRequests(t *testing.T) {
	deps := buildApp(t)
	app := server.New(*deps)
	tok := loginToken(t, app, "demo", "demo1234")

	_, body := doJSON(t, app, "GET", "/api/cards", tok, nil)
	var all []map[string]any
	if err := json.Unmarshal(body, &all); err != nil || len(all) == 0 {
		t.Fatalf("카드 목록: %v (%d장)", err, len(all))
	}
	cardID := all[0]["id"].(string)

	if res, b := doJSON(t, app, "PATCH", "/api/cards/"+cardID, tok, map[string]string{
		"status_cd": "MASTERED",
	}); res.StatusCode != 200 {
		t.Fatalf("학습 완료 기록: %d %s", res.StatusCode, b)
	}

	// 버퍼가 재사용되도록 다른 요청을 여러 번 흘려보낸다.
	for i := 0; i < 5; i++ {
		doJSON(t, app, "GET", "/api/cards/today", tok, nil)
		doJSON(t, app, "GET", "/api/auth/me", tok, nil)
	}

	_, body = doJSON(t, app, "GET", "/api/cards", tok, nil)
	var after []map[string]any
	if err := json.Unmarshal(body, &after); err != nil {
		t.Fatalf("카드 목록 재조회: %v", err)
	}
	for _, c := range after {
		if c["id"] == cardID {
			if c["status_cd"] != "MASTERED" {
				t.Fatalf("이후 요청이 지나간 뒤 %s 상태가 %v 로 바뀌었다 — 저장된 기록이 변질됐다",
					cardID, c["status_cd"])
			}
			return
		}
	}
	t.Fatalf("%s 카드가 목록에서 사라졌다", cardID)
}
