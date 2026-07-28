package service

import (
	"fmt"
	"testing"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// 분석은 틀려도 티가 안 난다 — 그래프는 언제나 그럴듯하게 그려진다.
// 그래서 여기서 표로 못 박는다. 특히 지키려는 것:
//   1. 표본이 모자라면 결론을 내지 않는다.
//   2. 날짜 키 형식(month 0-based)이 앱과 어긋나지 않는다.
//   3. 0 으로 나누지 않는다.

var testNow = time.Date(2026, 7, 28, 12, 0, 0, 0, time.Local)

func card(id, cat, difficulty string) domain.Card {
	return domain.Card{ID: id, CategoryCd: cat, TitleTxt: id, DifficultyCd: domain.Difficulty(difficulty)}
}

func stat(id string, learners, reps, lapses, mastered int64) ports.CardLearningStat {
	return ports.CardLearningStat{
		CardID: id, Learners: learners, Reps: reps, Lapses: lapses,
		Mastered: mastered, AvgEase: 2.5, AvgBox: 2,
	}
}

// day 는 앱과 같은 날짜 키(YYYY-M-D, month 0-based)를 만든다.
func day(t time.Time) string { return DayKey(t) }

func daysAgo(n int) string { return day(testNow.AddDate(0, 0, -n)) }

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 난이도 보정
// ─────────────────────────────────────────────────────────────────────────────

func TestCalibrationIgnoresSmallSamples(t *testing.T) {
	// 세 사람이 푼 카드의 실패율은 우연이다. 이걸로 난이도를 바꾸라고 하면 안 된다.
	cards := []domain.Card{card("c1", "ELEC", "EASY")}
	st := map[string]ports.CardLearningStat{"c1": stat("c1", 3, 10, 9, 0)}
	if got := buildCalibration(cards, st); len(got) != 0 {
		t.Fatalf("표본이 작으면 판정하지 않아야 한다: %+v", got)
	}
}

func TestCalibrationFlagsHarderThanDeclared(t *testing.T) {
	// EASY 로 선언했는데 실패율 60% — 초급자에게 이 문제가 먼저 나가고 있다는 뜻이다.
	cards := []domain.Card{card("c1", "ELEC", "EASY")}
	st := map[string]ports.CardLearningStat{"c1": stat("c1", 20, 100, 60, 1)}
	got := buildCalibration(cards, st)
	if len(got) != 1 {
		t.Fatalf("1건이어야 한다: %+v", got)
	}
	if got[0].Verdict != "harder" {
		t.Errorf("선언보다 어렵다고 해야 한다: %q", got[0].Verdict)
	}
	if got[0].Suggested != "HARD" {
		t.Errorf("실패율 60%%면 HARD 를 제안해야 한다: %q", got[0].Suggested)
	}
	if got[0].LapseRate != 0.6 {
		t.Errorf("실패율: %v", got[0].LapseRate)
	}
}

func TestCalibrationFlagsEasierThanDeclared(t *testing.T) {
	cards := []domain.Card{card("c1", "ELEC", "HARD")}
	st := map[string]ports.CardLearningStat{"c1": stat("c1", 20, 100, 2, 18)}
	got := buildCalibration(cards, st)
	if len(got) != 1 || got[0].Verdict != "easier" {
		t.Fatalf("선언보다 쉽다고 해야 한다: %+v", got)
	}
	if got[0].Suggested != "EASY" {
		t.Errorf("EASY 를 제안해야 한다: %q", got[0].Suggested)
	}
}

func TestCalibrationStaysQuietWhenWellCalibrated(t *testing.T) {
	// 맞게 매겨진 카드까지 목록에 올리면, 정작 고칠 것이 묻힌다.
	cards := []domain.Card{card("c1", "ELEC", "MEDIUM")}
	st := map[string]ports.CardLearningStat{"c1": stat("c1", 30, 100, 26, 10)}
	if got := buildCalibration(cards, st); len(got) != 0 {
		t.Fatalf("기준 안이면 조용해야 한다: %+v", got)
	}
}

func TestCalibrationSortsByWorstGapAndIsStable(t *testing.T) {
	cards := []domain.Card{
		card("c1", "ELEC", "EASY"),
		card("c2", "ELEC", "EASY"),
		card("c3", "ELEC", "EASY"),
	}
	st := map[string]ports.CardLearningStat{
		"c1": stat("c1", 10, 100, 35, 0), // gap 0.23
		"c2": stat("c2", 10, 100, 80, 0), // gap 0.68 ← 가장 심함
		"c3": stat("c3", 10, 100, 55, 0), // gap 0.43
	}
	first := buildCalibration(cards, st)
	if first[0].CardID != "c2" {
		t.Fatalf("가장 어긋난 것이 먼저: %q", first[0].CardID)
	}
	// 맵을 돌기 때문에 순서가 흔들릴 수 있다 — 같은 입력은 같은 답이어야 한다.
	for i := 0; i < 20; i++ {
		again := buildCalibration(cards, st)
		for j := range first {
			if again[j].CardID != first[j].CardID {
				t.Fatalf("호출마다 순서가 달라진다")
			}
		}
	}
}

func TestCalibrationSkipsUnknownDifficulty(t *testing.T) {
	// 알 수 없는 난이도 코드로 기대값을 추측하면 없는 문제를 만들어 낸다.
	cards := []domain.Card{card("c1", "ELEC", "IMPOSSIBLE")}
	st := map[string]ports.CardLearningStat{"c1": stat("c1", 50, 100, 90, 0)}
	if got := buildCalibration(cards, st); len(got) != 0 {
		t.Fatalf("모르는 난이도는 건너뛴다: %+v", got)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 분야
// ─────────────────────────────────────────────────────────────────────────────

func TestCategoriesComputeRatesAndRatio(t *testing.T) {
	cards := []domain.Card{
		card("c1", "ELEC", "EASY"), card("c2", "ELEC", "EASY"),
		card("c3", "FIRE", "EASY"),
	}
	st := map[string]ports.CardLearningStat{
		"c1": stat("c1", 10, 100, 40, 2),
		"c2": stat("c2", 10, 100, 40, 2),
		"c3": stat("c3", 10, 100, 10, 8),
	}
	reports := []domain.Report{{CardID: "c1"}, {CardID: "c1"}}

	got := buildCategories(cards, st, reports)
	if len(got) != 2 {
		t.Fatalf("분야 2개: %+v", got)
	}
	// 어려운 분야가 먼저.
	if got[0].Category != "ELEC" {
		t.Fatalf("실패율 높은 분야가 먼저: %q", got[0].Category)
	}
	if got[0].LapseRate != 0.4 {
		t.Errorf("ELEC 실패율 0.4: %v", got[0].LapseRate)
	}
	if got[0].Reports != 2 {
		t.Errorf("신고 2건이 분야에 붙어야 한다: %d", got[0].Reports)
	}
	// 전체 평균은 90/300 = 0.3. ELEC 은 0.4 → 1.333배
	if got[0].Ratio < 1.3 || got[0].Ratio > 1.34 {
		t.Errorf("평균 대비 배수: %v", got[0].Ratio)
	}
}

func TestCategoriesSurviveZeroActivity(t *testing.T) {
	// 아무도 학습하지 않은 상태에서 0 으로 나누면 NaN 이 JSON 에 실린다.
	got := buildCategories([]domain.Card{card("c1", "ELEC", "EASY")}, map[string]ports.CardLearningStat{}, nil)
	if len(got) != 1 || got[0].LapseRate != 0 || got[0].Ratio != 0 {
		t.Fatalf("0 으로 나누지 않아야 한다: %+v", got)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 이탈
// ─────────────────────────────────────────────────────────────────────────────

func TestChurnTiersByDaysAway(t *testing.T) {
	users := map[string]domain.User{
		"u1": {ID: "u1", Nickname: "활성"},
		"u2": {ID: "u2", Nickname: "식는중"},
		"u3": {ID: "u3", Nickname: "위험"},
		"u4": {ID: "u4", Nickname: "휴면"},
	}
	learners := []ports.LearnerStat{
		{UserID: "u1", Cards: 10, LastSeen: testNow.AddDate(0, 0, -1)},
		{UserID: "u2", Cards: 10, LastSeen: testNow.AddDate(0, 0, -10)},
		{UserID: "u3", Cards: 10, LastSeen: testNow.AddDate(0, 0, -25)},
		{UserID: "u4", Cards: 10, LastSeen: testNow.AddDate(0, 0, -90)},
	}
	got := buildChurn(testNow, learners, users, nil)
	if got.Active != 1 || got.Cooling != 1 || got.AtRisk != 1 || got.Dormant != 1 {
		t.Fatalf("등급 분포가 어긋난다: %+v", got)
	}
	// 활성 사용자는 명단에 올리지 않는다 — 할 일 목록이지 전체 목록이 아니다.
	for _, e := range got.Top {
		if e.Tier == "active" {
			t.Errorf("활성은 명단에 없어야 한다: %+v", e)
		}
	}
}

func TestChurnRanksByWorthNotJustRecency(t *testing.T) {
	// 300장 쌓고 8일 쉰 사람이, 2장 하고 60일 사라진 사람보다 먼저 와야 한다.
	// 되돌릴 가치가 훨씬 크기 때문이다.
	users := map[string]domain.User{
		"heavy": {ID: "heavy", Nickname: "많이함"},
		"light": {ID: "light", Nickname: "조금함"},
	}
	learners := []ports.LearnerStat{
		{UserID: "heavy", Cards: 300, LastSeen: testNow.AddDate(0, 0, -8)},
		{UserID: "light", Cards: 2, LastSeen: testNow.AddDate(0, 0, -60)},
	}
	got := buildChurn(testNow, learners, users, nil)
	if len(got.Top) != 2 || got.Top[0].UserID != "heavy" {
		t.Fatalf("아까운 사람이 먼저 와야 한다: %+v", got.Top)
	}
}

func TestChurnTreatsNeverReviewedAsDormant(t *testing.T) {
	// LastSeen 이 zero 일 때 0일 경과로 읽으면 이탈자가 활성으로 둔갑한다.
	users := map[string]domain.User{"u1": {ID: "u1"}}
	learners := []ports.LearnerStat{{UserID: "u1", Cards: 5}}
	got := buildChurn(testNow, learners, users, nil)
	if got.Dormant != 1 {
		t.Fatalf("기록 없음은 휴면이어야 한다: %+v", got)
	}
}

func TestChurnSkipsUsersWithNoCards(t *testing.T) {
	users := map[string]domain.User{"u1": {ID: "u1"}}
	learners := []ports.LearnerStat{{UserID: "u1", Cards: 0}}
	got := buildChurn(testNow, learners, users, nil)
	if got.Active+got.Cooling+got.AtRisk+got.Dormant != 0 {
		t.Fatalf("학습 이력이 없으면 이탈을 논할 수 없다: %+v", got)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 퍼널 · 습관
// ─────────────────────────────────────────────────────────────────────────────

func TestFunnelCountsEachStage(t *testing.T) {
	users := []domain.User{{ID: "u1"}, {ID: "u2"}, {ID: "u3"}, {ID: "u4"}}
	learners := []ports.LearnerStat{
		{UserID: "u1", Cards: 5}, {UserID: "u2", Cards: 5}, {UserID: "u3", Cards: 5},
	}
	days := map[string]map[string]struct{}{
		// u1: 최근 14일 중 8일 → 습관
		"u1": daySet(0, 1, 2, 3, 4, 5, 6, 7),
		// u2: 3일 → '3일 이상'까지만
		"u2": daySet(0, 1, 2),
		// u3: 1일 → '첫 학습'까지만
		"u3": daySet(0),
	}
	got := buildFunnel(testNow, users, learners, days)
	want := []int64{4, 3, 2, 1}
	for i, w := range want {
		if got[i].Count != w {
			t.Errorf("%s 단계: %d (기대 %d)", got[i].Stage, got[i].Count, w)
		}
	}
	if got[1].Drop != 1 {
		t.Errorf("가입했지만 시작 안 한 1명: %d", got[1].Drop)
	}
	if got[0].Rate != 1 {
		t.Errorf("첫 단계 통과율은 1: %v", got[0].Rate)
	}
}

func TestFunnelHandlesNoUsers(t *testing.T) {
	got := buildFunnel(testNow, nil, nil, nil)
	for _, s := range got {
		if s.Count != 0 {
			t.Errorf("%s: %d", s.Stage, s.Count)
		}
	}
}

func TestHabitNeedsRecentDaysNotJustMany(t *testing.T) {
	// 예전에 20일 열심히 하고 지금은 안 하는 사람을 '습관 있음'으로 세면
	// 퍼널이 실제보다 건강해 보인다.
	old := map[string]struct{}{}
	for i := 60; i < 90; i++ {
		old[daysAgo(i)] = struct{}{}
	}
	if isHabitual(testNow, old) {
		t.Fatal("오래전 활동은 지금의 습관이 아니다")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 리텐션
// ─────────────────────────────────────────────────────────────────────────────

func TestRetentionCountsOnlyElapsedWeeks(t *testing.T) {
	// 아직 오지 않은 주차를 0% 로 찍으면 멀쩡한 코호트가 이탈한 것처럼 보인다.
	// testNow(2026-07-28 화)의 주는 07-27 월요일에 시작한다.
	users := []domain.User{{ID: "u1", CreatedAt: testNow.AddDate(0, 0, -1)}}
	days := map[string]map[string]struct{}{"u1": daySet(0)}
	got := buildRetention(testNow, users, days)
	if len(got) != 1 {
		t.Fatalf("코호트 1개: %+v", got)
	}
	if len(got[0].Weekly) != 1 {
		t.Fatalf("이번 주에 가입했으면 0주차뿐이어야 한다: %d주차", len(got[0].Weekly))
	}
	if got[0].Weekly[0] != 1 {
		t.Errorf("가입 주에 학습했으면 0주차 잔존 100%%: %v", got[0].Weekly[0])
	}
}

func TestRetentionWeekZeroIsSignupWeekNotFirstActivity(t *testing.T) {
	// 코호트 0주차는 '가입한 주'다. 가입 주에 한 번도 안 하고 다음 주에 시작했다면
	// 0주차는 0% 가 맞다 — 그 사실이 바로 온보딩이 늦다는 신호다.
	// (첫 활동일을 0주차로 잡으면 모든 코호트가 100% 로 시작해 아무 정보가 없어진다)
	users := []domain.User{{ID: "u1", CreatedAt: testNow.AddDate(0, 0, -8)}}
	days := map[string]map[string]struct{}{"u1": daySet(0)}
	got := buildRetention(testNow, users, days)
	if got[0].Weekly[0] != 0 {
		t.Errorf("가입 주에 활동이 없으면 0주차는 0: %v", got[0].Weekly)
	}
	if got[0].Weekly[len(got[0].Weekly)-1] != 1 {
		t.Errorf("실제 활동한 주는 100%%: %v", got[0].Weekly)
	}
}

func TestRetentionSplitsCohortsBySignupWeek(t *testing.T) {
	users := []domain.User{
		{ID: "a", CreatedAt: testNow.AddDate(0, 0, -2)},
		{ID: "b", CreatedAt: testNow.AddDate(0, 0, -3)},
		{ID: "c", CreatedAt: testNow.AddDate(0, 0, -20)},
	}
	got := buildRetention(testNow, users, map[string]map[string]struct{}{})
	if len(got) != 2 {
		t.Fatalf("가입 주가 둘이면 코호트도 둘: %+v", got)
	}
	// 최근 코호트가 먼저.
	if got[0].Size != 2 {
		t.Errorf("최근 주에 2명: %+v", got[0])
	}
}

func TestRetentionIgnoresUsersWithoutSignupDate(t *testing.T) {
	got := buildRetention(testNow, []domain.User{{ID: "u1"}}, nil)
	if len(got) != 0 {
		t.Fatalf("가입일이 없으면 코호트를 만들 수 없다: %+v", got)
	}
}

func TestWeekStartIsMonday(t *testing.T) {
	// 2026-07-28 은 화요일 → 그 주 월요일은 07-27.
	got := weekStart(testNow)
	if got.Weekday() != time.Monday {
		t.Fatalf("월요일이어야 한다: %v", got.Weekday())
	}
	if got.Day() != 27 {
		t.Errorf("2026-07-27 이어야 한다: %v", got)
	}
	// 일요일은 '지난 주'에 속해야 한다(일요일 시작으로 밀리면 코호트가 한 칸 어긋난다).
	sunday := time.Date(2026, 8, 2, 12, 0, 0, 0, time.Local)
	if ws := weekStart(sunday); ws.Day() != 27 {
		t.Errorf("일요일은 직전 월요일 주다: %v", ws)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 활동 · 이상 탐지
// ─────────────────────────────────────────────────────────────────────────────

func TestActivityFillsQuietDaysWithZero(t *testing.T) {
	// 활동한 날만 이으면 쉰 날이 사라져 추세가 실제보다 좋아 보인다.
	userDays := []ports.UserDay{{UserID: "u1", DayKey: daysAgo(0)}}
	got := buildActivity(testNow, userDays)
	if len(got) != activityTrendDay {
		t.Fatalf("%d일치가 나와야 한다: %d", activityTrendDay, len(got))
	}
	if got[len(got)-1].Users != 1 {
		t.Errorf("오늘 1명: %+v", got[len(got)-1])
	}
	if got[0].Users != 0 {
		t.Errorf("활동 없는 날은 0: %+v", got[0])
	}
}

func TestActivityCountsDistinctUsers(t *testing.T) {
	// 한 사람이 하루에 5장을 풀어도 활성 사용자는 1명이다.
	userDays := []ports.UserDay{
		{UserID: "u1", DayKey: daysAgo(0)},
		{UserID: "u1", DayKey: daysAgo(0)},
		{UserID: "u2", DayKey: daysAgo(0)},
	}
	got := buildActivity(testNow, userDays)
	if last := got[len(got)-1]; last.Users != 2 {
		t.Fatalf("중복 제거해 2명: %d", last.Users)
	}
}

func TestAnomalyDetectsDropAndSpike(t *testing.T) {
	points := make([]ActivityPoint, 30)
	for i := range points {
		points[i] = ActivityPoint{Day: fmt.Sprintf("d%02d", i), Users: 100}
	}
	// 같은 기간에 급락과 급등이 함께 있는 상황 — 평균·표준편차를 쓰면
	// 400 이 편차를 부풀려 0 인 날(장애)을 평범하게 만들어 놓친다.
	points[10].Users = 0   // 급락
	points[20].Users = 400 // 급등
	got := findAnomalies(points)
	if len(got) < 2 {
		t.Fatalf("두 이상치를 모두 잡아야 한다: %+v", got)
	}
	seen := map[string]string{}
	for _, a := range got {
		seen[a.Day] = a.Direction
	}
	if seen["d10"] != "drop" || seen["d20"] != "spike" {
		t.Errorf("방향이 어긋난다: %+v", seen)
	}
}

func TestAnomalyStaysSilentOnFlatData(t *testing.T) {
	// 모든 날이 똑같으면 표준편차가 0 이다. 여기서 나누면 NaN/Inf 가 JSON 에 실린다.
	points := make([]ActivityPoint, 30)
	for i := range points {
		points[i] = ActivityPoint{Day: fmt.Sprintf("d%02d", i), Users: 7}
	}
	if got := findAnomalies(points); len(got) != 0 {
		t.Fatalf("변화가 없으면 이상도 없다: %+v", got)
	}
}

func TestAnomalyNeedsEnoughHistory(t *testing.T) {
	if got := findAnomalies([]ActivityPoint{{Day: "d0", Users: 1}}); len(got) != 0 {
		t.Fatalf("하루치로 이상을 논할 수 없다: %+v", got)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 신뢰도 · 헤드라인
// ─────────────────────────────────────────────────────────────────────────────

func TestCoverageRefusesToTrustTinySamples(t *testing.T) {
	in := InsightInput{
		Now:      testNow,
		Users:    []domain.User{{ID: "u1"}},
		Cards:    []domain.Card{card("c1", "ELEC", "EASY")},
		Learners: []ports.LearnerStat{{UserID: "u1", Cards: 1}},
		UserDays: []ports.UserDay{{UserID: "u1", DayKey: daysAgo(0)}},
	}
	got := buildCoverage(in, map[string]ports.CardLearningStat{})
	if got.Trustworthy {
		t.Fatal("학습자 1명·1일을 믿을 만하다고 하면 안 된다")
	}
	if got.Verdict == "" {
		t.Error("왜 못 믿는지 문장으로 말해야 한다")
	}
}

func TestCoverageSaysNothingWhenNoData(t *testing.T) {
	got := buildCoverage(InsightInput{Now: testNow}, map[string]ports.CardLearningStat{})
	if got.Trustworthy {
		t.Error("데이터가 없으면 신뢰할 수 없다")
	}
}

func TestHeadlinesLeadWithChurnWhenPresent(t *testing.T) {
	in := Insight{
		Coverage: Coverage{LearnersWithData: 100},
		Churn: ChurnBreakdown{
			AtRisk: 3,
			Top:    []ChurnEntry{{Name: "원진섭", Cards: 300, DaysAway: 25}},
		},
	}
	got := buildHeadlines(in)
	if len(got) == 0 || got[0].Severity != "critical" {
		t.Fatalf("이탈이 가장 급하다: %+v", got)
	}
	if got[0].Detail == "" {
		t.Error("구체적인 사례를 들어야 행동으로 이어진다")
	}
}

func TestHeadlinesSayNothingIsWrongWhenClean(t *testing.T) {
	// 억지로 문제를 만들어 내면 경고가 소음이 된다.
	got := buildHeadlines(Insight{Coverage: Coverage{LearnersWithData: 100}})
	if len(got) != 1 || got[0].Severity != "good" {
		t.Fatalf("깨끗하면 깨끗하다고 해야 한다: %+v", got)
	}
}

func TestHeadlinesExplainEmptyState(t *testing.T) {
	got := buildHeadlines(Insight{Coverage: Coverage{LearnersWithData: 0}})
	if len(got) != 1 || got[0].Severity != "info" {
		t.Fatalf("데이터가 없으면 그 사실을 말해야 한다: %+v", got)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 조직 · 도달하지 못한 콘텐츠 · 전체 조립
// ─────────────────────────────────────────────────────────────────────────────

func TestOrgsComputeAdoption(t *testing.T) {
	users := []domain.User{
		{ID: "a", OrgNm: "1공장"}, {ID: "b", OrgNm: "1공장"},
		{ID: "c", OrgNm: "1공장"}, {ID: "d", OrgNm: "2공장"},
	}
	learners := []ports.LearnerStat{
		{UserID: "a", Cards: 10, AvgBox: 4, LastSeen: testNow},
		{UserID: "b", Cards: 20, AvgBox: 2, LastSeen: testNow},
	}
	got := buildOrgs(testNow, users, learners, map[string]map[string]struct{}{}, nil, nil)
	if got[0].Org != "1공장" {
		t.Fatalf("인원 많은 조직이 먼저: %+v", got)
	}
	if got[0].Members != 3 || got[0].Started != 2 {
		t.Errorf("3명 중 2명 시작: %+v", got[0])
	}
	if got[0].AdoptionRate < 0.66 || got[0].AdoptionRate > 0.67 {
		t.Errorf("도입률 2/3: %v", got[0].AdoptionRate)
	}
	// 소속이 비어 있어도 집계에서 사라지면 안 된다.
	if got[1].Started != 0 || got[1].AdoptionRate != 0 {
		t.Errorf("시작 안 한 조직은 0: %+v", got[1])
	}
}

func TestOrgsGroupBlankOrgTogether(t *testing.T) {
	users := []domain.User{{ID: "a"}, {ID: "b", OrgNm: "   "}}
	got := buildOrgs(testNow, users, nil, nil, nil, nil)
	if len(got) != 1 || got[0].Members != 2 {
		t.Fatalf("소속 미입력은 한 묶음: %+v", got)
	}
}

func TestDeadContentListsOnlyUntouchedCards(t *testing.T) {
	cards := []domain.Card{card("c1", "ELEC", "EASY"), card("c2", "ELEC", "EASY")}
	st := map[string]ports.CardLearningStat{"c1": stat("c1", 3, 5, 1, 0)}
	got := buildDeadContent(cards, st)
	if len(got) != 1 || got[0].CardID != "c2" {
		t.Fatalf("아무도 안 본 카드만: %+v", got)
	}
}

func TestBuildInsightOnEmptyInputIsSafe(t *testing.T) {
	// 첫 배포 직후 상태다. 여기서 죽으면 관리자가 콘솔에 들어갈 수 없다.
	got := BuildInsight(InsightInput{Now: testNow})
	if got.GeneratedAt == "" {
		t.Error("생성 시각은 항상 있어야 한다")
	}
	if len(got.Headlines) == 0 {
		t.Error("빈 상태에도 설명이 있어야 한다")
	}
	// JSON 으로 나갈 슬라이스는 nil 이 아니어야 한다(프런트에서 null.map 으로 죽는다).
	if got.Calibration == nil || got.Categories == nil || got.Orgs == nil ||
		got.Funnel == nil || got.Retention == nil || got.Activity == nil ||
		got.Anomalies == nil || got.DeadContent == nil || got.Churn.Top == nil {
		t.Errorf("빈 배열이어야 하고 null 이면 안 된다: %+v", got)
	}
}

func TestBuildInsightEndToEnd(t *testing.T) {
	users := []domain.User{
		{ID: "u1", Nickname: "김", OrgNm: "1공장", CreatedAt: testNow.AddDate(0, 0, -30)},
		{ID: "u2", Nickname: "이", OrgNm: "1공장", CreatedAt: testNow.AddDate(0, 0, -30)},
	}
	cards := []domain.Card{card("c1", "ELEC", "EASY"), card("c2", "FIRE", "EASY")}
	in := InsightInput{
		Now:   testNow,
		Users: users,
		Cards: cards,
		CardStat: []ports.CardLearningStat{
			stat("c1", 10, 100, 70, 0), // EASY 인데 실패율 70%
		},
		Learners: []ports.LearnerStat{
			{UserID: "u1", Cards: 40, LastSeen: testNow.AddDate(0, 0, -30)},
			{UserID: "u2", Cards: 5, LastSeen: testNow},
		},
		UserDays: []ports.UserDay{{UserID: "u2", DayKey: daysAgo(0)}},
	}
	got := BuildInsight(in)

	if len(got.Calibration) != 1 || got.Calibration[0].Verdict != "harder" {
		t.Errorf("난이도 오표기를 잡아야 한다: %+v", got.Calibration)
	}
	if got.Churn.AtRisk != 1 {
		t.Errorf("30일 쉰 사람은 이탈 위험: %+v", got.Churn)
	}
	if len(got.DeadContent) != 1 || got.DeadContent[0].CardID != "c2" {
		t.Errorf("아무도 안 본 c2: %+v", got.DeadContent)
	}
	// 헤드라인은 이탈과 난이도 둘 다 말해야 한다.
	var kinds []string
	for _, h := range got.Headlines {
		kinds = append(kinds, h.Severity)
	}
	if len(kinds) < 2 {
		t.Errorf("문제가 여럿이면 여럿 말해야 한다: %+v", got.Headlines)
	}
}

// daySet 은 '오늘로부터 n일 전' 목록을 날짜 키 집합으로 만든다.
func daySet(offsets ...int) map[string]struct{} {
	m := map[string]struct{}{}
	for _, o := range offsets {
		m[daysAgo(o)] = struct{}{}
	}
	return m
}
