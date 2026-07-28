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
