package server_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
)

// 분석 API 의 통합 확인.
//
// 순수 함수 테스트(service/insight_test.go)는 계산이 맞는지 본다.
// 여기서 보는 것은 다른 것이다 — **실제로 저장된 데이터가 분석까지 흘러오는가.**
// 저장소 어댑터, 포트, 서비스, 핸들러 중 한 군데만 어긋나도 화면은 조용히 0 을 보여 준다.
// 그 침묵이 가장 위험하므로, 문제를 일부러 심어 두고 그것이 잡히는지 확인한다.

// insightBody 는 분석 응답 중 이 테스트가 확인할 부분만 담는다.
type insightBody struct {
	GeneratedAt string `json:"generated_at"`
	Coverage    struct {
		LearnersWithData int64  `json:"learners_with_data"`
		CardsWithData    int64  `json:"cards_with_data"`
		ActivityDays     int64  `json:"activity_days"`
		Verdict          string `json:"verdict"`
		Trustworthy      bool   `json:"trustworthy"`
	} `json:"coverage"`
	Headlines []struct {
		Severity string `json:"severity"`
		Title    string `json:"title"`
	} `json:"headlines"`
	Calibration []struct {
		CardID    string  `json:"card_id"`
		Verdict   string  `json:"verdict"`
		LapseRate float64 `json:"lapse_rate"`
		Suggested string  `json:"suggested"`
	} `json:"calibration"`
	Categories []struct {
		Category  string  `json:"category"`
		LapseRate float64 `json:"lapse_rate"`
	} `json:"categories"`
	Churn struct {
		Active  int64 `json:"active"`
		Dormant int64 `json:"dormant"`
		Top     []struct {
			UserID   string `json:"user_id"`
			DaysAway int    `json:"days_away"`
		} `json:"top"`
	} `json:"churn"`
	Funnel []struct {
		Stage string `json:"stage"`
		Count int64  `json:"count"`
	} `json:"funnel"`
	Activity    []map[string]any `json:"activity"`
	DeadContent []struct {
		CardID string `json:"card_id"`
	} `json:"dead_content"`
}

// dayKeyFor 는 앱과 같은 날짜 키(YYYY-M-D, month 0-based)를 만든다.
// 여기서 형식이 어긋나면 활동 집계가 통째로 비므로 테스트에서도 같은 규칙을 쓴다.
func dayKeyFor(t time.Time) string {
	return fmt.Sprintf("%d-%d-%d", t.Year(), int(t.Month())-1, t.Day())
}

func TestInsightRequiresAdmin(t *testing.T) {
	// 분석에는 전체 학습자의 활동과 소속이 들어 있다. 일반 사용자에게 열리면
	// 남의 학습 상태를 통째로 들여다볼 수 있다.
	env := buildAdminApp(t)
	for _, path := range []string{"/api/admin/insight", "/api/admin/insight/refresh"} {
		method := "GET"
		if path == "/api/admin/insight/refresh" {
			method = "POST"
		}
		res, _ := doJSON(t, env.app, method, path, env.memberToken, nil)
		if res.StatusCode != 403 {
			t.Errorf("%s %s: 일반 사용자는 403 이어야 한다, 실제 %d", method, path, res.StatusCode)
		}
		res, _ = doJSON(t, env.app, method, path, "", nil)
		if res.StatusCode != 401 {
			t.Errorf("%s %s: 비로그인은 401 이어야 한다, 실제 %d", method, path, res.StatusCode)
		}
	}
}

func TestInsightOnEmptyDataIsHonest(t *testing.T) {
	// 데이터가 없는데 그럴듯한 그래프를 그리면, 보는 사람은 그것을 사실로 믿는다.
	env := buildAdminApp(t)
	res, body := doJSON(t, env.app, "GET", "/api/admin/insight", env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("status=%d body=%s", res.StatusCode, body)
	}
	var got insightBody
	decode(t, body, &got)

	if got.Coverage.Trustworthy {
		t.Error("학습 데이터가 없는데 믿을 만하다고 하면 안 된다")
	}
	if got.Coverage.Verdict == "" {
		t.Error("왜 못 믿는지 문장으로 말해야 한다")
	}
	if len(got.Headlines) == 0 {
		t.Error("빈 상태에도 설명이 있어야 한다")
	}
	// 프런트가 null.map 으로 죽지 않도록 빈 배열이어야 한다.
	if got.Calibration == nil || got.Categories == nil || got.Activity == nil {
		t.Error("빈 배열이어야 하고 null 이면 안 된다")
	}
	if len(got.Activity) != 30 {
		t.Errorf("활동 추세는 30일치가 채워져야 한다: %d", len(got.Activity))
	}
}

// TestInsightSurfacesPlantedProblems 는 이 기능의 존재 이유를 확인한다.
//
// 저장소에 (1) 난이도가 잘못 매겨진 카드와 (2) 오래 사라진 학습자를 심어 두고,
// 분석이 둘 다 스스로 찾아내는지 본다. 배선이 한 군데라도 끊기면 여기서 걸린다.
func TestInsightSurfacesPlantedProblems(t *testing.T) {
	env := buildAdminApp(t)
	ctx := context.Background()

	cards, err := env.cards.AllCards(ctx)
	if err != nil || len(cards) < 2 {
		t.Fatalf("시드 카드가 필요하다: %v (%d장)", err, len(cards))
	}
	// EASY 로 선언된 카드를 골라, 실제로는 아주 어렵게 만든다.
	var target domain.Card
	for _, c := range cards {
		if c.DifficultyCd == domain.Easy {
			target = c
			break
		}
	}
	if target.ID == "" {
		t.Fatal("EASY 카드가 시드에 있어야 한다")
	}

	now := time.Now()

	// (1) 여러 사람이 이 카드에서 계속 실패한다 — 표본이 충분해야 판정이 나온다.
	for i := 0; i < 8; i++ {
		userID := fmt.Sprintf("learner%02d", i)
		reviewed := now
		err := env.data.SaveSrs(ctx, domain.SrsState{
			UserID: userID, CardID: target.ID,
			Box: 0, Ease: 1.6, DueAt: now, Reps: 10, Lapses: 8,
			LastGrade: "again", LastReviewedAt: &reviewed,
		}, dayKeyFor(now))
		if err != nil {
			t.Fatalf("SRS 저장: %v", err)
		}
	}

	// (2) 많이 쌓아 두고 오래 사라진 학습자.
	longAgo := now.AddDate(0, 0, -60)
	for i := 0; i < 30; i++ {
		err := env.data.SaveSrs(ctx, domain.SrsState{
			UserID: "ghost", CardID: fmt.Sprintf("%s-%d", target.ID, i),
			Box: 3, Ease: 2.5, DueAt: longAgo, Reps: 5, Lapses: 1,
			LastGrade: "good", LastReviewedAt: &longAgo,
		}, dayKeyFor(longAgo))
		if err != nil {
			t.Fatalf("SRS 저장: %v", err)
		}
	}

	// 캐시를 건너뛰기 위해 refresh 를 쓴다 — 없으면 방금 심은 데이터가 안 보인다.
	res, body := doJSON(t, env.app, "POST", "/api/admin/insight/refresh", env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("status=%d body=%s", res.StatusCode, body)
	}
	var got insightBody
	decode(t, body, &got)

	// 난이도 오표기가 잡혔는가.
	var found bool
	for _, c := range got.Calibration {
		if c.CardID != target.ID {
			continue
		}
		found = true
		if c.Verdict != "harder" {
			t.Errorf("선언보다 어렵다고 해야 한다: %+v", c)
		}
		if c.LapseRate < 0.7 {
			t.Errorf("실패율 80%% 가 그대로 와야 한다: %v", c.LapseRate)
		}
		if c.Suggested != "HARD" {
			t.Errorf("HARD 를 제안해야 한다: %q", c.Suggested)
		}
	}
	if !found {
		t.Errorf("심어 둔 난이도 오표기를 찾지 못했다: %+v", got.Calibration)
	}

	// 이탈이 잡혔는가.
	if got.Churn.Dormant < 1 {
		t.Errorf("60일 사라진 학습자를 휴면으로 잡아야 한다: %+v", got.Churn)
	}
	var ghostSeen bool
	for _, e := range got.Churn.Top {
		if e.UserID == "ghost" {
			ghostSeen = true
			if e.DaysAway < 55 {
				t.Errorf("경과일이 이상하다: %d", e.DaysAway)
			}
		}
	}
	if !ghostSeen {
		t.Errorf("되돌릴 가치가 큰 학습자가 명단에 있어야 한다: %+v", got.Churn.Top)
	}

	// 헤드라인이 사람 말로 말해 주는가.
	if len(got.Headlines) == 0 {
		t.Fatal("문제가 있는데 헤드라인이 비었다")
	}
	var hasCritical bool
	for _, h := range got.Headlines {
		if h.Severity == "critical" {
			hasCritical = true
		}
	}
	if !hasCritical {
		t.Errorf("이탈은 critical 로 올라와야 한다: %+v", got.Headlines)
	}

	// 활동 집계가 날짜 키를 제대로 읽었는가 —
	// month 가 0-based 라 여기서 어긋나면 모든 날이 조용히 0 이 된다.
	last := got.Activity[len(got.Activity)-1]
	if users, _ := last["users"].(float64); users < 1 {
		t.Errorf("오늘 활동이 집계되어야 한다(날짜 키 형식 확인): %+v", last)
	}
}

func TestInsightCachesBetweenCalls(t *testing.T) {
	// 관리 콘솔은 새로고침이 잦다. 매번 전체 스캔하면 대시보드를 여는 것만으로
	// 저장소에 부하가 몰린다.
	env := buildAdminApp(t)

	res, body := doJSON(t, env.app, "GET", "/api/admin/insight", env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("status=%d", res.StatusCode)
	}
	var first insightBody
	decode(t, body, &first)

	_, body2 := doJSON(t, env.app, "GET", "/api/admin/insight", env.adminToken, nil)
	var second insightBody
	decode(t, body2, &second)

	if first.GeneratedAt != second.GeneratedAt {
		t.Errorf("짧은 간격의 재요청은 캐시를 써야 한다: %q vs %q",
			first.GeneratedAt, second.GeneratedAt)
	}

	// refresh 는 캐시를 버려야 한다 — 고친 것이 반영됐는지 확인할 방법이 이것뿐이다.
	time.Sleep(1100 * time.Millisecond) // 생성 시각(초 단위)이 실제로 달라지도록
	_, body3 := doJSON(t, env.app, "POST", "/api/admin/insight/refresh", env.adminToken, nil)
	var third insightBody
	decode(t, body3, &third)
	if third.GeneratedAt == first.GeneratedAt {
		t.Error("refresh 는 다시 계산해야 한다")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 학습자 코칭 진단
// ─────────────────────────────────────────────────────────────────────────────

type learnerBody struct {
	UserID  string `json:"user_id"`
	Name    string `json:"name"`
	Summary struct {
		Cards         int64   `json:"cards"`
		LapseRate     float64 `json:"lapse_rate"`
		PeerLapseRate float64 `json:"peer_lapse_rate"`
		DaysAway      int     `json:"days_away"`
	} `json:"summary"`
	Verdict []struct {
		Severity string `json:"severity"`
		Title    string `json:"title"`
		Link     string `json:"link"`
	} `json:"verdict"`
	Weakness []struct {
		Category string  `json:"category"`
		Gap      float64 `json:"gap"`
		Verdict  string  `json:"verdict"`
	} `json:"weakness"`
	Missed []struct {
		CardID   string `json:"card_id"`
		Signal   string `json:"signal"`
		Question string `json:"question"`
		Answer   string `json:"answer"`
		Explain  string `json:"explain"`
		Lapses   int64  `json:"lapses"`
	} `json:"missed"`
	Rhythm []map[string]any `json:"rhythm"`
}

func TestLearnerDiagnosisRequiresAdmin(t *testing.T) {
	// 여기에는 특정 개인의 오답이 전부 들어 있다. 일반 사용자에게 열리면
	// 남의 학습 약점을 그대로 들여다볼 수 있다.
	env := buildAdminApp(t)
	path := "/api/admin/insight/learner/someone"

	res, _ := doJSON(t, env.app, "GET", path, env.memberToken, nil)
	if res.StatusCode != 403 {
		t.Errorf("일반 사용자는 403: %d", res.StatusCode)
	}
	res, _ = doJSON(t, env.app, "GET", path, "", nil)
	if res.StatusCode != 401 {
		t.Errorf("비로그인은 401: %d", res.StatusCode)
	}
}

// TestLearnerDiagnosisSeparatesPersonalFromShared 는 이 기능의 존재 이유를 확인한다.
//
// 한 사람에게 두 종류의 오답을 심는다.
//
//	· 남들은 잘 맞히는데 이 사람만 틀리는 문제  → 가르쳐야 한다
//	· 다들 틀리는 문제                          → 문제를 고쳐야 한다
//
// 이 둘을 구분하지 못하면 관리자는 어려운 순서대로 코칭하게 되고, 그건 헛수고다.
func TestLearnerDiagnosisSeparatesPersonalFromShared(t *testing.T) {
	env := buildAdminApp(t)
	ctx := context.Background()
	// adminID 는 로그인 아이디다. 진단은 내부 ID 로 조회하므로 목록에서 찾아 온다.
	target := internalIDOf(t, env, "admin")

	cards, err := env.cards.AllCards(ctx)
	if err != nil || len(cards) < 2 {
		t.Fatalf("시드 카드 필요: %v", err)
	}
	personalCard, sharedCard := cards[0], cards[1]
	now := time.Now()

	// 또래 20명: personalCard 는 잘 맞히고, sharedCard 는 다 같이 틀린다.
	for i := 0; i < 20; i++ {
		peer := fmt.Sprintf("peer%02d", i)
		reviewed := now
		if err := env.data.SaveSrs(ctx, domain.SrsState{
			UserID: peer, CardID: personalCard.ID, Box: 4, Ease: 2.6,
			DueAt: now, Reps: 10, Lapses: 0, LastGrade: "good", LastReviewedAt: &reviewed,
		}, dayKeyFor(now)); err != nil {
			t.Fatalf("또래 저장: %v", err)
		}
		if err := env.data.SaveSrs(ctx, domain.SrsState{
			UserID: peer, CardID: sharedCard.ID, Box: 0, Ease: 1.5,
			DueAt: now, Reps: 10, Lapses: 8, LastGrade: "again", LastReviewedAt: &reviewed,
		}, dayKeyFor(now)); err != nil {
			t.Fatalf("또래 저장: %v", err)
		}
	}

	// 진단 대상: 둘 다 심하게 틀린다. 하지만 원인은 서로 다르다.
	reviewed := now
	for _, id := range []string{personalCard.ID, sharedCard.ID} {
		if err := env.data.SaveSrs(ctx, domain.SrsState{
			UserID: target, CardID: id, Box: 0, Ease: 1.4,
			DueAt: now, Reps: 10, Lapses: 9, LastGrade: "again", LastReviewedAt: &reviewed,
		}, dayKeyFor(now)); err != nil {
			t.Fatalf("대상 저장: %v", err)
		}
	}

	res, body := doJSON(t, env.app, "GET",
		"/api/admin/insight/learner/"+target, env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("status=%d body=%s", res.StatusCode, body)
	}
	var got learnerBody
	decode(t, body, &got)

	signals := map[string]string{}
	for _, m := range got.Missed {
		signals[m.CardID] = m.Signal
	}
	if signals[personalCard.ID] != "personal" {
		t.Errorf("남들은 맞히는 문제는 개인 약점이어야 한다: %q", signals[personalCard.ID])
	}
	if signals[sharedCard.ID] != "shared" {
		t.Errorf("다들 틀리는 문제는 공통 난제여야 한다: %q", signals[sharedCard.ID])
	}

	// 개인 약점이 목록 맨 위에 와야 코칭 순서가 맞다.
	if len(got.Missed) == 0 || got.Missed[0].CardID != personalCard.ID {
		t.Errorf("개인 약점이 먼저 와야 한다: %+v", got.Missed)
	}

	// 가르칠 재료가 실려 왔는가 — 이게 없으면 관리자가 문제를 다시 찾아야 한다.
	if got.Missed[0].Question == "" || got.Missed[0].Answer == "" {
		t.Errorf("문제와 정답이 함께 와야 한다: %+v", got.Missed[0])
	}

	// 결론이 둘을 다르게 다루는가.
	var hasCritical, tellsToFixContent bool
	for _, v := range got.Verdict {
		if v.Severity == "critical" {
			hasCritical = true
		}
		if v.Link == "cards" {
			tellsToFixContent = true
		}
	}
	if !hasCritical {
		t.Errorf("개인 약점은 급한 일로 올려야 한다: %+v", got.Verdict)
	}
	if !tellsToFixContent {
		t.Errorf("공통 난제는 문제를 손보라고 안내해야 한다: %+v", got.Verdict)
	}

	// 또래 비교가 실제로 계산됐는가.
	if got.Summary.PeerLapseRate <= 0 {
		t.Errorf("또래 실패율이 있어야 비교가 의미 있다: %+v", got.Summary)
	}
	if got.Summary.LapseRate <= got.Summary.PeerLapseRate {
		t.Errorf("이 사람이 더 많이 틀렸어야 한다: %+v", got.Summary)
	}
	if len(got.Rhythm) != 30 {
		t.Errorf("학습 리듬은 30일치: %d", len(got.Rhythm))
	}
}

func TestLearnerDiagnosisForUntouchedAccount(t *testing.T) {
	// 가입만 하고 아무것도 안 한 계정에 없는 약점을 지어내면 안 된다.
	env := buildAdminApp(t)
	res, body := doJSON(t, env.app, "GET",
		"/api/admin/insight/learner/"+internalIDOf(t, env, "admin"), env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("status=%d body=%s", res.StatusCode, body)
	}
	var got learnerBody
	decode(t, body, &got)

	if got.Summary.Cards != 0 {
		t.Errorf("푼 문제가 없어야 한다: %d", got.Summary.Cards)
	}
	if len(got.Verdict) != 1 || got.Verdict[0].Severity != "info" {
		t.Errorf("첫 학습을 안내해야 한다: %+v", got.Verdict)
	}
	if got.Missed == nil || got.Weakness == nil {
		t.Error("빈 배열이어야 하고 null 이면 안 된다")
	}
}

func TestLearnerDiagnosisUnknownUserIs404(t *testing.T) {
	env := buildAdminApp(t)
	res, _ := doJSON(t, env.app, "GET",
		"/api/admin/insight/learner/nobody", env.adminToken, nil)
	if res.StatusCode != 404 {
		t.Errorf("없는 사용자는 404: %d", res.StatusCode)
	}
}

// internalIDOf 는 로그인 아이디로 내부 사용자 ID 를 찾는다.
// 로그인 응답은 액세스 토큰만 주고 내부 ID 는 관리 목록에만 있다.
func internalIDOf(t *testing.T, env *adminEnv, loginID string) string {
	t.Helper()
	res, body := doJSON(t, env.app, "GET",
		"/api/admin/users?search="+loginID, env.adminToken, nil)
	if res.StatusCode != 200 {
		t.Fatalf("사용자 조회 status=%d body=%s", res.StatusCode, body)
	}
	var page struct {
		Items []struct {
			ID      string `json:"id"`
			LoginID string `json:"login_id"`
		} `json:"items"`
	}
	decode(t, body, &page)
	for _, u := range page.Items {
		if u.LoginID == loginID {
			return u.ID
		}
	}
	t.Fatalf("%q 를 찾지 못했다: %s", loginID, body)
	return ""
}
