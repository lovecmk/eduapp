package server_test

import (
	"encoding/json"
	"testing"

	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/server"
)

// 앱이 부르는 쓰기 경로가 실제로 서버에 있어야 한다.
//
// 고치기 전: 이 경로들은 앱과 계약서에만 있고 서버에는 없었다. 앱이 목업으로 도는
// 동안에는 드러나지 않지만, 실서버로 전환하면 출석·학습등급·신고·알림이 전부 404 로
// 실패한다. 404 는 재시도 대상이 아니라서 오프라인 큐에도 담기지 않고 그대로 사라진다.
func TestSyncEndpointsExist(t *testing.T) {
	deps := buildApp(t)
	app := server.New(*deps)
	tok := loginToken(t, app, "demo", "demo1234")
	cardID := firstCardID(t, app, tok)

	cases := []struct {
		method, path string
		body         any
		want         int
	}{
		{"GET", "/api/progress", nil, 200},
		{"POST", "/api/progress/grade", map[string]any{"card_id": cardID, "grade": "GOOD", "box": 1, "ease": 2.5}, 200},
		{"POST", "/api/progress/attendance", map[string]any{"day": "2026-7-27"}, 200},
		{"GET", "/api/engagement", nil, 200},
		{"POST", "/api/engagement/like", map[string]any{"card_id": cardID, "liked": true}, 200},
		{"POST", "/api/engagement/bookmark", map[string]any{"card_id": cardID, "bookmarked": true}, 200},
		{"POST", "/api/reports", map[string]any{"card_id": cardID, "reason": "오답"}, 201},
		{"GET", "/api/reports/mine", nil, 200},
		{"GET", "/api/notifications", nil, 200},
		{"POST", "/api/notifications/read-all", map[string]any{}, 200},
		{"POST", "/api/notifications/n1/read", map[string]any{}, 200},
	}
	for _, tc := range cases {
		res, body := doJSON(t, app, tc.method, tc.path, tok, tc.body)
		if res.StatusCode != tc.want {
			t.Errorf("%s %s -> %d, want %d: %s", tc.method, tc.path, res.StatusCode, tc.want, body)
		}
	}
}

// 보고한 학습 상태는 다시 읽었을 때 그대로 나와야 한다(왕복 일치).
func TestSyncRoundTrip(t *testing.T) {
	deps := buildApp(t)
	app := server.New(*deps)
	tok := loginToken(t, app, "demo", "demo1234")
	cardID := firstCardID(t, app, tok)

	doJSON(t, app, "POST", "/api/progress/grade", tok, map[string]any{
		"card_id": cardID, "grade": "GOOD", "box": 3, "ease": 2.6, "reps": 4, "lapses": 1,
		"due_at": "2026-08-01T00:00:00Z",
	})
	doJSON(t, app, "POST", "/api/progress/attendance", tok, map[string]any{"day": "2026-7-27"})

	_, body := doJSON(t, app, "GET", "/api/progress", tok, nil)
	var snap struct {
		Cards map[string]struct {
			Box   int     `json:"box"`
			Ease  float64 `json:"ease"`
			Reps  int     `json:"reps"`
			DueAt string  `json:"due_at"`
		} `json:"cards"`
		History    map[string][]string `json:"history"`
		Attendance map[string]string   `json:"attendance"`
	}
	if err := json.Unmarshal(body, &snap); err != nil {
		t.Fatalf("스냅샷 파싱: %v (%s)", err, body)
	}
	got, ok := snap.Cards[cardID]
	if !ok {
		t.Fatalf("보고한 카드가 스냅샷에 없다: %s", body)
	}
	if got.Box != 3 || got.Reps != 4 {
		t.Errorf("SRS 상태가 왕복에서 어긋났다: %+v", got)
	}
	if len(snap.Attendance) != 1 {
		t.Errorf("출석이 1건이어야 하는데 %d건이다", len(snap.Attendance))
	}
	// 채점하면 그날 학습 이력에도 남아야 한다 — 달력의 '학습한 날' 표시가 여기서 나온다.
	if len(snap.History) == 0 {
		t.Error("채점했는데 학습 이력이 비어 있다")
	}
}

// 같은 Idempotency-Key 로 두 번 보내도 한 번만 반영되어야 한다.
//
// 고치기 전: 앱은 계약대로 헤더를 실어 보냈지만 서버가 읽지 않았다.
// 오프라인 큐가 재전송하면 신고가 중복 접수되고 출석 시각이 뒤로 밀렸다.
func TestIdempotentReplay(t *testing.T) {
	deps := buildApp(t)
	app := server.New(*deps)
	tok := loginToken(t, app, "demo", "demo1234")
	cardID := firstCardID(t, app, tok)

	key := "report:" + cardID + ":오답"
	for i := 0; i < 3; i++ {
		res, body := doJSONWithHeaders(t, app, "POST", "/api/reports", tok,
			map[string]any{"card_id": cardID, "reason": "오답", "detail": "설명이 틀렸습니다"},
			map[string]string{"Idempotency-Key": key})
		if res.StatusCode != 201 {
			t.Fatalf("%d번째 신고: %d %s", i+1, res.StatusCode, body)
		}
	}

	_, body := doJSON(t, app, "GET", "/api/reports/mine", tok, nil)
	var mine struct {
		CardIDs []string `json:"card_ids"`
	}
	if err := json.Unmarshal(body, &mine); err != nil {
		t.Fatalf("내 신고 파싱: %v", err)
	}
	if len(mine.CardIDs) != 1 {
		t.Errorf("3번 재전송했는데 신고가 %d건 접수됐다 — 한 건이어야 한다", len(mine.CardIDs))
	}

	reports, err := deps.Data.ListReports(t.Context(), 100)
	if err != nil {
		t.Fatalf("신고 목록: %v", err)
	}
	if len(reports) != 1 {
		t.Errorf("저장소에 신고가 %d건 쌓였다 — 한 건이어야 한다", len(reports))
	}
}

// 남의 멱등 키를 그대로 보내도 남의 응답을 받아 보면 안 된다.
func TestIdempotencyIsPerUser(t *testing.T) {
	deps := buildApp(t)
	app := server.New(*deps)

	tokA := loginToken(t, app, "demo", "demo1234")
	res, _ := doJSON(t, app, "POST", "/api/auth/register", "", map[string]string{
		"username": "otheruser", "password": "pw12345678", "name": "다른사람",
	})
	if res.StatusCode != 200 {
		t.Fatalf("두 번째 계정 생성 실패: %d", res.StatusCode)
	}
	tokB := loginToken(t, app, "otheruser", "pw12345678")
	cardID := firstCardID(t, app, tokA)

	// 출석 키는 날짜뿐이라 사용자끼리 쉽게 겹친다 — 겹쳐도 서로 영향이 없어야 한다.
	key := "attendance:2026-7-27"
	doJSONWithHeaders(t, app, "POST", "/api/progress/attendance", tokA,
		map[string]any{"day": "2026-7-27"}, map[string]string{"Idempotency-Key": key})
	doJSONWithHeaders(t, app, "POST", "/api/progress/attendance", tokB,
		map[string]any{"day": "2026-7-27"}, map[string]string{"Idempotency-Key": key})

	_, body := doJSON(t, app, "GET", "/api/progress", tokB, nil)
	var snap struct {
		Attendance map[string]string `json:"attendance"`
	}
	_ = json.Unmarshal(body, &snap)
	if len(snap.Attendance) != 1 {
		t.Errorf("B 의 출석이 기록되지 않았다 — A 의 멱등 응답이 재생된 것으로 보인다: %s", body)
	}
	_ = cardID
	_ = deps
}

// 없는 카드에 대한 채점·반응·신고는 받아 두면 안 된다.
// 받아 두면 어떤 카드였는지 알 수 없는 기록이 남아 통계가 영원히 어긋난다.
func TestSyncRejectsUnknownCard(t *testing.T) {
	deps := buildApp(t)
	app := server.New(*deps)
	tok := loginToken(t, app, "demo", "demo1234")

	for _, tc := range []struct {
		path string
		body any
	}{
		{"/api/progress/grade", map[string]any{"card_id": "없는카드", "grade": "GOOD"}},
		{"/api/engagement/like", map[string]any{"card_id": "없는카드", "liked": true}},
		{"/api/reports", map[string]any{"card_id": "없는카드", "reason": "오답"}},
	} {
		res, body := doJSON(t, app, "POST", tc.path, tok, tc.body)
		if res.StatusCode != 404 {
			t.Errorf("%s 에 없는 카드 -> %d, want 404: %s", tc.path, res.StatusCode, body)
		}
	}
}

// 동기화 API 는 인증 없이는 열리지 않아야 한다.
func TestSyncRequiresAuth(t *testing.T) {
	deps := buildApp(t)
	app := server.New(*deps)

	for _, path := range []string{"/api/progress", "/api/engagement", "/api/notifications", "/api/reports/mine"} {
		if res, _ := doJSON(t, app, "GET", path, "", nil); res.StatusCode != 401 {
			t.Errorf("무인증 %s -> %d, want 401", path, res.StatusCode)
		}
	}
}

// firstCardID 는 목록에서 카드 하나의 id 를 꺼낸다.
func firstCardID(t *testing.T, app *fiber.App, tok string) string {
	t.Helper()
	_, body := doJSON(t, app, "GET", "/api/cards", tok, nil)
	var all []map[string]any
	if err := json.Unmarshal(body, &all); err != nil || len(all) == 0 {
		t.Fatalf("카드 목록: %v (%d장)", err, len(all))
	}
	return all[0]["id"].(string)
}
