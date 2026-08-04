package service

import (
	"fmt"
	"testing"

	"github.com/lovecmk/eduapp/backend/internal/domain"
)

// 오늘의 출제는 이 앱의 핵심 약속이다 — "매일 3~5문제". 그 약속이 지켜지는지,
// 그리고 사람마다·날마다 달라지는지를 여기서 못박는다.

func cand(id string, d domain.Difficulty) PlanCandidate {
	return PlanCandidate{CardID: id, Difficulty: d}
}

// pool 은 난이도별로 넉넉한 후보를 만든다.
func pool(n int) []PlanCandidate {
	out := make([]PlanCandidate, 0, n*3)
	for i := 0; i < n; i++ {
		out = append(out,
			cand(fmt.Sprintf("e%02d", i), domain.Easy),
			cand(fmt.Sprintf("m%02d", i), domain.Medium),
			cand(fmt.Sprintf("h%02d", i), domain.Hard),
		)
	}
	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// ① 난이도가 개수를 정한다
// ─────────────────────────────────────────────────────────────────────────────

func TestCountFollowsDifficulty(t *testing.T) {
	cases := []struct {
		name string
		sig  LearnerSignal
		want int // 3~5
		diff domain.Difficulty
	}{
		// 기록이 없는 사람 — 쉬운 것부터, 그래서 많이(5).
		{"처음 온 사람", LearnerSignal{}, 5, domain.Easy},
		// 자주 잊는다 — 지금도 벅차다. 쉬운 쪽으로 내리고 장수는 늘린다.
		{"힘들어함", LearnerSignal{Reps: 100, Lapses: 40, AvgBox: 1}, 5, domain.Easy},
		// 보통 — 4장.
		{"보통", LearnerSignal{Reps: 100, Lapses: 25, AvgBox: 2}, 4, domain.Medium},
		// 거의 안 틀리고 오래 기억한다 — 어려운 문제로 올리고 장수는 줄인다.
		{"잘함", LearnerSignal{Reps: 100, Lapses: 5, AvgBox: 4}, 3, domain.Hard},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			plan := BuildDailyPlan("u1", "2026-7-4", tc.sig, pool(10), 3, 5)
			if plan.Difficulty != tc.diff {
				t.Errorf("난이도=%s, want %s", plan.Difficulty, tc.diff)
			}
			if plan.TargetCount != tc.want || len(plan.CardIDs) != tc.want {
				t.Errorf("출제 수=%d(카드 %d장), want %d", plan.TargetCount, len(plan.CardIDs), tc.want)
			}
		})
	}
}

// 표본이 적을 때 난이도를 올리지 않는다 — 세 번 맞힌 것은 관찰이 아니라 우연이다.
func TestSmallSampleStaysEasy(t *testing.T) {
	perfect := LearnerSignal{Reps: 5, Lapses: 0, AvgBox: 5}
	if got := TargetDifficulty(perfect); got != domain.Easy {
		t.Errorf("표본 5회에 난이도=%s, want EASY", got)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 매일 다른 문제 · 사람마다 다른 문제
// ─────────────────────────────────────────────────────────────────────────────

// 같은 날 여러 번 물어도 답은 같아야 한다 — 앱을 다시 열 때마다 문제가 바뀌면
// 그건 학습이 아니라 뽑기다.
func TestSameDayIsStable(t *testing.T) {
	a := BuildDailyPlan("u1", "2026-7-4", LearnerSignal{}, pool(10), 3, 5)
	b := BuildDailyPlan("u1", "2026-7-4", LearnerSignal{}, pool(10), 3, 5)
	if fmt.Sprint(a.CardIDs) != fmt.Sprint(b.CardIDs) {
		t.Errorf("같은 날인데 편성이 달라졌다: %v vs %v", a.CardIDs, b.CardIDs)
	}
}

// 날이 바뀌면 다른 문제가 나와야 한다.
func TestDifferentDaysDiffer(t *testing.T) {
	seenSame := 0
	const days = 10
	prev := ""
	for d := 1; d <= days; d++ {
		plan := BuildDailyPlan("u1", fmt.Sprintf("2026-7-%d", d), LearnerSignal{}, pool(20), 3, 5)
		cur := fmt.Sprint(plan.CardIDs)
		if cur == prev {
			seenSame++
		}
		prev = cur
	}
	// 후보가 60장인데 열흘 내내 같은 다섯 장이 나오면 규칙이 깨진 것이다.
	if seenSame > 1 {
		t.Errorf("연속으로 같은 편성이 %d번 나왔다 — 매일 달라야 한다", seenSame)
	}
}

// 사람이 다르면 문제도 달라야 한다 — 진도가 같다고 모두가 같은 카드를 받으면,
// 사람이 늘수록 그 획일성이 그대로 커진다.
func TestDifferentUsersDiffer(t *testing.T) {
	base := BuildDailyPlan("u1", "2026-7-4", LearnerSignal{}, pool(20), 3, 5)
	identical := 0
	const users = 20
	for i := 0; i < users; i++ {
		other := BuildDailyPlan(fmt.Sprintf("user-%d", i), "2026-7-4", LearnerSignal{}, pool(20), 3, 5)
		if fmt.Sprint(other.CardIDs) == fmt.Sprint(base.CardIDs) {
			identical++
		}
	}
	if identical > 2 {
		t.Errorf("%d명 중 %d명이 같은 편성을 받았다 — 사람마다 달라야 한다", users, identical)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ 복습이 먼저 · 편성 규칙
// ─────────────────────────────────────────────────────────────────────────────

// 복습 도래 카드가 새 카드보다 먼저 나가야 한다.
// 새 것만 쌓으면 어제 배운 것을 잊은 채 목록만 늘어난다.
func TestDueComesFirst(t *testing.T) {
	candidates := append(pool(10),
		PlanCandidate{CardID: "due-old", Difficulty: domain.Hard, Due: true, Seen: true, OverdueRank: 500},
		PlanCandidate{CardID: "due-new", Difficulty: domain.Easy, Due: true, Seen: true, OverdueRank: 10},
	)
	plan := BuildDailyPlan("u1", "2026-7-4", LearnerSignal{}, candidates, 3, 5)

	if len(plan.CardIDs) < 2 {
		t.Fatalf("편성이 너무 짧다: %v", plan.CardIDs)
	}
	// 오래 밀린 것부터 — 그 순서 자체가 정보다.
	if plan.CardIDs[0] != "due-old" || plan.CardIDs[1] != "due-new" {
		t.Errorf("복습이 먼저·오래된 순이어야 한다: %v", plan.CardIDs)
	}
}

// 후보가 목표보다 적으면 있는 만큼만 낸다(빈 자리를 억지로 채우지 않는다).
func TestFewerCandidatesThanTarget(t *testing.T) {
	plan := BuildDailyPlan("u1", "2026-7-4", LearnerSignal{}, []PlanCandidate{
		cand("only", domain.Medium),
	}, 3, 5)
	if len(plan.CardIDs) != 1 {
		t.Errorf("후보 1장인데 %d장을 냈다: %v", len(plan.CardIDs), plan.CardIDs)
	}
	// 목표 자체는 그대로 알린다 — 화면이 "1/5" 로 진도를 보여줄 수 있어야 한다.
	if plan.TargetCount != 5 {
		t.Errorf("목표=%d, want 5", plan.TargetCount)
	}
}

// 후보가 하나도 없으면 빈 편성 — 없는 카드를 만들어 내지 않는다.
func TestNoCandidates(t *testing.T) {
	plan := BuildDailyPlan("u1", "2026-7-4", LearnerSignal{}, nil, 3, 5)
	if len(plan.CardIDs) != 0 {
		t.Errorf("후보가 없는데 %v 를 냈다", plan.CardIDs)
	}
}

// 같은 카드를 두 번 내지 않는다(복습 후보와 신규 후보에 함께 들어와도).
func TestNoDuplicates(t *testing.T) {
	dup := PlanCandidate{CardID: "same", Difficulty: domain.Easy, Due: true}
	plan := BuildDailyPlan("u1", "2026-7-4", LearnerSignal{}, []PlanCandidate{
		dup, {CardID: "same", Difficulty: domain.Easy}, cand("other", domain.Easy),
	}, 3, 5)
	seen := map[string]bool{}
	for _, id := range plan.CardIDs {
		if seen[id] {
			t.Fatalf("같은 카드가 두 번 나왔다: %v", plan.CardIDs)
		}
		seen[id] = true
	}
}

// 오늘의 난이도에 맞는 카드가 없으면 가까운 난이도로 채운다 —
// 콘텐츠가 적은 초기에는 한 난이도만 남아 있는 날이 있다.
func TestFallsBackToNearestDifficulty(t *testing.T) {
	onlyHard := []PlanCandidate{
		cand("h1", domain.Hard), cand("h2", domain.Hard),
		cand("h3", domain.Hard), cand("h4", domain.Hard), cand("h5", domain.Hard),
	}
	plan := BuildDailyPlan("u1", "2026-7-4", LearnerSignal{}, onlyHard, 3, 5)
	if plan.Difficulty != domain.Easy {
		t.Fatalf("난이도 판정이 바뀌었다: %s", plan.Difficulty)
	}
	if len(plan.CardIDs) != 5 {
		t.Errorf("맞는 난이도가 없다고 빈손으로 돌려보냈다: %v", plan.CardIDs)
	}
}

// 설정 범위를 벗어난 값이 와도 '하루 3분'의 범위를 넘지 않는다.
func TestRangeIsClamped(t *testing.T) {
	plan := BuildDailyPlan("u1", "2026-7-4", LearnerSignal{}, pool(30), 0, 999)
	if plan.TargetCount < MinDailyCards || plan.TargetCount > MaxDailyCards {
		t.Errorf("출제 수=%d — %d~%d 를 벗어났다", plan.TargetCount, MinDailyCards, MaxDailyCards)
	}
	// min·max 가 뒤집혀 와도 받아들인다(설정 실수로 학습이 멈추면 안 된다).
	if got := BuildDailyPlan("u1", "2026-7-4", LearnerSignal{}, pool(30), 5, 3); got.TargetCount == 0 {
		t.Error("min>max 로 편성이 비었다")
	}
}
