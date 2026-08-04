package service

import (
	"context"
	"sync"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// InsightService 는 저장소에서 원재료를 모아 분석 엔진(insight.go)에 넘긴다.
//
// 계산은 전부 순수 함수 쪽에 있고 여기는 '모으기'와 '캐시'만 한다.
// 그래서 분석 규칙을 고칠 때 저장소를 몰라도 되고, 표로 검증할 수 있다.
type InsightService struct {
	users   ports.UserRepository
	cards   ports.CardRepository
	data    ports.UserDataRepository
	insight ports.InsightRepository
	now     func() time.Time

	// 캐시 — 분석은 전체 스캔이라 비싸다.
	//
	// 관리 콘솔은 새로고침이 잦고 여러 명이 동시에 본다. 매번 다시 계산하면
	// 대시보드를 여는 것만으로 저장소에 부하가 몰린다. 반면 이 수치들은 초 단위로
	// 바뀌지 않는다(일별 활동·코호트·난이도). 그래서 짧게 캐시한다.
	mu       sync.Mutex
	cached   *Insight
	cachedAt time.Time
	ttl      time.Duration
}

// insightTTL 은 분석 결과를 재사용하는 시간.
// 60초면 연속 새로고침은 흡수하면서, 운영 중 변화를 놓쳤다고 느낄 만큼 길지도 않다.
const insightTTL = 60 * time.Second

// NewInsightService 는 분석 서비스를 만든다.
// insight 가 nil 이면(저장소가 분석 읽기를 지원하지 않으면) 빈 결과를 돌려준다.
func NewInsightService(
	users ports.UserRepository,
	cards ports.CardRepository,
	data ports.UserDataRepository,
	insight ports.InsightRepository,
) *InsightService {
	return &InsightService{
		users: users, cards: cards, data: data, insight: insight,
		now: time.Now, ttl: insightTTL,
	}
}

// Available 은 분석을 계산할 수 있는 상태인지 알려 준다.
// 라우팅에서 이 값을 보고 없는 기능을 노출하지 않는다.
func (s *InsightService) Available() bool {
	return s != nil && s.insight != nil && s.users != nil && s.cards != nil
}

// Insight 는 분석 결과를 준다(짧은 캐시 적용).
func (s *InsightService) Insight(ctx context.Context) (*Insight, error) {
	if !s.Available() {
		return nil, ErrInvalidInput{Reason: "이 저장소에서는 분석을 사용할 수 없습니다"}
	}

	s.mu.Lock()
	if s.cached != nil && s.now().Sub(s.cachedAt) < s.ttl {
		out := *s.cached
		s.mu.Unlock()
		return &out, nil
	}
	s.mu.Unlock()

	built, err := s.build(ctx)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.cached, s.cachedAt = built, s.now()
	s.mu.Unlock()
	return built, nil
}

// Invalidate 는 캐시를 버린다(문제를 고친 뒤 바로 반영해 보고 싶을 때).
func (s *InsightService) Invalidate() {
	if s == nil {
		return
	}
	s.mu.Lock()
	s.cached = nil
	s.mu.Unlock()
}

func (s *InsightService) build(ctx context.Context) (*Insight, error) {
	in := InsightInput{Now: s.now()}

	// 사용자 목록은 페이지 단위 API 밖에 없다. 분석은 전수가 필요하므로
	// 넉넉한 한도로 한 번에 받는다(관리 콘솔 목록과 달리 잘라 보면 안 된다 —
	// 절반만 가지고 계산한 도입률은 틀린 값이지 근사값이 아니다).
	users, _, err := s.users.List(ctx, ports.UserQuery{Limit: maxInsightUsers})
	if err != nil {
		return nil, err
	}
	in.Users = users

	cards, err := s.cards.AllCards(ctx)
	if err != nil {
		return nil, err
	}
	in.Cards = cards

	if in.CardStat, err = s.insight.CardLearning(ctx); err != nil {
		return nil, err
	}
	if in.Learners, err = s.insight.LearnerLearning(ctx); err != nil {
		return nil, err
	}
	if in.UserDays, err = s.insight.ActiveUserDays(ctx); err != nil {
		return nil, err
	}

	// 신고는 없어도 분석 전체를 막을 이유가 없다 — 분야별 신고 수만 비게 둔다.
	if s.data != nil {
		if reports, err := s.data.ListReports(ctx, ports.ReportQuery{Limit: maxReportLimit}); err == nil {
			in.Reports = reports
		}
	}

	out := BuildInsight(in)
	return &out, nil
}

// maxInsightUsers 는 분석이 한 번에 훑는 최대 사용자 수.
// 이 선을 넘으면 도입률·퍼널이 전수가 아니게 되므로, 넘길 때는 집계를
// 저장소로 내려야 한다(지금 규모에서는 한참 여유가 있다).
const maxInsightUsers = 100_000

// Learner 는 학습자 한 명의 진단을 만든다(코칭용).
//
// 캐시하지 않는다. 전체 분석과 달리 한 사람만 보므로 가볍고, 무엇보다
// 관리자가 이 화면을 여는 시점은 대개 "방금 무슨 일이 있었나"를 확인할 때다.
// 그때 1분 전 값을 보여 주면 확인하러 온 목적 자체가 사라진다.
func (s *InsightService) Learner(ctx context.Context, userID string) (*LearnerDiagnosis, error) {
	if !s.Available() || s.data == nil {
		return nil, ErrInvalidInput{Reason: "이 저장소에서는 분석을 사용할 수 없습니다"}
	}

	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// 이 사람의 학습 상태는 앱이 쓰는 것과 **같은 경로**로 읽는다.
	// 분석 전용 조회를 따로 만들면 두 벌이 어긋나서, 화면과 앱이 서로 다른
	// 진행도를 보여 주게 된다.
	snap, err := s.data.LoadSync(ctx, userID)
	if err != nil {
		return nil, err
	}

	cards, err := s.cards.AllCards(ctx)
	if err != nil {
		return nil, err
	}

	peers, err := s.insight.CardLearning(ctx)
	if err != nil {
		return nil, err
	}

	days := make(map[string]struct{}, len(snap.History))
	for day := range snap.History {
		days[day] = struct{}{}
	}

	out := BuildLearnerDiagnosis(LearnerInput{
		Now:       s.now(),
		User:      *u,
		States:    snap.Cards,
		Days:      days,
		Cards:     cards,
		PeerStats: indexCardStats(peers),
	})
	return &out, nil
}
