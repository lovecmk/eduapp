package memory

import (
	"context"
	"sort"

	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// 인메모리 분석 읽기 — ports.InsightRepository 구현.
//
// 같은 UserDataRepo 위에 얹는다. 분석용 사본을 따로 두면 두 벌이 어긋나서
// "앱에는 있는데 대시보드에는 없는" 상태가 생긴다.
//
// 정렬을 붙이는 것이 중요하다. 맵 순회는 순서가 무작위라, 정렬하지 않으면
// 같은 데이터로 두 번 물었을 때 순위표가 매번 뒤바뀐다.

// CardLearning 은 카드별 학습 집계를 카드 id 순으로 준다.
func (r *UserDataRepo) CardLearning(_ context.Context) ([]ports.CardLearningStat, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	type acc struct {
		learners, reps, lapses, mastered int64
		easeSum, boxSum                  float64
	}
	byCard := map[string]*acc{}
	for _, s := range r.srs {
		a := byCard[s.CardID]
		if a == nil {
			a = &acc{}
			byCard[s.CardID] = a
		}
		a.learners++
		a.reps += int64(s.Reps)
		a.lapses += int64(s.Lapses)
		a.easeSum += s.Ease
		a.boxSum += float64(s.Box)
		if s.Box >= masteredBox {
			a.mastered++
		}
	}

	out := make([]ports.CardLearningStat, 0, len(byCard))
	for cardID, a := range byCard {
		out = append(out, ports.CardLearningStat{
			CardID:   cardID,
			Learners: a.learners,
			Reps:     a.reps,
			Lapses:   a.lapses,
			AvgEase:  safeDiv(a.easeSum, float64(a.learners)),
			AvgBox:   safeDiv(a.boxSum, float64(a.learners)),
			Mastered: a.mastered,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CardID < out[j].CardID })
	return out, nil
}

// LearnerLearning 은 사용자별 학습 집계를 사용자 id 순으로 준다.
func (r *UserDataRepo) LearnerLearning(_ context.Context) ([]ports.LearnerStat, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	byUser := map[string]*ports.LearnerStat{}
	boxSum := map[string]float64{}
	for _, s := range r.srs {
		u := byUser[s.UserID]
		if u == nil {
			u = &ports.LearnerStat{UserID: s.UserID}
			byUser[s.UserID] = u
		}
		u.Cards++
		u.Reps += int64(s.Reps)
		u.Lapses += int64(s.Lapses)
		boxSum[s.UserID] += float64(s.Box)
		if s.LastReviewedAt != nil && s.LastReviewedAt.After(u.LastSeen) {
			u.LastSeen = *s.LastReviewedAt
		}
	}

	out := make([]ports.LearnerStat, 0, len(byUser))
	for id, u := range byUser {
		u.AvgBox = safeDiv(boxSum[id], float64(u.Cards))
		out = append(out, *u)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UserID < out[j].UserID })
	return out, nil
}

// ActiveUserDays 는 (사용자, 날짜) 활동 쌍을 준다.
func (r *UserDataRepo) ActiveUserDays(_ context.Context) ([]ports.UserDay, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := []ports.UserDay{}
	for userID, days := range r.history {
		for day := range days {
			out = append(out, ports.UserDay{UserID: userID, DayKey: day})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].UserID != out[j].UserID {
			return out[i].UserID < out[j].UserID
		}
		return out[i].DayKey < out[j].DayKey
	})
	return out, nil
}

// masteredBox 는 '충분히 익혔다'고 보는 기억 상자 기준.
// 앱의 간격반복(src/domain/srs.ts)에서 상자 4 는 16일 간격이라, 여기까지 오면
// 한 달 가까이 기억이 유지된다는 뜻이다.
const masteredBox = 4

func safeDiv(sum, n float64) float64 {
	if n == 0 {
		return 0
	}
	return sum / n
}
