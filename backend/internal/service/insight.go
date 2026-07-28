package service

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// 분석 엔진 — 순수 계산만 모아 둔다.
//
// 저장소도 시계도 건드리지 않는다. 전부 인자로 받는다. 그래서 표로 검증할 수 있고,
// "어제는 맞았는데 오늘은 틀린" 종류의 버그가 생기지 않는다.
//
// ── 이 파일이 지키려는 원칙 ────────────────────────────────────────────────
// 숫자는 그냥 두면 아무 말도 하지 않는다. '실패율 32%'는 높은 것인가?
// 그래서 모든 지표에 **비교 대상**과 **표본 수**를 함께 담는다.
//  · 비교 대상이 없으면 판단할 수 없다 (전체 평균 대비 몇 배인가).
//  · 표본이 작으면 판단하면 안 된다 (3명이 푼 카드의 실패율은 우연이다).
// 근거가 모자라면 결론을 내리지 않고 '판단 보류'로 남긴다. 그것이 빈칸보다 정직하다.

// ─────────────────────────────────────────────────────────────────────────────
// 임계값 — 왜 이 값인지 한 줄씩 남긴다. 근거 없는 상수는 나중에 아무도 못 고친다.
// ─────────────────────────────────────────────────────────────────────────────

const (
	// minLearnersForCalibration 은 카드 난이도를 판정하기 위한 최소 학습자 수.
	// 이보다 적으면 실패율이 한두 사람의 컨디션에 좌우된다.
	minLearnersForCalibration = 5

	// calibrationTolerance 는 선언 난이도의 기대 실패율에서 이만큼 벗어나야
	// '잘못 매겨졌다'고 본다. 좁게 잡으면 거의 모든 카드가 경고로 뜬다.
	calibrationTolerance = 0.15

	// churnWarnDays / churnRiskDays 는 마지막 학습 이후 경과일 기준.
	// 간격반복의 가장 긴 상자가 35일이라, 그 안쪽은 '쉬는 중'일 수 있다.
	// 7일은 습관이 끊기기 시작하는 지점, 21일은 대부분 돌아오지 않는 지점이다.
	churnWarnDays = 7
	churnRiskDays = 21

	// habitWindowDays / habitActiveDays 는 '습관이 잡혔다'의 정의.
	// 최근 14일 중 7일 이상 학습했으면 주 3회 이상 꾸준한 것으로 본다.
	habitWindowDays  = 14
	habitActiveDays  = 7
	retentionWeeks   = 8
	activityTrendDay = 30

	// anomalyZScore 는 일별 활동이 평소에서 이만큼 벗어나면 이상으로 본다.
	// 2.0 은 정규분포 기준 약 5% — 매일 울리지 않으면서 큰 변화는 놓치지 않는다.
	anomalyZScore = 2.0
)

// 선언 난이도별 기대 실패율.
//
// 어디서 온 값인가: 간격반복 학습에서 '적당히 어려운' 상태는 실패율 15~30% 구간으로
// 알려져 있다(너무 쉬우면 배울 것이 없고, 너무 어려우면 포기한다).
// 그 구간을 세 난이도에 나눠 배치했다. 실제 데이터가 쌓이면 이 표부터 갱신해야 한다.
var expectedLapseRate = map[string]float64{
	"EASY":   0.12,
	"MEDIUM": 0.25,
	"HARD":   0.40,
}

// ─────────────────────────────────────────────────────────────────────────────
// 결과 타입
// ─────────────────────────────────────────────────────────────────────────────

// Insight 는 분석 화면이 필요로 하는 모든 것을 한 번에 담는다.
type Insight struct {
	GeneratedAt string            `json:"generated_at"`
	Coverage    Coverage          `json:"coverage"`
	Headlines   []Headline        `json:"headlines"`
	Calibration []CardCalibration `json:"calibration"`
	Categories  []CategoryInsight `json:"categories"`
	Orgs        []OrgInsight      `json:"orgs"`
	Churn       ChurnBreakdown    `json:"churn"`
	Funnel      []FunnelStage     `json:"funnel"`
	Retention   []RetentionCohort `json:"retention"`
	Activity    []ActivityPoint   `json:"activity"`
	Anomalies   []Anomaly         `json:"anomalies"`
	DeadContent []DeadCard        `json:"dead_content"`
}

// Coverage 는 "이 분석을 얼마나 믿어도 되는가"에 답한다.
//
// 분석 화면에서 가장 먼저 보여야 하는 값이다. 사용자가 10명인데 그래프가
// 그럴듯하게 그려지면, 보는 사람은 그것을 사실로 받아들인다.
type Coverage struct {
	Users            int64 `json:"users"`
	LearnersWithData int64 `json:"learners_with_data"`
	Cards            int64 `json:"cards"`
	CardsWithData    int64 `json:"cards_with_data"`
	ActivityDays     int64 `json:"activity_days"`
	// Verdict 는 표본이 결론을 낼 만한지에 대한 한 줄 판정.
	Verdict string `json:"verdict"`
	// Trustworthy 가 false 면 화면은 수치를 '참고용'으로 표시해야 한다.
	Trustworthy bool `json:"trustworthy"`
}

// Headline 은 "지금 무엇을 해야 하는가" 한 줄.
type Headline struct {
	Severity string `json:"severity"` // critical | warn | info | good
	Title    string `json:"title"`
	Detail   string `json:"detail"`
	// Metric 은 근거가 된 수치(화면에서 크게 보여 준다).
	Metric string `json:"metric"`
	// Link 는 관리 콘솔에서 파고들 곳(라우트 이름).
	Link string `json:"link,omitempty"`
}

// CardCalibration 은 카드 한 장의 '선언 난이도 vs 실제'.
type CardCalibration struct {
	CardID    string  `json:"card_id"`
	Title     string  `json:"title"`
	Category  string  `json:"category"`
	Declared  string  `json:"declared"`
	Learners  int64   `json:"learners"`
	Reps      int64   `json:"reps"`
	LapseRate float64 `json:"lapse_rate"`
	Expected  float64 `json:"expected"`
	// Gap 은 실제 − 기대. 양수면 선언보다 어렵다.
	Gap float64 `json:"gap"`
	// Verdict: harder | easier | ok
	Verdict string `json:"verdict"`
	// Suggested 는 실제 실패율에 맞는 난이도(바꿔 달 것을 제안).
	Suggested string `json:"suggested"`
}

// CategoryInsight 는 분야별 학습 성과.
type CategoryInsight struct {
	Category    string  `json:"category"`
	Cards       int64   `json:"cards"`
	Learners    int64   `json:"learners"`
	Reps        int64   `json:"reps"`
	LapseRate   float64 `json:"lapse_rate"`
	MasteryRate float64 `json:"mastery_rate"`
	Reports     int64   `json:"reports"`
	// Ratio 는 전체 평균 실패율 대비 배수 — 1.0 이면 평균과 같다.
	Ratio float64 `json:"ratio"`
}

// OrgInsight 는 조직별 도입·성과.
type OrgInsight struct {
	Org          string  `json:"org"`
	Members      int64   `json:"members"`
	Started      int64   `json:"started"`
	Habitual     int64   `json:"habitual"`
	AtRisk       int64   `json:"at_risk"`
	AvgCards     float64 `json:"avg_cards"`
	MasteryRate  float64 `json:"mastery_rate"`
	AdoptionRate float64 `json:"adoption_rate"`
}

// ChurnBreakdown 은 이탈 위험 분포와 명단.
type ChurnBreakdown struct {
	Active  int64        `json:"active"`
	Cooling int64        `json:"cooling"`
	AtRisk  int64        `json:"at_risk"`
	Dormant int64        `json:"dormant"`
	Top     []ChurnEntry `json:"top"`
}

// ChurnEntry 는 되돌릴 가치가 큰 학습자 한 명.
//
// '위험한 사람'이 아니라 '아까운 사람' 순으로 정렬한다. 한 장 하고 만 사람보다
// 300장을 쌓다 멈춘 사람을 되돌리는 편이 훨씬 값어치 있다.
type ChurnEntry struct {
	UserID   string `json:"user_id"`
	Name     string `json:"name"`
	Org      string `json:"org"`
	Cards    int64  `json:"cards"`
	DaysAway int    `json:"days_away"`
	Tier     string `json:"tier"`
	// Worth 는 되돌릴 가치 점수(쌓아 둔 학습량 × 최근성).
	Worth float64 `json:"worth"`
}

// FunnelStage 는 가입에서 습관까지의 한 단계.
type FunnelStage struct {
	Stage string  `json:"stage"`
	Count int64   `json:"count"`
	Rate  float64 `json:"rate"` // 직전 단계 대비 통과율
	Drop  int64   `json:"drop"` // 여기서 이탈한 수
}

// RetentionCohort 는 가입 주차별 잔존.
type RetentionCohort struct {
	Cohort string    `json:"cohort"` // 가입 주 시작일 YYYY-MM-DD
	Size   int64     `json:"size"`
	Weekly []float64 `json:"weekly"` // 0주차부터 잔존율(%)
}

// ActivityPoint 는 하루치 활동.
type ActivityPoint struct {
	Day     string `json:"day"`
	Users   int64  `json:"users"`
	Weekday int    `json:"weekday"`
}

// Anomaly 는 평소와 다른 날.
type Anomaly struct {
	Day       string  `json:"day"`
	Users     int64   `json:"users"`
	Expected  float64 `json:"expected"`
	Deviation float64 `json:"deviation"` // z-score
	Direction string  `json:"direction"` // spike | drop
}

// DeadCard 는 아무도 만나지 못한 카드.
//
// 콘텐츠가 낭비되고 있다는 뜻이다. 만들어 두고 도달하지 않으면 없는 것과 같다.
type DeadCard struct {
	CardID   string `json:"card_id"`
	Title    string `json:"title"`
	Category string `json:"category"`
	Learners int64  `json:"learners"`
}

// ─────────────────────────────────────────────────────────────────────────────
// 입력
// ─────────────────────────────────────────────────────────────────────────────

// InsightInput 은 분석에 필요한 원재료 전부.
// 서비스가 저장소에서 모아 채우고, 아래 순수 함수들이 이것만 보고 계산한다.
type InsightInput struct {
	Now      time.Time
	Users    []domain.User
	Cards    []domain.Card
	Reports  []domain.Report
	CardStat []ports.CardLearningStat
	Learners []ports.LearnerStat
	UserDays []ports.UserDay
}

// BuildInsight 는 전체 분석을 만든다.
func BuildInsight(in InsightInput) Insight {
	byUser := indexUsers(in.Users)
	daysByUser := groupDays(in.UserDays)
	cardByID := indexCards(in.Cards)
	statByCard := indexCardStats(in.CardStat)

	calib := buildCalibration(in.Cards, statByCard)
	cats := buildCategories(in.Cards, statByCard, in.Reports)
	churn := buildChurn(in.Now, in.Learners, byUser, daysByUser)
	activity := buildActivity(in.Now, in.UserDays)

	out := Insight{
		GeneratedAt: in.Now.UTC().Format(time.RFC3339),
		Coverage:    buildCoverage(in, statByCard),
		Calibration: calib,
		Categories:  cats,
		Orgs:        buildOrgs(in.Now, in.Users, in.Learners, daysByUser, statByCard, cardByID),
		Churn:       churn,
		Funnel:      buildFunnel(in.Now, in.Users, in.Learners, daysByUser),
		Retention:   buildRetention(in.Now, in.Users, daysByUser),
		Activity:    activity,
		Anomalies:   findAnomalies(activity),
		DeadContent: buildDeadContent(in.Cards, statByCard),
	}
	out.Headlines = buildHeadlines(out)
	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 표본 신뢰도
// ─────────────────────────────────────────────────────────────────────────────

func buildCoverage(in InsightInput, statByCard map[string]ports.CardLearningStat) Coverage {
	days := map[string]struct{}{}
	for _, d := range in.UserDays {
		days[d.DayKey] = struct{}{}
	}
	c := Coverage{
		Users:            int64(len(in.Users)),
		LearnersWithData: int64(len(in.Learners)),
		Cards:            int64(len(in.Cards)),
		CardsWithData:    int64(len(statByCard)),
		ActivityDays:     int64(len(days)),
	}

	// 판정 기준: 사람이 너무 적거나 기간이 너무 짧으면 어떤 그래프도 우연이다.
	switch {
	case c.LearnersWithData == 0:
		c.Verdict = "학습 데이터가 아직 없습니다. 아래 수치는 모두 0 입니다."
	case c.LearnersWithData < 10 || c.ActivityDays < 7:
		c.Verdict = fmt.Sprintf("표본이 작습니다(학습자 %d명 · %d일). 추세로 읽지 말고 개별 사례로 보세요.",
			c.LearnersWithData, c.ActivityDays)
	case c.LearnersWithData < 50 || c.ActivityDays < 28:
		c.Verdict = fmt.Sprintf("참고 수준입니다(학습자 %d명 · %d일). 방향은 읽을 수 있지만 정밀한 비교는 이릅니다.",
			c.LearnersWithData, c.ActivityDays)
		c.Trustworthy = true
	default:
		c.Verdict = fmt.Sprintf("표본이 충분합니다(학습자 %d명 · %d일).", c.LearnersWithData, c.ActivityDays)
		c.Trustworthy = true
	}
	return c
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 난이도 보정 — 선언한 난이도가 실제와 맞는가
// ─────────────────────────────────────────────────────────────────────────────

func buildCalibration(cards []domain.Card, stat map[string]ports.CardLearningStat) []CardCalibration {
	out := []CardCalibration{}
	for _, c := range cards {
		s, ok := stat[c.ID]
		// 표본이 모자라면 판정하지 않는다 — 세 사람이 푼 카드의 실패율은 우연이다.
		if !ok || s.Learners < minLearnersForCalibration || s.Reps == 0 {
			continue
		}
		declared := strings.ToUpper(string(c.DifficultyCd))
		expected, known := expectedLapseRate[declared]
		if !known {
			continue
		}
		rate := float64(s.Lapses) / float64(s.Reps)
		gap := rate - expected

		verdict := "ok"
		if gap > calibrationTolerance {
			verdict = "harder"
		} else if gap < -calibrationTolerance {
			verdict = "easier"
		}
		if verdict == "ok" {
			continue
		}
		out = append(out, CardCalibration{
			CardID: c.ID, Title: firstNonEmpty(c.TitleTxt, c.QuestionTxt),
			Category: c.CategoryCd, Declared: declared,
			Learners: s.Learners, Reps: s.Reps,
			LapseRate: round3(rate), Expected: expected, Gap: round3(gap),
			Verdict: verdict, Suggested: suggestDifficulty(rate),
		})
	}
	// 어긋남이 큰 것부터 — 고칠 값어치 순서다.
	sort.Slice(out, func(i, j int) bool {
		if math.Abs(out[i].Gap) != math.Abs(out[j].Gap) {
			return math.Abs(out[i].Gap) > math.Abs(out[j].Gap)
		}
		return out[i].CardID < out[j].CardID
	})
	return out
}

// suggestDifficulty 는 실제 실패율에 가장 가까운 난이도를 고른다.
func suggestDifficulty(rate float64) string {
	best, bestDist := "", math.MaxFloat64
	// 맵 순회는 무작위라 후보를 고정 순서로 돈다(같은 입력이 같은 답을 내야 한다).
	for _, level := range []string{"EASY", "MEDIUM", "HARD"} {
		if d := math.Abs(rate - expectedLapseRate[level]); d < bestDist {
			best, bestDist = level, d
		}
	}
	return best
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 분야별 지식 격차
// ─────────────────────────────────────────────────────────────────────────────

func buildCategories(cards []domain.Card, stat map[string]ports.CardLearningStat, reports []domain.Report) []CategoryInsight {
	catOfCard := map[string]string{}
	agg := map[string]*CategoryInsight{}
	for _, c := range cards {
		cat := c.CategoryCd
		if cat == "" {
			cat = "(미분류)"
		}
		catOfCard[c.ID] = cat
		a := agg[cat]
		if a == nil {
			a = &CategoryInsight{Category: cat}
			agg[cat] = a
		}
		a.Cards++
		if s, ok := stat[c.ID]; ok {
			a.Learners += s.Learners
			a.Reps += s.Reps
			// 누적용으로 잠시 빌려 쓴다(아래에서 비율로 바꾼다).
			a.LapseRate += float64(s.Lapses)
			a.MasteryRate += float64(s.Mastered)
		}
	}
	for _, r := range reports {
		if cat, ok := catOfCard[r.CardID]; ok {
			agg[cat].Reports++
		}
	}

	var totalLapses, totalReps float64
	for _, a := range agg {
		totalLapses += a.LapseRate
		totalReps += float64(a.Reps)
	}
	avgRate := 0.0
	if totalReps > 0 {
		avgRate = totalLapses / totalReps
	}

	out := make([]CategoryInsight, 0, len(agg))
	for _, a := range agg {
		lapses, mastered := a.LapseRate, a.MasteryRate
		a.LapseRate, a.MasteryRate = 0, 0
		if a.Reps > 0 {
			a.LapseRate = round3(lapses / float64(a.Reps))
		}
		if a.Learners > 0 {
			a.MasteryRate = round3(mastered / float64(a.Learners))
		}
		if avgRate > 0 {
			a.Ratio = round3(a.LapseRate / avgRate)
		}
		out = append(out, *a)
	}
	// 어려운 분야가 먼저 보여야 한다.
	sort.Slice(out, func(i, j int) bool {
		if out[i].LapseRate != out[j].LapseRate {
			return out[i].LapseRate > out[j].LapseRate
		}
		return out[i].Category < out[j].Category
	})
	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 조직별 도입·성과
// ─────────────────────────────────────────────────────────────────────────────

func buildOrgs(
	now time.Time,
	users []domain.User,
	learners []ports.LearnerStat,
	daysByUser map[string]map[string]struct{},
	statByCard map[string]ports.CardLearningStat,
	cardByID map[string]domain.Card,
) []OrgInsight {
	_ = statByCard
	_ = cardByID
	learnerByID := map[string]ports.LearnerStat{}
	for _, l := range learners {
		learnerByID[l.UserID] = l
	}

	agg := map[string]*OrgInsight{}
	cardSum := map[string]float64{}
	boxSum := map[string]float64{}
	boxN := map[string]float64{}

	for _, u := range users {
		org := strings.TrimSpace(u.OrgNm)
		if org == "" {
			org = "(소속 미입력)"
		}
		a := agg[org]
		if a == nil {
			a = &OrgInsight{Org: org}
			agg[org] = a
		}
		a.Members++

		l, started := learnerByID[u.ID]
		if !started || l.Cards == 0 {
			continue
		}
		a.Started++
		cardSum[org] += float64(l.Cards)
		boxSum[org] += l.AvgBox * float64(l.Cards)
		boxN[org] += float64(l.Cards)

		if isHabitual(now, daysByUser[u.ID]) {
			a.Habitual++
		}
		if daysAway(now, l.LastSeen) >= churnWarnDays {
			a.AtRisk++
		}
	}

	out := make([]OrgInsight, 0, len(agg))
	for org, a := range agg {
		if a.Started > 0 {
			a.AvgCards = round1(cardSum[org] / float64(a.Started))
		}
		if boxN[org] > 0 {
			// 평균 상자를 최대 상자(5)로 나눠 0~1 숙달률로 읽는다.
			a.MasteryRate = round3(boxSum[org] / boxN[org] / 5.0)
		}
		if a.Members > 0 {
			a.AdoptionRate = round3(float64(a.Started) / float64(a.Members))
		}
		out = append(out, *a)
	}
	// 인원이 많은 조직부터 — 영향 범위 순.
	sort.Slice(out, func(i, j int) bool {
		if out[i].Members != out[j].Members {
			return out[i].Members > out[j].Members
		}
		return out[i].Org < out[j].Org
	})
	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. 이탈 위험
// ─────────────────────────────────────────────────────────────────────────────

func buildChurn(
	now time.Time,
	learners []ports.LearnerStat,
	byUser map[string]domain.User,
	daysByUser map[string]map[string]struct{},
) ChurnBreakdown {
	_ = daysByUser
	out := ChurnBreakdown{Top: []ChurnEntry{}}
	for _, l := range learners {
		if l.Cards == 0 {
			continue
		}
		away := daysAway(now, l.LastSeen)
		tier := "active"
		switch {
		case away >= churnRiskDays*2:
			tier = "dormant"
			out.Dormant++
		case away >= churnRiskDays:
			tier = "at_risk"
			out.AtRisk++
		case away >= churnWarnDays:
			tier = "cooling"
			out.Cooling++
		default:
			out.Active++
		}
		if tier == "active" {
			continue
		}

		u := byUser[l.UserID]
		// 되돌릴 가치 = 쌓아 둔 학습량 ÷ 멀어진 정도.
		// 오래 멀어질수록 돌아올 확률이 낮으므로 나눈다. 300장 쌓고 8일 쉰 사람이
		// 2장 하고 60일 사라진 사람보다 위에 와야 한다.
		worth := float64(l.Cards) / math.Sqrt(float64(away))
		out.Top = append(out.Top, ChurnEntry{
			UserID: l.UserID,
			Name:   firstNonEmpty(u.Nickname, u.UserNm, u.LoginID),
			Org:    u.OrgNm,
			Cards:  l.Cards, DaysAway: away, Tier: tier, Worth: round1(worth),
		})
	}
	sort.Slice(out.Top, func(i, j int) bool {
		if out.Top[i].Worth != out.Top[j].Worth {
			return out.Top[i].Worth > out.Top[j].Worth
		}
		return out.Top[i].UserID < out.Top[j].UserID
	})
	if len(out.Top) > 20 {
		out.Top = out.Top[:20]
	}
	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. 가입 → 습관 퍼널
// ─────────────────────────────────────────────────────────────────────────────

func buildFunnel(
	now time.Time,
	users []domain.User,
	learners []ports.LearnerStat,
	daysByUser map[string]map[string]struct{},
) []FunnelStage {
	learnerByID := map[string]ports.LearnerStat{}
	for _, l := range learners {
		learnerByID[l.UserID] = l
	}

	var signed, started, stuck, habitual int64
	for _, u := range users {
		signed++
		days := daysByUser[u.ID]
		if l, ok := learnerByID[u.ID]; !ok || l.Cards == 0 {
			continue
		}
		started++
		if len(days) >= 3 {
			stuck++
		}
		if isHabitual(now, days) {
			habitual++
		}
	}

	stages := []FunnelStage{
		{Stage: "가입", Count: signed},
		{Stage: "첫 학습", Count: started},
		{Stage: "3일 이상", Count: stuck},
		{Stage: fmt.Sprintf("습관(%d일 중 %d일)", habitWindowDays, habitActiveDays), Count: habitual},
	}
	for i := range stages {
		if i == 0 {
			stages[i].Rate = 1
			continue
		}
		prev := stages[i-1].Count
		if prev > 0 {
			stages[i].Rate = round3(float64(stages[i].Count) / float64(prev))
		}
		stages[i].Drop = prev - stages[i].Count
	}
	return stages
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. 코호트 리텐션
// ─────────────────────────────────────────────────────────────────────────────

func buildRetention(now time.Time, users []domain.User, daysByUser map[string]map[string]struct{}) []RetentionCohort {
	type cohort struct {
		start   time.Time
		members []string
	}
	byWeek := map[string]*cohort{}

	for _, u := range users {
		if u.CreatedAt.IsZero() {
			continue
		}
		start := weekStart(u.CreatedAt)
		key := start.Format("2006-01-02")
		c := byWeek[key]
		if c == nil {
			c = &cohort{start: start}
			byWeek[key] = c
		}
		c.members = append(c.members, u.ID)
	}

	out := []RetentionCohort{}
	for key, c := range byWeek {
		// 아직 오지 않은 주차는 계산하지 않는다 — 0% 로 찍으면 '이탈'로 오해된다.
		elapsed := int(now.Sub(c.start).Hours()/(24*7)) + 1
		weeks := elapsed
		if weeks > retentionWeeks {
			weeks = retentionWeeks
		}
		if weeks < 1 {
			weeks = 1
		}

		weekly := make([]float64, weeks)
		for w := 0; w < weeks; w++ {
			lo := c.start.AddDate(0, 0, w*7)
			hi := lo.AddDate(0, 0, 7)
			var active int64
			for _, id := range c.members {
				if anyDayInRange(daysByUser[id], lo, hi) {
					active++
				}
			}
			weekly[w] = round3(float64(active) / float64(len(c.members)))
		}
		out = append(out, RetentionCohort{Cohort: key, Size: int64(len(c.members)), Weekly: weekly})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Cohort > out[j].Cohort })
	if len(out) > retentionWeeks {
		out = out[:retentionWeeks]
	}
	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. 활동 추세 + 이상 탐지
// ─────────────────────────────────────────────────────────────────────────────

func buildActivity(now time.Time, userDays []ports.UserDay) []ActivityPoint {
	users := map[string]map[string]struct{}{}
	for _, d := range userDays {
		if users[d.DayKey] == nil {
			users[d.DayKey] = map[string]struct{}{}
		}
		users[d.DayKey][d.UserID] = struct{}{}
	}

	out := []ActivityPoint{}
	// 빈 날도 0 으로 채운다 — 활동한 날만 이으면 '쉰 날'이 사라져 추세가 부풀려진다.
	for i := activityTrendDay - 1; i >= 0; i-- {
		day := now.AddDate(0, 0, -i)
		key := DayKey(day)
		out = append(out, ActivityPoint{
			Day:     day.Format("2006-01-02"),
			Users:   int64(len(users[key])),
			Weekday: int(day.Weekday()),
		})
	}
	return out
}

// findAnomalies 는 평소와 크게 다른 날을 찾는다.
//
// 평균·표준편차를 쓰지 않는다. 이상치 하나가 그 둘을 통째로 끌고 가기 때문이다.
// 실제로 겪은 예: 접속자가 100명이던 기간에 하루 0명(장애)과 하루 400명(공지 발송)이
// 함께 있으면, 400 이 표준편차를 부풀려 **0명인 날이 평범해 보인다.**
// 장애를 놓치는 이상 탐지기는 있으나 마나다.
//
// 그래서 중앙값과 MAD(중앙값 절대편차)를 쓴다. 둘 다 절반이 오염되기 전까지
// 흔들리지 않아서, 급등과 급락이 같은 기간에 있어도 서로를 가리지 않는다.
// 0.6745 는 정규분포에서 MAD 를 표준편차와 같은 눈금으로 맞추는 상수다
// (이 값을 곱해야 기존 z-score 기준을 그대로 쓸 수 있다).
func findAnomalies(points []ActivityPoint) []Anomaly {
	out := []Anomaly{}
	if len(points) < 7 {
		return out
	}
	vals := make([]float64, len(points))
	for i, p := range points {
		vals[i] = float64(p.Users)
	}

	med := median(vals)
	dev := make([]float64, len(vals))
	for i, v := range vals {
		dev[i] = math.Abs(v - med)
	}
	scale := median(dev) / 0.6745

	// MAD 가 0 이면 절반 이상의 날이 완전히 같다는 뜻이다. 그래도 나머지 날이
	// 다를 수 있으므로 평균절대편차로 한 번 더 시도한다(1.2533 이 같은 눈금 상수).
	if scale == 0 {
		var sum float64
		for _, d := range dev {
			sum += d
		}
		scale = (sum / float64(len(dev))) * 1.2533
	}
	// 그래도 0 이면 모든 날이 똑같다 — 이상도 없다(0 으로 나누지 않는다).
	if scale == 0 {
		return out
	}

	for i, p := range points {
		z := (vals[i] - med) / scale
		if math.Abs(z) < anomalyZScore {
			continue
		}
		dir := "spike"
		if z < 0 {
			dir = "drop"
		}
		out = append(out, Anomaly{
			Day: p.Day, Users: p.Users,
			Expected: round1(med), Deviation: round1(z), Direction: dir,
		})
	}
	return out
}

// median 은 값의 중앙값. 입력 슬라이스를 건드리지 않는다
// (호출자가 같은 슬라이스를 다시 쓰는데 순서가 바뀌면 조용히 틀린다).
func median(in []float64) float64 {
	if len(in) == 0 {
		return 0
	}
	v := append([]float64(nil), in...)
	sort.Float64s(v)
	n := len(v)
	if n%2 == 1 {
		return v[n/2]
	}
	return (v[n/2-1] + v[n/2]) / 2
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. 도달하지 못한 콘텐츠
// ─────────────────────────────────────────────────────────────────────────────

func buildDeadContent(cards []domain.Card, stat map[string]ports.CardLearningStat) []DeadCard {
	out := []DeadCard{}
	for _, c := range cards {
		s := stat[c.ID]
		if s.Learners > 0 {
			continue
		}
		out = append(out, DeadCard{
			CardID: c.ID, Title: firstNonEmpty(c.TitleTxt, c.QuestionTxt),
			Category: c.CategoryCd, Learners: 0,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CardID < out[j].CardID })
	if len(out) > 50 {
		out = out[:50]
	}
	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 헤드라인 — 숫자를 문장으로
// ─────────────────────────────────────────────────────────────────────────────

// buildHeadlines 는 계산된 지표 중 '지금 손댈 것'만 뽑아 문장으로 만든다.
//
// 대시보드의 실패는 대개 숫자가 없어서가 아니라 너무 많아서다. 스무 개의 차트를
// 보여 주면 아무도 무엇부터 할지 모른다. 여기서 판단까지 끝내 준다.
func buildHeadlines(in Insight) []Headline {
	out := []Headline{}

	if in.Coverage.LearnersWithData == 0 {
		return append(out, Headline{
			Severity: "info", Title: "아직 학습 데이터가 없습니다",
			Detail: "학습자가 카드를 풀기 시작하면 여기에 분석이 채워집니다.",
			Metric: "0명",
		})
	}

	// 콘텐츠 품질 — 신고와 난이도 오표기.
	harder := 0
	for _, c := range in.Calibration {
		if c.Verdict == "harder" {
			harder++
		}
	}
	if harder > 0 {
		out = append(out, Headline{
			Severity: "warn",
			Title:    fmt.Sprintf("선언보다 훨씬 어려운 문제 %d개", harder),
			Detail:   "난이도가 잘못 매겨져 있으면 초급자에게 어려운 문제가 먼저 나갑니다. 난이도를 올리거나 해설을 보강하세요.",
			Metric:   fmt.Sprintf("%d개", harder),
			Link:     "cards",
		})
	}

	// 이탈 — 되돌릴 가치가 큰 학습자.
	if n := in.Churn.AtRisk + in.Churn.Dormant; n > 0 {
		detail := fmt.Sprintf("%d일 이상 학습이 없는 학습자입니다.", churnRiskDays)
		if len(in.Churn.Top) > 0 {
			t := in.Churn.Top[0]
			detail = fmt.Sprintf("가장 아까운 사례: %s(%d장 쌓고 %d일째 중단). %s",
				t.Name, t.Cards, t.DaysAway, detail)
		}
		out = append(out, Headline{
			Severity: "critical", Title: fmt.Sprintf("이탈 위험 학습자 %d명", n),
			Detail: detail, Metric: fmt.Sprintf("%d명", n), Link: "users",
		})
	}

	// 퍼널에서 가장 크게 새는 곳.
	if worst := worstFunnelStage(in.Funnel); worst != nil {
		out = append(out, Headline{
			Severity: "warn",
			Title:    fmt.Sprintf("'%s' 단계에서 %d명이 이탈", worst.Stage, worst.Drop),
			Detail:   fmt.Sprintf("직전 단계의 %.0f%%만 넘어옵니다. 이 구간이 가장 크게 새고 있습니다.", worst.Rate*100),
			Metric:   fmt.Sprintf("%.0f%%", worst.Rate*100),
		})
	}

	// 가장 어려운 분야.
	if len(in.Categories) > 0 {
		c := in.Categories[0]
		if c.Reps > 0 && c.Ratio >= 1.3 {
			out = append(out, Headline{
				Severity: "warn",
				Title:    fmt.Sprintf("'%s' 분야가 평균보다 %.1f배 어렵습니다", c.Category, c.Ratio),
				Detail:   fmt.Sprintf("실패율 %.0f%%. 이 분야 교육을 보강하거나 문제를 쉬운 것부터 재배치하세요.", c.LapseRate*100),
				Metric:   fmt.Sprintf("%.0f%%", c.LapseRate*100),
			})
		}
	}

	// 도달하지 못한 콘텐츠.
	if n := len(in.DeadContent); n > 0 {
		out = append(out, Headline{
			Severity: "info",
			Title:    fmt.Sprintf("아무도 만나지 못한 문제 %d개", n),
			Detail:   "만들어 두고 도달하지 않으면 없는 것과 같습니다. 분야 배분이나 노출 규칙을 확인하세요.",
			Metric:   fmt.Sprintf("%d개", n), Link: "cards",
		})
	}

	// 활동 이상.
	for _, a := range in.Anomalies {
		if a.Direction != "drop" {
			continue
		}
		out = append(out, Headline{
			Severity: "warn",
			Title:    fmt.Sprintf("%s 활동이 평소보다 크게 낮았습니다", a.Day),
			Detail:   fmt.Sprintf("%d명(평소 %.0f명). 배포 사고·공휴일·알림 실패 중 무엇인지 확인하세요.", a.Users, a.Expected),
			Metric:   fmt.Sprintf("%d명", a.Users),
		})
		break // 가장 최근 것 하나만 — 같은 말을 반복하면 아무도 안 읽는다.
	}

	if len(out) == 0 {
		out = append(out, Headline{
			Severity: "good", Title: "지금 손볼 것이 없습니다",
			Detail: "콘텐츠 난이도·이탈·퍼널 모두 기준 안에 있습니다.",
			Metric: "이상 없음",
		})
	}
	return out
}

func worstFunnelStage(stages []FunnelStage) *FunnelStage {
	var worst *FunnelStage
	for i := 1; i < len(stages); i++ {
		s := stages[i]
		if s.Drop <= 0 {
			continue
		}
		if worst == nil || s.Drop > worst.Drop {
			cp := s
			worst = &cp
		}
	}
	return worst
}

// ─────────────────────────────────────────────────────────────────────────────
// 도우미
// ─────────────────────────────────────────────────────────────────────────────

func indexUsers(users []domain.User) map[string]domain.User {
	m := make(map[string]domain.User, len(users))
	for _, u := range users {
		m[u.ID] = u
	}
	return m
}

func indexCards(cards []domain.Card) map[string]domain.Card {
	m := make(map[string]domain.Card, len(cards))
	for _, c := range cards {
		m[c.ID] = c
	}
	return m
}

func indexCardStats(stats []ports.CardLearningStat) map[string]ports.CardLearningStat {
	m := make(map[string]ports.CardLearningStat, len(stats))
	for _, s := range stats {
		m[s.CardID] = s
	}
	return m
}

func groupDays(days []ports.UserDay) map[string]map[string]struct{} {
	m := map[string]map[string]struct{}{}
	for _, d := range days {
		if m[d.UserID] == nil {
			m[d.UserID] = map[string]struct{}{}
		}
		m[d.UserID][d.DayKey] = struct{}{}
	}
	return m
}

// isHabitual 은 최근 창 안에서 충분히 자주 학습했는지 본다.
func isHabitual(now time.Time, days map[string]struct{}) bool {
	if len(days) < habitActiveDays {
		return false
	}
	count := 0
	for i := 0; i < habitWindowDays; i++ {
		if _, ok := days[DayKey(now.AddDate(0, 0, -i))]; ok {
			count++
		}
	}
	return count >= habitActiveDays
}

func anyDayInRange(days map[string]struct{}, lo, hi time.Time) bool {
	for key := range days {
		t, ok := ParseDayKey(key)
		if !ok {
			continue
		}
		if !t.Before(lo) && t.Before(hi) {
			return true
		}
	}
	return false
}

// daysAway 는 마지막 학습 이후 지난 날 수. 기록이 없으면 아주 큰 값을 준다
// (0 을 주면 '방금 활동함'으로 읽혀 이탈자가 활성으로 둔갑한다).
func daysAway(now, last time.Time) int {
	if last.IsZero() {
		return 9999
	}
	d := int(now.Sub(last).Hours() / 24)
	if d < 0 {
		return 0
	}
	return d
}

// weekStart 는 그 주 월요일 자정.
func weekStart(t time.Time) time.Time {
	wd := int(t.Weekday())
	// Go 의 Weekday 는 일요일이 0 이다. 월요일 시작으로 옮긴다.
	offset := (wd + 6) % 7
	y, m, d := t.AddDate(0, 0, -offset).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

func meanStdDev(vals []float64) (float64, float64) {
	if len(vals) == 0 {
		return 0, 0
	}
	var sum float64
	for _, v := range vals {
		sum += v
	}
	mean := sum / float64(len(vals))
	var sq float64
	for _, v := range vals {
		sq += (v - mean) * (v - mean)
	}
	return mean, math.Sqrt(sq / float64(len(vals)))
}

// round1 은 stats_service 에 이미 있으므로 재사용한다(같은 반올림이 두 벌이면 갈라진다).
func round3(v float64) float64 { return math.Round(v*1000) / 1000 }
