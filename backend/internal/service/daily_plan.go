package service

import (
	"sort"

	"github.com/lovecmk/eduapp/backend/internal/domain"
)

// 오늘의 출제 규칙 — 이 파일이 정본이다.
//
// ── 고치기 전에 무엇이 문제였나 ─────────────────────────────────────────
// 앱은 "아직 안 배운 카드를 쉬운 순으로 정렬해서 앞에서 3장"을 잘라 썼다.
// 세 가지가 어긋나 있었다.
//
//  1. **난이도가 개수를 정하지 않았다.** 난이도는 정렬 순서만 바꿨고 개수는
//     늘 3장(+복습으로 5장까지)이었다. 어려운 문제 3장과 쉬운 문제 3장이
//     같은 분량으로 취급됐다.
//  2. **매일 같은 문제였다.** 정렬이 결정적이라 세션을 마치지 않으면 다음 날에도
//     똑같은 카드가, 똑같은 순서로 나왔다.
//  3. **모두에게 같은 문제였다.** 진도가 같으면 전 사용자가 같은 카드를 같은
//     순서로 받았다. 사람이 늘수록 이 획일성이 그대로 커진다.
//
// ── 지금의 규칙 ────────────────────────────────────────────────────────
//
//	① 오늘의 난이도를 사람마다 정한다 — 그동안의 기록(기억 상자·되돌아간 횟수)으로.
//	② 난이도가 오늘의 **출제 수**를 정한다 — 쉬우면 많이(5), 어려우면 적게(3).
//	③ 복습 도래 카드를 먼저 채우고, 남는 자리를 새 카드로 채운다.
//	④ 뽑는 순서는 (사람, 날짜) 시드로 섞는다 — 같은 날엔 늘 같은 문제,
//	   날이 바뀌면 다른 문제, 사람이 다르면 다른 문제.
//
// 규칙을 순수 함수로 떼어 둔 이유: 저장소도 HTTP 도 모르는 코드라야 "이 사람에게
// 오늘 무엇이 나가는가"를 검사로 못박을 수 있다. 앱에도 같은 규칙이 한 벌 있다
// (`src/domain/dailyPlan.ts`) — 오프라인에서 서버 없이도 같은 결과를 내야 한다.

// PlanCandidate 는 출제 후보 한 장. 서비스가 저장소에서 모아 넘겨준다.
type PlanCandidate struct {
	CardID     string
	Difficulty domain.Difficulty
	// Due 는 복습 예정이 이미 지난 카드(기억이 무너지기 직전).
	Due bool
	// Seen 은 한 번이라도 학습한 적이 있는 카드. 신규 채움에서 뒤로 민다.
	Seen bool
	// OverdueRank 는 복습이 밀린 정도(클수록 오래 방치). 복습 정렬에만 쓴다.
	OverdueRank int64
}

// LearnerSignal 은 오늘의 난이도를 정하는 데 쓰는 그 사람의 학습 기록 요약.
type LearnerSignal struct {
	// Reps 는 총 채점 횟수. 표본이 적으면 난이도를 함부로 올리지 않는다.
	Reps int
	// Lapses 는 그중 잊어서 되돌아간 횟수.
	Lapses int
	// AvgBox 는 평균 기억 상자(높을수록 오래 기억한다).
	AvgBox float64
}

// DailyPlan 은 오늘 그 사람에게 나갈 편성.
type DailyPlan struct {
	Difficulty  domain.Difficulty
	TargetCount int
	CardIDs     []string
}

// 출제 수의 한계. 이 앱의 정체성이 '하루 3분'이라, 어떤 설정으로도
// 이 범위를 벗어나지 않게 한다 — 상한을 20으로 열어 두면 그것은 다른 앱이다.
const (
	MinDailyCards = 1
	MaxDailyCards = 10
)

// countForDifficulty 는 난이도별 기본 출제 수를 정한다.
//
// 어려울수록 적게 낸다. 한 장에 드는 시간과 집중이 다르기 때문이다 —
// 어려운 문제 5장은 '하루 3분'이 아니라 '하루 10분'이고, 그러면 사람은
// 아예 열지 않는다. 쉬운 날 5장, 보통 4장, 어려운 날 3장.
func countForDifficulty(d domain.Difficulty, min, max int) int {
	var n int
	switch d {
	case domain.Easy:
		n = max // 5
	case domain.Hard:
		n = min // 3
	default:
		// 가운데 값. min·max 가 붙어 있어도(3~3) 자연스럽게 그 값이 된다.
		n = (min + max) / 2
		if (min+max)%2 == 1 {
			n++ // 3~4 는 4로 — 애매하면 한 장 더 주는 쪽이 학습에는 낫다
		}
	}
	return clampInt(n, min, max)
}

// TargetDifficulty 는 그 사람에게 오늘 맞는 난이도를 고른다.
//
// 교육앱에서 난이도는 고정 설정이 아니라 **관찰의 결과**여야 한다. 잘 따라오는
// 사람에게 계속 쉬운 문제를 내면 지루해서 떠나고, 힘들어하는 사람에게 어려운
// 문제를 내면 좌절해서 떠난다. 둘 다 이탈이라는 같은 결과로 끝난다.
//
// 판정은 보수적이다 — 표본이 적을 때는 올리지 않는다. 세 번 맞혔다고 어려운
// 문제로 올리면 그건 관찰이 아니라 우연이다.
func TargetDifficulty(sig LearnerSignal) domain.Difficulty {
	// 아직 기록이 거의 없다 — 처음 오는 사람에게는 쉬운 것부터.
	const minRepsToJudge = 12
	if sig.Reps < minRepsToJudge {
		return domain.Easy
	}

	lapseRate := float64(sig.Lapses) / float64(sig.Reps)

	// 자주 잊는다 — 지금 난이도가 이미 벅차다는 뜻이다.
	if lapseRate >= 0.35 {
		return domain.Easy
	}
	// 거의 안 틀리고 기억도 오래간다 — 한 단계 올린다.
	if lapseRate <= 0.15 && sig.AvgBox >= 3 {
		return domain.Hard
	}
	return domain.Medium
}

// BuildDailyPlan 은 오늘의 편성을 만든다.
//
// day 는 앱과 같은 날짜 키(DayKey). userID·day 가 함께 시드가 되므로
// 같은 사람이 같은 날 여러 번 물어도 결과가 같고, 날이 바뀌면 달라진다.
func BuildDailyPlan(userID, day string, sig LearnerSignal, candidates []PlanCandidate, min, max int) DailyPlan {
	min = clampInt(min, MinDailyCards, MaxDailyCards)
	max = clampInt(max, MinDailyCards, MaxDailyCards)
	if min > max {
		min, max = max, min
	}

	difficulty := TargetDifficulty(sig)
	target := countForDifficulty(difficulty, min, max)

	seed := planSeed(userID, day)

	// ① 복습 도래 카드가 먼저다.
	//
	// 새 것을 배우는 것보다 무너지려는 기억을 붙잡는 것이 먼저다. 복습을 뒤로
	// 밀면 어제 배운 것을 잊은 채로 새 것만 쌓여, 아는 것은 늘지 않고 목록만 는다.
	// 여기만 섞지 않는다 — 오래 밀린 것부터라는 순서 자체가 정보다.
	var due, fresh []PlanCandidate
	for _, c := range candidates {
		if c.Due {
			due = append(due, c)
		} else {
			fresh = append(fresh, c)
		}
	}
	sort.SliceStable(due, func(i, j int) bool {
		if due[i].OverdueRank == due[j].OverdueRank {
			return due[i].CardID < due[j].CardID
		}
		return due[i].OverdueRank > due[j].OverdueRank
	})

	// ② 새 카드는 '오늘의 난이도'에 맞는 것을 앞세우되, 그 안에서는 섞는다.
	//
	// 난이도만으로 정렬하면 같은 난이도 안에서 순서가 고정되어 모든 사용자가
	// 같은 카드를 같은 순서로 받는다. 시드 섞기가 그 획일성을 끊는다.
	fresh = shuffleBySeed(fresh, seed)
	sort.SliceStable(fresh, func(i, j int) bool {
		return freshRank(fresh[i], difficulty) < freshRank(fresh[j], difficulty)
	})

	ids := make([]string, 0, target)
	seen := map[string]bool{}
	for _, c := range append(due, fresh...) {
		if len(ids) >= target {
			break
		}
		if seen[c.CardID] {
			continue
		}
		seen[c.CardID] = true
		ids = append(ids, c.CardID)
	}

	return DailyPlan{Difficulty: difficulty, TargetCount: target, CardIDs: ids}
}

// freshRank 는 새 카드의 우선순위. 작을수록 먼저 나간다.
//
// 오늘의 난이도와 정확히 맞는 것이 1순위, 한 단계 차이가 2순위, 두 단계가 3순위.
// 맞는 난이도가 모자랄 때 빈손으로 돌려보내지 않기 위해서다 — 콘텐츠가 적은
// 초기에는 '어려움'만 남아 있는 날도 있다.
// 같은 순위 안에서는 아직 한 번도 안 본 카드를 앞세운다.
func freshRank(c PlanCandidate, target domain.Difficulty) int {
	gap := diffRank(c.Difficulty) - diffRank(target)
	if gap < 0 {
		gap = -gap
	}
	rank := gap * 2
	if c.Seen {
		rank++
	}
	return rank
}

// planSeed 는 (사람, 날짜) 로 시드를 만든다(FNV-1a).
//
// 무작위(rand)를 쓰지 않는 이유 — 앱을 다시 열 때마다 오늘의 문제가 바뀌면
// 학습이 아니라 뽑기다. 같은 날 같은 사람에게는 항상 같은 답이 나와야 한다.
func planSeed(userID, day string) uint64 {
	var h uint64 = 14695981039346656037
	for _, part := range []string{userID, "|", day} {
		for i := 0; i < len(part); i++ {
			h ^= uint64(part[i])
			h *= 1099511628211
		}
	}
	return h
}

// shuffleBySeed 는 시드로 결정적으로 섞는다(Fisher–Yates + xorshift64*).
func shuffleBySeed(in []PlanCandidate, seed uint64) []PlanCandidate {
	out := make([]PlanCandidate, len(in))
	copy(out, in)
	// 순서를 먼저 고정한다 — 저장소가 주는 순서에 기대면 같은 시드로도
	// 실행마다 다른 결과가 나온다(맵 순회는 순서가 없다).
	sort.Slice(out, func(i, j int) bool { return out[i].CardID < out[j].CardID })

	state := seed
	if state == 0 {
		state = 1 // xorshift 는 0 에서 영원히 0 이다
	}
	next := func() uint64 {
		state ^= state >> 12
		state ^= state << 25
		state ^= state >> 27
		return state * 2685821657736338717
	}
	for i := len(out) - 1; i > 0; i-- {
		j := int(next() % uint64(i+1))
		out[i], out[j] = out[j], out[i]
	}
	return out
}
