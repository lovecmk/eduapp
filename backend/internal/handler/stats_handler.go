package handler

import (
	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/service"
)

// StatsHandler 는 통계 엔드포인트.
type StatsHandler struct{ svc *service.StatsService }

// NewStatsHandler 는 통계 핸들러를 만든다.
func NewStatsHandler(svc *service.StatsService) *StatsHandler { return &StatsHandler{svc: svc} }

// Get GET /api/stats
func (h *StatsHandler) Get(c *fiber.Ctx) error {
	userID := c.Locals("userID").(string)
	st, err := h.svc.Compute(c.Context(), userID)
	if err != nil {
		return err
	}

	weekly := make([]WeeklyPointDTO, len(st.Weekly))
	for i, w := range st.Weekly {
		weekly[i] = WeeklyPointDTO{Label: w.Label, Count: w.Count}
	}
	breakdown := make([]CategoryBreakDTO, len(st.CategoryBreakdown))
	for i, b := range st.CategoryBreakdown {
		breakdown[i] = CategoryBreakDTO{Category: b.Category, Total: b.Total, Mastered: b.Mastered, Accuracy: b.Accuracy}
	}
	rankings := make([]RankingEntryDTO, len(st.Rankings))
	for i, r := range st.Rankings {
		rankings[i] = RankingEntryDTO{Rank: r.Rank, Nickname: r.Nickname, Score: r.Score}
	}

	return c.JSON(StatsDTO{
		StreakDays:        st.StreakDays,
		BestStreak:        st.BestStreak,
		TotalLearned:      st.TotalLearned,
		TotalCards:        st.TotalCards,
		AccuracyRate:      st.AccuracyRate,
		DueToday:          st.DueToday,
		Weekly:            weekly,
		CategoryBreakdown: breakdown,
		Rankings:          rankings,
	})
}
