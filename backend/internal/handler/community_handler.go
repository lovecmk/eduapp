package handler

import (
	"github.com/gofiber/fiber/v2"

	"github.com/lovecmk/eduapp/backend/internal/middleware"
	"github.com/lovecmk/eduapp/backend/internal/service"
)

// CommunityHandler 는 커뮤니티 프레즌스 엔드포인트.
type CommunityHandler struct{ svc *service.CommunityService }

// NewCommunityHandler 는 커뮤니티 핸들러를 만든다.
func NewCommunityHandler(svc *service.CommunityService) *CommunityHandler {
	return &CommunityHandler{svc: svc}
}

// Live GET /api/community/live
func (h *CommunityHandler) Live(c *fiber.Ctx) error {
	userID := middleware.UserID(c)
	s, err := h.svc.Build(c.Context(), userID)
	if err != nil {
		return err
	}

	companions := make([]CompanionDTO, len(s.Companions))
	for i, cp := range s.Companions {
		companions[i] = CompanionDTO{ID: cp.ID, UserNm: cp.UserNm, Color: cp.Color, CategoryCd: cp.CategoryCd}
	}
	activities := make([]ActivityDTO, len(s.Activities))
	for i, a := range s.Activities {
		activities[i] = ActivityDTO{ID: a.ID, UserNm: a.UserNm, ActionCd: a.ActionCd, CategoryCd: a.CategoryCd, SecondsAgo: a.SecondsAgo}
	}

	leaderboard := make([]ContributorDTO, len(s.Leaderboard))
	for i, cb := range s.Leaderboard {
		leaderboard[i] = ContributorDTO{Rank: cb.Rank, Nickname: cb.Nickname, Cards: cb.Cards, Color: cb.Color, IsMe: cb.IsMe}
	}
	weeklyActivity := make([]WeeklyPointDTO, len(s.WeeklyActivity))
	for i, w := range s.WeeklyActivity {
		weeklyActivity[i] = WeeklyPointDTO{Label: w.Label, Count: w.Count}
	}

	dto := CommunityDTO{
		OnlineNow:         s.OnlineNow,
		StudiedToday:      s.StudiedToday,
		TotalMinutesToday: s.TotalMinutesToday,
		DailyGoalMinutes:  s.DailyGoalMinutes,
		Companions:        companions,
		Activities:        activities,
		TotalCardsAllTime: s.TotalCardsAllTime,
		Leaderboard:       leaderboard,
		MyRank:            s.MyRank,
		WeeklyActivity:    weeklyActivity,
	}
	if s.Challenge != nil {
		dto.Challenge = &ChallengeDTO{
			Title:          s.Challenge.Title,
			GoalCards:      s.Challenge.GoalCards,
			CurrentCards:   s.Challenge.CurrentCards,
			MyContribution: s.Challenge.MyContribution,
			Participants:   s.Challenge.Participants,
			EndsInDays:     s.Challenge.EndsInDays,
		}
	}
	if s.Building != nil {
		hist := make([]BuildingMonthDTO, len(s.Building.History))
		for i, m := range s.Building.History {
			hist[i] = BuildingMonthDTO{Month: m.Month, Label: m.Label, Problems: m.Problems, Floors: m.Floors}
		}
		dto.Building = &BuildingDTO{
			FloorSize: s.Building.FloorSize,
			Current: BuildingMonthDTO{
				Month: s.Building.Current.Month, Label: s.Building.Current.Label,
				Problems: s.Building.Current.Problems, Floors: s.Building.Current.Floors,
			},
			History: hist,
		}
	}
	return c.JSON(dto)
}
