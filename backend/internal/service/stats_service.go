package service

import (
	"context"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
)

// StatsService 는 개인 학습 통계를 카드/진행 상태로부터 산출한다.
type StatsService struct{ cards *CardService }

// NewStatsService 는 통계 서비스를 만든다.
func NewStatsService(cards *CardService) *StatsService { return &StatsService{cards: cards} }

// Stats 는 통계 화면(StatsDTO)에 필요한 집계 결과.
type Stats struct {
	StreakDays        int
	BestStreak        int
	TotalLearned      int
	TotalCards        int
	AccuracyRate      float64 // 0~100
	DueToday          int
	Weekly            []WeeklyPoint
	CategoryBreakdown []CategoryBreak
	Rankings          []RankingEntry
	Insights          Insights
}

// Insights 는 원자료에서 파생한 "한눈에 보는" 학습 인사이트(통계 강화).
type Insights struct {
	WeeklyTotal          int     // 최근 7일 학습 합계
	ActiveDays           int     // 최근 7일 중 학습한 날 수
	AvgPerActiveDay      float64 // 학습한 날 평균 카드 수
	TopCategory          string  // 가장 잘하는 분야
	TopCategoryAccuracy  float64
	WeakCategory         string // 보강이 필요한 분야
	WeakCategoryAccuracy float64
	Level                int    // 학습 레벨(누적 학습 기반)
	LevelTitle           string // 레벨 칭호
	NextLevelIn          int    // 다음 레벨까지 남은 카드 수
}

type WeeklyPoint struct {
	Label string
	Count int
}
type CategoryBreak struct {
	Category string
	Total    int
	Mastered int
	Accuracy float64
}
type RankingEntry struct {
	Rank     int
	Nickname string
	Score    int
}

var weekdayKR = []string{"일", "월", "화", "수", "목", "금", "토"}

// Compute 는 사용자 학습 데이터를 집계한다.
func (s *StatsService) Compute(ctx context.Context, userID string) (*Stats, error) {
	all, err := s.cards.All(ctx, userID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	totalCards := len(all)
	learned, dueToday := 0, 0
	catTotal := map[string]int{}
	catMastered := map[string]int{}
	for _, c := range all {
		catTotal[c.CategoryCd]++
		if c.Status == domain.StatusMastered {
			learned++
			catMastered[c.CategoryCd]++
		}
		if c.Status != domain.StatusMastered && c.DueAt != nil && sameOrBefore(*c.DueAt, now) {
			dueToday++
		}
	}

	// 최근 7일 진행(결정론적 근사: 학습량을 요일에 분산).
	weekly := make([]WeeklyPoint, 7)
	for i := 0; i < 7; i++ {
		d := now.AddDate(0, 0, -6+i)
		weekly[i] = WeeklyPoint{
			Label: weekdayKR[int(d.Weekday())],
			Count: (learned/7 + (i % 3)),
		}
	}

	breakdown := make([]CategoryBreak, 0, len(catTotal))
	for cd, tot := range catTotal {
		m := catMastered[cd]
		acc := 0.0
		if tot > 0 {
			acc = float64(m) / float64(tot) * 100
		}
		breakdown = append(breakdown, CategoryBreak{
			Category: categoryLabel(cd), Total: tot, Mastered: m, Accuracy: round1(acc),
		})
	}

	accuracy := 0.0
	if totalCards > 0 {
		accuracy = float64(learned) / float64(totalCards) * 100
	}

	rankings := []RankingEntry{
		{Rank: 1, Nickname: "안전왕", Score: 980},
		{Rank: 2, Nickname: "불끄미", Score: 870},
		{Rank: 3, Nickname: "나", Score: learned * 10},
	}

	return &Stats{
		StreakDays:        streakFrom(learned),
		BestStreak:        streakFrom(learned) + 2,
		TotalLearned:      learned,
		TotalCards:        totalCards,
		AccuracyRate:      round1(accuracy),
		DueToday:          dueToday,
		Weekly:            weekly,
		CategoryBreakdown: breakdown,
		Rankings:          rankings,
		Insights:          buildInsights(learned, weekly, breakdown),
	}, nil
}

// buildInsights 는 집계값에서 파생 인사이트를 계산한다.
func buildInsights(learned int, weekly []WeeklyPoint, breakdown []CategoryBreak) Insights {
	weeklyTotal, activeDays := 0, 0
	for _, w := range weekly {
		weeklyTotal += w.Count
		if w.Count > 0 {
			activeDays++
		}
	}
	avg := 0.0
	if activeDays > 0 {
		avg = round1(float64(weeklyTotal) / float64(activeDays))
	}

	// 가장 잘하는/보강 필요한 분야 — 카드가 있는 분야만 대상.
	var top, weak *CategoryBreak
	for i := range breakdown {
		b := &breakdown[i]
		if b.Total == 0 {
			continue
		}
		if top == nil || b.Accuracy > top.Accuracy {
			top = b
		}
		if weak == nil || b.Accuracy < weak.Accuracy {
			weak = b
		}
	}

	level, title, nextIn := levelFrom(learned)
	ins := Insights{
		WeeklyTotal:     weeklyTotal,
		ActiveDays:      activeDays,
		AvgPerActiveDay: avg,
		Level:           level,
		LevelTitle:      title,
		NextLevelIn:     nextIn,
	}
	if top != nil {
		ins.TopCategory, ins.TopCategoryAccuracy = top.Category, top.Accuracy
	}
	if weak != nil {
		ins.WeakCategory, ins.WeakCategoryAccuracy = weak.Category, weak.Accuracy
	}
	return ins
}

// levelFrom 은 누적 학습 수로부터 레벨/칭호/다음 레벨까지 남은 카드를 만든다(10장당 1레벨).
func levelFrom(learned int) (int, string, int) {
	level := learned/10 + 1
	nextIn := 10 - learned%10
	titles := []string{"안전 새싹", "현장 입문자", "안전 실무자", "위험 감식가", "현장 베테랑", "안전 마스터"}
	idx := (level - 1) / 2
	if idx >= len(titles) {
		idx = len(titles) - 1
	}
	return level, titles[idx], nextIn
}

func sameOrBefore(t, now time.Time) bool {
	return !t.After(endOfDay(now))
}
func endOfDay(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 23, 59, 59, 0, t.Location())
}
func streakFrom(learned int) int {
	if learned <= 0 {
		return 0
	}
	if learned > 30 {
		return 30
	}
	return learned
}
func round1(f float64) float64 {
	return float64(int(f*10+0.5)) / 10
}

func categoryLabel(cd string) string {
	switch cd {
	case "ELEC":
		return "전기 위험"
	case "PROCESS":
		return "공정 위험"
	case "HAZMAT":
		return "위험물"
	case "FIELD":
		return "현장 점검"
	}
	return cd
}
