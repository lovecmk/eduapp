package service

import (
	"context"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// LearningService 는 "오늘 이 사람에게 무엇을 낼 것인가"를 정한다.
//
// ── 왜 서버가 정하는가 ────────────────────────────────────────────────────
// 예전에는 앱이 직접 골랐다. "아직 안 배운 카드를 쉬운 순으로 정렬해서 앞에서
// 세 장." 그 결과가 이랬다.
//
//   - 앱을 지우면 오늘 몇 장 배웠는지가 초기화되고, 같은 사람이 태블릿과
//     휴대폰으로 각각 상한을 채울 수 있었다.
//   - 진도가 같으면 **모든 사용자가 같은 카드를 같은 순서로** 받았다.
//   - 세션을 마치지 않으면 다음 날에도 **똑같은 카드**가 나왔다.
//   - 관리자가 콘솔에서 출제량을 바꿔도 아무 일도 일어나지 않았다.
//
// 편성 규칙 자체는 daily_plan.go 에 순수 함수로 있다. 이 서비스는 저장소에서
// 재료를 모아 그 규칙에 넘기고, 결과를 그날 하루 얼려 두는 일만 한다.
type LearningService struct {
	data     ports.UserDataRepository
	cards    ports.CardRepository
	settings *SettingsService
	now      func() time.Time
}

// NewLearningService 는 학습 편성 서비스를 만든다.
func NewLearningService(data ports.UserDataRepository, cards ports.CardRepository, settings *SettingsService) *LearningService {
	return &LearningService{data: data, cards: cards, settings: settings, now: time.Now}
}

// Available 은 편성을 만들 수 있는 구성인지.
func (s *LearningService) Available() bool { return s != nil && s.data != nil && s.cards != nil }

// TodayCard 는 오늘 나가는 문제 한 장(콘텐츠 + 이 사람의 상태).
type TodayCard struct {
	domain.Card
	// Kind 는 "새로 배우는 것"인지 "복습"인지. 화면이 둘을 다르게 안내한다 —
	// 복습을 새 문제처럼 내보이면 사용자는 같은 문제가 또 나왔다고 느낀다.
	Kind string `json:"kind"` // NEW | REVIEW
	// Done 은 오늘 이미 푼 문제인지. 앱을 다시 열었을 때 이어서 하게 해 준다.
	Done bool `json:"done"`
}

// TodayPlan 은 앱이 받아 가는 오늘의 학습 한 벌.
type TodayPlan struct {
	Day string `json:"day"`
	// DifficultyCd 는 오늘 이 사람에게 맞춰 정해진 난이도.
	DifficultyCd domain.Difficulty `json:"difficulty_cd"`
	// TargetCount 는 난이도가 정한 목표 장수(3~5). 후보가 모자라면 Cards 가 더 짧다.
	TargetCount int         `json:"target_count"`
	Cards       []TodayCard `json:"cards"`
	// DoneCount 는 그중 오늘 이미 푼 수 — 화면의 "2/4" 가 이 값에서 나온다.
	DoneCount int `json:"done_count"`
	// ResetsAt 은 다음 편성이 나오는 시각(다음 자정).
	ResetsAt string `json:"resets_at"`
}

// Today 는 오늘의 편성을 준다. 그날 처음 물으면 만들어 저장하고, 이후에는 그것을 그대로 준다.
func (s *LearningService) Today(ctx context.Context, userID string) (*TodayPlan, error) {
	now := s.now()
	day := DayKey(now)
	cfg := s.settings.Get(ctx).Normalized()

	assignment, err := s.assignmentFor(ctx, userID, day, cfg)
	if err != nil {
		return nil, err
	}

	cards, err := s.cards.AllCards(ctx)
	if err != nil {
		return nil, err
	}
	byID := make(map[string]domain.Card, len(cards))
	for _, c := range cards {
		byID[c.ID] = c
	}

	snap, err := s.data.LoadSync(ctx, userID)
	if err != nil {
		return nil, err
	}
	studiedToday := map[string]bool{}
	for _, id := range snap.History[day] {
		studiedToday[id] = true
	}

	out := make([]TodayCard, 0, len(assignment.CardIDs))
	done := 0
	for _, id := range assignment.CardIDs {
		card, ok := byID[id]
		if !ok {
			// 배정된 뒤 관리자가 문제를 지웠다. 편성은 그대로 두되(그날의 기록이다)
			// 없는 문제를 앱에 내려보내지는 않는다.
			continue
		}
		kind := "NEW"
		if _, seen := snap.Cards[id]; seen {
			kind = "REVIEW"
		}
		if studiedToday[id] {
			done++
		}
		out = append(out, TodayCard{Card: card, Kind: kind, Done: studiedToday[id]})
	}

	return &TodayPlan{
		Day:          day,
		DifficultyCd: assignment.DifficultyCd,
		TargetCount:  assignment.TargetCount,
		Cards:        out,
		DoneCount:    done,
		ResetsAt:     nextMidnight(now).UTC().Format(time.RFC3339),
	}, nil
}

// Existing 은 **이미 만들어진** 오늘의 편성만 준다(없으면 started=false).
//
// 관리 콘솔이 쓴다. 콘솔이 Today 를 부르면 관리자가 목록을 열어 봤다는 이유로
// 그 사람의 오늘 문제가 확정된다 — 아직 앱을 열지도 않은 사람의 편성이
// 관리자의 조회 시각과 그때의 후보로 굳는 것이다. 조회는 조회여야 한다.
func (s *LearningService) Existing(ctx context.Context, userID string) (*TodayPlan, bool, error) {
	day := DayKey(s.now())
	existing, err := s.data.LoadAssignment(ctx, userID, day)
	if err != nil {
		return nil, false, err
	}
	if existing == nil {
		return nil, false, nil
	}
	plan, err := s.Today(ctx, userID) // 이미 있으므로 새로 만들지 않는다
	if err != nil {
		return nil, false, err
	}
	return plan, true, nil
}

// assignmentFor 는 그날의 편성을 읽거나(있으면) 만들어 저장한다.
func (s *LearningService) assignmentFor(ctx context.Context, userID, day string, cfg domain.OpsSettings) (*domain.DailyAssignment, error) {
	if existing, err := s.data.LoadAssignment(ctx, userID, day); err != nil {
		return nil, err
	} else if existing != nil {
		return existing, nil
	}

	candidates, signal, err := s.gather(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !cfg.AdaptiveDifficulty {
		// 자동 조절을 끄면 관찰을 무시하고 늘 쉬움으로 낸다 —
		// 교육 과정이 순서를 강제하거나 콘텐츠가 한 난이도에 몰려 있을 때.
		signal = LearnerSignal{}
	}

	plan := BuildDailyPlan(userID, day, signal, candidates, cfg.DailyMinCards, cfg.DailyMaxCards)
	return s.data.SaveAssignment(ctx, domain.DailyAssignment{
		UserID:       userID,
		DayKey:       day,
		CardIDs:      plan.CardIDs,
		DifficultyCd: plan.Difficulty,
		TargetCount:  plan.TargetCount,
		CreatedAt:    s.now(),
	})
}

// gather 는 편성에 필요한 재료를 모은다 — 후보 카드와 그 사람의 학습 기록.
func (s *LearningService) gather(ctx context.Context, userID string) ([]PlanCandidate, LearnerSignal, error) {
	cards, err := s.cards.AllCards(ctx)
	if err != nil {
		return nil, LearnerSignal{}, err
	}
	snap, err := s.data.LoadSync(ctx, userID)
	if err != nil {
		return nil, LearnerSignal{}, err
	}

	now := s.now()
	var sig LearnerSignal
	var boxSum float64
	for _, st := range snap.Cards {
		sig.Reps += st.Reps
		sig.Lapses += st.Lapses
		boxSum += float64(st.Box)
	}
	if n := len(snap.Cards); n > 0 {
		sig.AvgBox = boxSum / float64(n)
	}

	out := make([]PlanCandidate, 0, len(cards))
	for _, c := range cards {
		st, seen := snap.Cards[c.ID]
		// 충분히 익힌 카드는 후보에서 뺀다 — 이미 아는 것을 다시 내면
		// '하루 3분'이 복습으로만 채워져 새로 배우는 것이 멈춘다.
		// (그래도 예정일이 오면 복습으로 돌아온다.)
		if seen && st.Box >= masteredBoxLevel && st.DueAt.After(now) {
			continue
		}
		cand := PlanCandidate{CardID: c.ID, Difficulty: c.DifficultyCd, Seen: seen}
		if seen && !st.DueAt.After(now) {
			cand.Due = true
			// 얼마나 밀렸는가(분 단위). 오래 방치된 것부터 되살린다.
			cand.OverdueRank = int64(now.Sub(st.DueAt) / time.Minute)
		}
		out = append(out, cand)
	}
	return out, sig, nil
}

// Quota 는 오늘의 진행 현황이다.
// json 태그는 앱의 LearningQuotaRepository(QuotaDTO)와 1:1 로 맞춘다.
type Quota struct {
	// Limit 은 오늘 배정된 문제 수. 설정의 최대치가 아니라 **오늘 실제로 나간 수**다 —
	// 화면의 "2/4" 에서 4가 이 값이고, 그날 난이도에 따라 3~5로 달라진다.
	Limit int `json:"limit"`
	Used  int `json:"used"`
	// Remaining 은 앱이 다시 계산하지 않아도 되게 함께 준다.
	// 두 곳에서 각자 빼면 한쪽이 음수를 막지 않아 "-1장 남음"이 화면에 뜬다.
	Remaining int `json:"remaining"`
	// ResetsAt 은 다음 자정(서버 로컬 기준) — 앱이 "몇 시에 초기화되는가"를 보여준다.
	ResetsAt string `json:"resets_at"`
}

// Get 은 오늘의 상한 현황을 반환한다.
//
// 상한이 '오늘 배정된 수'인 것이 핵심이다. 설정의 최대치(5)를 그대로 쓰면,
// 어려운 날 3장을 다 풀고도 화면에는 "3/5 · 2장 남음"이 떠서 사용자는 남은
// 두 장을 찾아 헤맨다. 있지도 않은 문제를.
func (s *LearningService) Get(ctx context.Context, userID string) (*Quota, error) {
	now := s.now()
	plan, err := s.Today(ctx, userID)
	if err != nil {
		return nil, err
	}

	// 배정 장수를 상한으로 삼는다. 후보가 모자라 배정이 비었을 때만 목표를 쓴다 —
	// 0 을 상한으로 주면 앱이 '오늘 학습 끝'으로 오해한다.
	limit := len(plan.Cards)
	if limit == 0 {
		limit = plan.TargetCount
	}

	// 실제로 푼 수는 학습 이력이 권위다. 별도 카운터(learning_daily)는 오프라인
	// 큐가 올리는 값이라 이력보다 앞설 수 있어서, 둘 중 큰 쪽을 쓴다.
	counted, err := s.data.LearningCount(ctx, userID, DayKey(now))
	if err != nil {
		return nil, err
	}
	used := plan.DoneCount
	if counted > used {
		used = counted
	}

	remaining := limit - used
	if remaining < 0 {
		remaining = 0
	}
	return &Quota{
		Limit: limit, Used: used, Remaining: remaining,
		ResetsAt: nextMidnight(now).UTC().Format(time.RFC3339),
	}, nil
}

// Record 는 새로 배운 카드 수를 더하고 갱신된 현황을 반환한다.
//
// 상한을 넘겼다고 거부하지 않는 것은 의도적이다. 앱은 이미 학습을 마친 뒤에
// 보고하고(사용자에게는 끝난 일이다), 오프라인 큐가 며칠 치를 한꺼번에 밀어
// 올리기도 한다. 여기서 거절하면 그 기록만 사라지고 화면과 서버가 어긋난다.
// 상한은 '다음 학습을 열어 줄지'를 정하는 값이지 기록을 버리는 규칙이 아니다.
func (s *LearningService) Record(ctx context.Context, userID string, count int) (*Quota, error) {
	if count < 0 {
		count = 0 // 음수 보고는 누계를 되돌린다 — 실수든 조작이든 받아들이지 않는다
	}
	if count > maxRecordPerCall {
		count = maxRecordPerCall
	}
	if _, err := s.data.AddLearningCount(ctx, userID, DayKey(s.now()), count); err != nil {
		return nil, err
	}
	return s.Get(ctx, userID)
}

// maxRecordPerCall 은 한 번의 보고로 더할 수 있는 최대 건수.
// 오프라인 큐가 밀린 것을 모아 보내도 이 선을 넘을 일은 없고,
// 넘는 값은 오타이거나 조작이다.
const maxRecordPerCall = 100

// nextMidnight 은 다음 자정(서버 로컬)을 준다 — DayKey 가 바뀌는 시점과 같아야 한다.
func nextMidnight(t time.Time) time.Time {
	return startOfDay(t).AddDate(0, 0, 1)
}
