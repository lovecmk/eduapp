package service

import (
	"context"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
)

// CommunityService 는 커뮤니티 프레즌스 스냅샷을 구성한다.
// 실시간 소셜 인프라(웹소켓/프레즌스 서버)가 붙기 전까지, 개인 학습 데이터에
// 기반한 결정론적 근사치를 제공해 프런트 화면이 살아있게 한다.
type CommunityService struct{ cards *CardService }

// NewCommunityService 는 커뮤니티 서비스를 만든다.
func NewCommunityService(cards *CardService) *CommunityService {
	return &CommunityService{cards: cards}
}

// Snapshot 은 CommunityDTO 로 매핑될 스냅샷 데이터.
type Snapshot struct {
	OnlineNow         int
	StudiedToday      int
	TotalMinutesToday int
	DailyGoalMinutes  int
	Companions        []Companion
	Activities        []Activity
	Challenge         *Challenge
	TotalCardsAllTime int
	Building          *Building
}

type Companion struct {
	ID, UserNm, Color, CategoryCd string
}
type Activity struct {
	ID, UserNm, ActionCd, CategoryCd string
	SecondsAgo                       int
}
type Challenge struct {
	Title                                                 string
	GoalCards, CurrentCards, MyContribution, Participants int
	EndsInDays                                            int
}
type Building struct {
	FloorSize int
	Current   BuildingMonth
	History   []BuildingMonth
}
type BuildingMonth struct {
	Month, Label     string
	Problems, Floors int
}

// Build 는 스냅샷을 만든다.
func (s *CommunityService) Build(ctx context.Context, userID string) (*Snapshot, error) {
	all, err := s.cards.All(ctx, userID)
	if err != nil {
		return nil, err
	}
	mastered := 0
	for _, c := range all {
		if c.Status == domain.StatusMastered {
			mastered++
		}
	}

	companions := []Companion{
		{ID: "c1", UserNm: "김안전", Color: "#F2B705", CategoryCd: "ELEC"},
		{ID: "c2", UserNm: "이현장", Color: "#5C6BC0", CategoryCd: "PROCESS"},
		{ID: "c3", UserNm: "박점검", Color: "#E2574C", CategoryCd: "HAZMAT"},
	}
	activities := []Activity{
		{ID: "a1", UserNm: "김안전", ActionCd: "MASTERED", CategoryCd: "ELEC", SecondsAgo: 45},
		{ID: "a2", UserNm: "이현장", ActionCd: "LEARNING", CategoryCd: "PROCESS", SecondsAgo: 180},
		{ID: "a3", UserNm: "박점검", ActionCd: "STREAK", SecondsAgo: 900},
	}

	now := time.Now()
	const floor = 20000
	problems := mastered * 137 % (floor * 40)
	building := &Building{
		FloorSize: floor,
		Current: BuildingMonth{
			Month:    now.Format("2006-01"),
			Label:    monthLabel(now),
			Problems: problems,
			Floors:   problems / floor,
		},
		History: []BuildingMonth{},
	}

	return &Snapshot{
		OnlineNow:         3 + mastered%5,
		StudiedToday:      12 + mastered,
		TotalMinutesToday: 36 + mastered*3,
		DailyGoalMinutes:  3, // 개인 하루 목표 = 3분 학습
		Companions:        companions,
		Activities:        activities,
		Challenge: &Challenge{
			Title:          "이번 주 안전 챌린지",
			GoalCards:      100,
			CurrentCards:   62 + mastered,
			MyContribution: mastered,
			Participants:   8,
			EndsInDays:     3,
		},
		TotalCardsAllTime: 4200 + mastered,
		Building:          building,
	}, nil
}

func monthLabel(t time.Time) string {
	m := []string{"", "1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"}
	return m[int(t.Month())]
}
