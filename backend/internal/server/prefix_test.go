package server_test

import (
	"encoding/json"
	"testing"

	"github.com/lovecmk/eduapp/backend/internal/server"
)

// 게이트웨이 로케이션 블록이 `/api` → `/inner/api/v1` 로 바뀐 뒤에도 서버가
// 같은 API 를 낸다는 것을 확인한다.
//
// 이 테스트가 없으면 접두사 배선이 깨져도 기존 테스트는 전부 통과한다 —
// 기존 테스트는 모두 내부 표준 경로(`/api/...`)로 직접 부르기 때문이다.
// 실제 사용자는 게이트웨이를 지나서 오므로, 그쪽 입구도 한 번은 두드려야 한다.
func TestGatewayPrefixRouting(t *testing.T) {
	deps := buildApp(t)
	app := server.New(*deps)

	// 1) 헬스체크 — 앱의 '서버 점검' 화면이 부르는 경로.
	if res, _ := doJSON(t, app, "GET", "/inner/api/v1/health", "", nil); res.StatusCode != 200 {
		t.Fatalf("게이트웨이 경로 헬스체크 status=%d", res.StatusCode)
	}

	// 2) 인증이 필요한 경로는 **404 가 아니라 401** 이어야 한다.
	//    404 는 '라우트가 없다'는 뜻이고, 앱은 그것을 미배포로 읽어 목업으로 떨어진다.
	if res, _ := doJSON(t, app, "GET", "/inner/api/v1/cards", "", nil); res.StatusCode != 401 {
		t.Fatalf("무인증 접근 status=%d (401 이어야 라우팅이 살아 있는 것)", res.StatusCode)
	}

	// 3) 로그인 → 보호된 자원까지 한 바퀴.
	res, body := doJSON(t, app, "POST", "/inner/api/v1/auth/login", "",
		map[string]string{"id": "demo", "password": "demo1234"})
	if res.StatusCode != 200 {
		t.Fatalf("게이트웨이 경로 로그인 status=%d body=%s", res.StatusCode, body)
	}
	var auth struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &auth); err != nil || auth.AccessToken == "" {
		t.Fatalf("access_token 없음: %s", body)
	}

	if res, b := doJSON(t, app, "GET", "/inner/api/v1/cards", auth.AccessToken, nil); res.StatusCode != 200 {
		t.Fatalf("게이트웨이 경로 카드 조회 status=%d body=%s", res.StatusCode, b)
	}
	// 쿼리스트링도 그대로 살아 있어야 한다(경로만 고쳐야 하고 URL 전체를 갈아치우면 안 된다).
	if res, b := doJSON(t, app, "GET", "/inner/api/v1/cards/today?difficulty=EASY", auth.AccessToken, nil); res.StatusCode != 200 {
		t.Fatalf("게이트웨이 경로 오늘의 학습 status=%d body=%s", res.StatusCode, b)
	}

	// 4) 접두사 뒤에 `/api` 가 한 번 더 붙어 와도(앱·관리 콘솔이 코드에 박아 둔 `/api/...`
	//    앞에 새 base URL 이 붙은 모양) 같은 곳으로 간다. 프런트를 고치지 않고
	//    배포 환경변수만으로 새 경로에 붙을 수 있어야 한다.
	if res, b := doJSON(t, app, "GET", "/inner/api/v1/api/cards", auth.AccessToken, nil); res.StatusCode != 200 {
		t.Fatalf("접두사+구형 경로 조합 status=%d body=%s", res.StatusCode, b)
	}
	if res, _ := doJSON(t, app, "GET", "/inner/api/v1/api/health", "", nil); res.StatusCode != 200 {
		t.Fatalf("접두사+구형 헬스체크 status=%d", res.StatusCode)
	}

	// 5) 구형 경로(`/api/...`)도 그대로 동작한다 — 이미 배포된 앱과 운영 스크립트가 쓴다.
	if res, _ := doJSON(t, app, "GET", "/api/cards", auth.AccessToken, nil); res.StatusCode != 200 {
		t.Fatalf("구형 경로 카드 조회 status=%d", res.StatusCode)
	}
	if res, _ := doJSON(t, app, "GET", "/health", "", nil); res.StatusCode != 200 {
		t.Fatalf("루트 헬스체크 status=%d", res.StatusCode)
	}

	// 6) 접두사는 경계까지 맞아야 한다 — 비슷하게 생긴 남의 경로를 삼키면 안 된다.
	if res, _ := doJSON(t, app, "GET", "/inner/api/v1x/cards", auth.AccessToken, nil); res.StatusCode != 404 {
		t.Fatalf("경계 밖 경로 status=%d (404 여야 한다)", res.StatusCode)
	}
	if res, _ := doJSON(t, app, "GET", "/inner/api/cards", auth.AccessToken, nil); res.StatusCode != 404 {
		t.Fatalf("짧은 접두사 status=%d (404 여야 한다)", res.StatusCode)
	}
}

// 접두사는 환경변수로 갈아 끼울 수 있어야 한다 — 게이트웨이 규칙이 또 바뀔 때
// 재빌드 없이 대응하기 위한 설계이므로, 그 통로가 실제로 이어져 있는지 본다.
func TestGatewayPrefixIsConfigurable(t *testing.T) {
	for _, prefix := range []string{"/inner/api/v2", "inner/api/v2/", " /inner/api/v2 "} {
		deps := buildApp(t)
		deps.Cfg.APIPrefix = prefix
		app := server.New(*deps)

		if res, _ := doJSON(t, app, "GET", "/inner/api/v2/health", "", nil); res.StatusCode != 200 {
			t.Fatalf("API_PREFIX=%q 헬스체크 status=%d", prefix, res.StatusCode)
		}
		// 설정을 바꿨으면 기본 접두사는 더 이상 열려 있지 않다(라우트가 두 벌로 늘지 않는다).
		if res, _ := doJSON(t, app, "GET", "/inner/api/v1/health", "", nil); res.StatusCode != 404 {
			t.Fatalf("API_PREFIX=%q 인데 기본 접두사가 열려 있다 status=%d", prefix, res.StatusCode)
		}
	}
}
