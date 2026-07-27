// Package handler 는 HTTP(Fiber) 어댑터다.
// 프런트엔드의 DTO 계약(snake_case)과 1:1로 일치하는 응답 형식을 정의하고,
// 도메인 모델 ↔ DTO 변환을 담당한다.
package handler

import (
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
)

// CardDTO 는 src/data/dto/CardDTO.ts 와 필드가 정확히 일치한다.
type CardDTO struct {
	ID            string   `json:"id"`
	CategoryCd    string   `json:"category_cd"`
	SubCategoryNm string   `json:"sub_category_nm,omitempty"`
	TopicNm       string   `json:"topic_nm,omitempty"`
	Keywords      []string `json:"keywords,omitempty"`
	TitleTxt      string   `json:"title_txt,omitempty"`
	StudySeconds  int      `json:"study_seconds,omitempty"`
	SituationTxt  string   `json:"situation_txt,omitempty"`
	QuestionTxt   string   `json:"question_txt"`
	ImageURL      string   `json:"image_url,omitempty"`
	PrincipleTxt  string   `json:"principle_txt,omitempty"`
	ProcessTxt    string   `json:"process_txt,omitempty"`
	FireTriangle  string   `json:"fire_triangle_txt,omitempty"`
	ConclusionTxt string   `json:"conclusion_txt,omitempty"`
	AnswerImage   string   `json:"answer_image_url,omitempty"`
	SourceTxt     string   `json:"source_txt,omitempty"`
	StatusCd      string   `json:"status_cd"`
	DifficultyCd  string   `json:"difficulty_cd,omitempty"`
	DueAt         *string  `json:"due_at"`
	CardTypeCd    string   `json:"card_type_cd,omitempty"`
	Choices       []string `json:"choices,omitempty"`
	AnswerIndex   *int     `json:"answer_index,omitempty"`
}

func toCardDTO(c domain.CardWithProgress) CardDTO {
	var due *string
	if c.DueAt != nil {
		s := c.DueAt.UTC().Format(time.RFC3339)
		due = &s
	}
	return CardDTO{
		ID:            c.ID,
		CategoryCd:    c.CategoryCd,
		SubCategoryNm: c.SubCategoryNm,
		TopicNm:       c.TopicNm,
		Keywords:      c.Keywords,
		TitleTxt:      c.TitleTxt,
		StudySeconds:  c.StudySeconds,
		SituationTxt:  c.SituationTxt,
		QuestionTxt:   c.QuestionTxt,
		ImageURL:      c.ImageURL,
		PrincipleTxt:  c.PrincipleTxt,
		ProcessTxt:    c.ProcessTxt,
		FireTriangle:  c.FireTriangle,
		ConclusionTxt: c.ConclusionTxt,
		AnswerImage:   c.AnswerImageURL,
		SourceTxt:     c.SourceTxt,
		StatusCd:      string(c.Status),
		DifficultyCd:  string(c.DifficultyCd),
		DueAt:         due,
		CardTypeCd:    string(c.CardTypeCd),
		Choices:       c.Choices,
		AnswerIndex:   c.AnswerIndex,
	}
}

func toCardDTOList(cards []domain.CardWithProgress) []CardDTO {
	out := make([]CardDTO, 0, len(cards))
	for _, c := range cards {
		out = append(out, toCardDTO(c))
	}
	return out
}

// UserDTO 는 src/data/dto/UserDTO.ts 와 일치한다.
type UserDTO struct {
	ID           int    `json:"id"`
	LoginID      string `json:"login_id,omitempty"`
	UserNm       string `json:"user_nm"`
	Nickname     string `json:"nickname,omitempty"`
	EmailAddr    string `json:"email_addr"`
	OrgNm        string `json:"org_nm,omitempty"`
	JobTitle     string `json:"job_title,omitempty"`
	MembershipCd string `json:"membership_cd,omitempty"`
	CreatedAt    string `json:"created_at"`
	StatusCd     string `json:"status_cd"`
}

// AuthResultDTO 는 로그인 응답(access/refresh/user).
type AuthResultDTO struct {
	AccessToken  string  `json:"access_token"`
	RefreshToken string  `json:"refresh_token"`
	User         UserDTO `json:"user"`
}

func toUserDTO(u *domain.User) UserDTO {
	// 프런트 UserDTO.id 는 number 타입이라, 문자열 _id 를 안정적 정수로 축약해 노출한다.
	return UserDTO{
		ID:           hashID(u.ID),
		LoginID:      u.LoginID,
		UserNm:       u.UserNm,
		Nickname:     u.Nickname,
		EmailAddr:    u.EmailAddr,
		OrgNm:        u.OrgNm,
		JobTitle:     u.JobTitle,
		MembershipCd: string(u.MembershipCd),
		CreatedAt:    u.CreatedAt.UTC().Format(time.RFC3339),
		StatusCd:     u.StatusCd,
	}
}

func hashID(s string) int {
	var h uint32 = 2166136261
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return int(h % 1_000_000_000)
}

// StatsDTO 는 src/data/dto/StatsDTO.ts 와 일치한다.
type StatsDTO struct {
	StreakDays        int                `json:"streak_days"`
	BestStreak        int                `json:"best_streak"`
	TotalLearned      int                `json:"total_learned"`
	TotalCards        int                `json:"total_cards"`
	AccuracyRate      float64            `json:"accuracy_rate"`
	DueToday          int                `json:"due_today"`
	Weekly            []WeeklyPointDTO   `json:"weekly"`
	CategoryBreakdown []CategoryBreakDTO `json:"category_breakdown"`
	Rankings          []RankingEntryDTO  `json:"rankings"`
	Insights          InsightsDTO        `json:"insights"`
}

// InsightsDTO 는 파생 학습 인사이트(통계 강화). 프런트는 선택적으로 소비한다.
type InsightsDTO struct {
	WeeklyTotal          int     `json:"weekly_total"`
	ActiveDays           int     `json:"active_days"`
	AvgPerActiveDay      float64 `json:"avg_per_active_day"`
	TopCategory          string  `json:"top_category"`
	TopCategoryAccuracy  float64 `json:"top_category_accuracy"`
	WeakCategory         string  `json:"weak_category"`
	WeakCategoryAccuracy float64 `json:"weak_category_accuracy"`
	Level                int     `json:"level"`
	LevelTitle           string  `json:"level_title"`
	NextLevelIn          int     `json:"next_level_in"`
}

type WeeklyPointDTO struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

type CategoryBreakDTO struct {
	Category string  `json:"category"`
	Total    int     `json:"total"`
	Mastered int     `json:"mastered"`
	Accuracy float64 `json:"accuracy"`
}

type RankingEntryDTO struct {
	Rank     int    `json:"rank"`
	Nickname string `json:"nickname"`
	Score    int    `json:"score"`
}

// CommunityDTO 는 CommunityRepository.ts 가 소비하는 /api/community/live 응답.
type CommunityDTO struct {
	OnlineNow         int              `json:"online_now"`
	StudiedToday      int              `json:"studied_today"`
	TotalMinutesToday int              `json:"total_minutes_today"`
	DailyGoalMinutes  int              `json:"daily_goal_minutes"`
	Companions        []CompanionDTO   `json:"companions"`
	Activities        []ActivityDTO    `json:"activities"`
	Challenge         *ChallengeDTO    `json:"challenge,omitempty"`
	TotalCardsAllTime int              `json:"total_cards_all_time"`
	Building          *BuildingDTO     `json:"building,omitempty"`
	Leaderboard       []ContributorDTO `json:"leaderboard"`
	MyRank            int              `json:"my_rank"`
	WeeklyActivity    []WeeklyPointDTO `json:"weekly_activity"`
}

// ContributorDTO 는 커뮤니티 기여 랭킹 한 줄(커뮤니티 강화).
type ContributorDTO struct {
	Rank     int    `json:"rank"`
	Nickname string `json:"nickname"`
	Cards    int    `json:"cards"`
	Color    string `json:"color"`
	IsMe     bool   `json:"is_me"`
}

type CompanionDTO struct {
	ID         string `json:"id"`
	UserNm     string `json:"user_nm"`
	Color      string `json:"color"`
	CategoryCd string `json:"category_cd,omitempty"`
}

type ActivityDTO struct {
	ID         string `json:"id"`
	UserNm     string `json:"user_nm"`
	ActionCd   string `json:"action_cd"`
	CategoryCd string `json:"category_cd,omitempty"`
	SecondsAgo int    `json:"seconds_ago"`
}

type ChallengeDTO struct {
	Title          string `json:"title"`
	GoalCards      int    `json:"goal_cards"`
	CurrentCards   int    `json:"current_cards"`
	MyContribution int    `json:"my_contribution"`
	Participants   int    `json:"participants"`
	EndsInDays     int    `json:"ends_in_days"`
}

type BuildingDTO struct {
	FloorSize int                `json:"floor_size"`
	Current   BuildingMonthDTO   `json:"current"`
	History   []BuildingMonthDTO `json:"history"`
}

type BuildingMonthDTO struct {
	Month    string `json:"month"`
	Label    string `json:"label"`
	Problems int    `json:"problems"`
	Floors   int    `json:"floors"`
}
