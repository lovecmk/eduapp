package service

import (
	"fmt"
	"sort"
	"strings"
)

// 교육 처방 — "이 사람에게 무엇을, 왜 가르쳐야 하는가."
//
// ── 이 파일의 존재 이유 ────────────────────────────────────────────────────
// 진단(learner.go)은 "무엇이 약한가"까지 답한다. 거기서 멈추면 교육은 시작되지
// 않는다. 관리자가 실제로 움직이려면 세 가지가 **한 덩어리로** 붙어 있어야 한다:
//
//   ① 무엇을   — 구체적인 교육 단위(이 분야, 이 문제 여덟 장)
//   ② 왜 이 사람인가 — 근거. 관측값 · 비교 대상 · 표본 · 적용한 규칙까지.
//   ③ 무엇이 달라지는가 — 이 교육을 하면 기대되는 변화
//
// 셋 중 ②가 빠지면 처방은 지시가 된다. 현장의 안전교육에서 지시는 거부되거나,
// 더 나쁘게는 형식적으로 소화된다. "왜 나만 이걸 또 들어야 하느냐"에 답할 수
// 없는 교육은 시간만 쓴다. 그래서 여기서는 **근거 없는 처방을 만들지 않는다** —
// 근거가 모자라면 처방 자체를 내지 않고 빠진다. 빈칸이 틀린 처방보다 낫다.
//
// 규칙은 전부 순수 함수다. 저장소도 시계도 보지 않고 진단 결과만 본다.
// 그래서 "이 처방이 왜 나왔는가"를 표로 재현할 수 있다.

const (
	// prescriptionMinReps 는 분야 처방을 내기 위한 최소 시도 횟수.
	// 세 번 풀어 본 분야의 실패율은 그날 컨디션이지 실력이 아니다.
	prescriptionMinReps = 6

	// prescriptionMinCards 는 분야 처방을 내기 위한 최소 문제 수.
	// 한두 장으로 '이 분야가 약하다'고 말하면 그 분야 전체를 오해하게 된다.
	prescriptionMinCards = 3

	// coachMinutesPerCard 는 오답 한 장을 설명하는 데 잡는 시간(분).
	// 현장 코칭 경험치다. 이 값이 있어야 관리자가 "오늘 이만큼은 할 수 있다"를
	// 판단한다 — 소요 시간을 모르면 목록이 아무리 정확해도 미뤄진다.
	coachMinutesPerCard = 3

	// maxPrescriptions 는 한 사람에게 동시에 내는 처방의 상한.
	// 여섯 개를 넘기면 우선순위가 사라지고, 우선순위가 없는 목록은 안 읽힌다.
	maxPrescriptions = 6

	// maxCardsPerPrescription 은 처방 하나가 지목하는 문제 수.
	// 한 자리에서 다룰 수 있는 양을 넘기면 "다음에 하자"가 된다.
	maxCardsPerPrescription = 8
)

// EvidenceStrength 는 근거 하나의 세기.
//
//	strong   — 표본이 충분하고 또래 비교까지 된 관측
//	moderate — 관측은 분명하나 비교 대상이나 표본이 아쉬움
//	weak     — 정황. 단독으로는 처방의 근거가 되지 못한다
type EvidenceStrength = string

// Evidence 는 처방 하나를 뒷받침하는 근거 한 줄.
//
// 근거는 "실패율이 높다" 같은 인상이 아니라 **재현 가능한 관측**이어야 한다.
// 그래서 다섯 가지를 함께 싣는다:
//
//	Fact     무엇을 관측했나
//	Observed 이 사람의 값
//	Compared 무엇과 견줬나 — 비교 대상이 없으면 숫자는 아무 말도 하지 않는다
//	Sample   그 비교의 표본 — 표본이 작으면 결론을 내리면 안 된다
//	Rule     어떤 기준선을 넘었기에 처방이 됐나
//
// 이 다섯이 있으면 관리자는 처방을 **검증**할 수 있고, 필요하면 반박할 수도 있다.
// 검증할 수 없는 추천은 결국 아무도 따르지 않는다.
type Evidence struct {
	Fact     string `json:"fact"`
	Observed string `json:"observed"`
	Compared string `json:"compared,omitempty"`
	Sample   string `json:"sample,omitempty"`
	Rule     string `json:"rule"`
	// Source 는 이 수치가 어느 기록에서 나왔는지 — 관리자가 원본을 찾아갈 수 있어야 한다.
	Source   string           `json:"source"`
	Strength EvidenceStrength `json:"strength"`
}

// PrescribedCard 는 처방이 지목하는 문제 한 장.
// 왜 이 문제가 뽑혔는지(Reason)를 함께 싣는다 — 목록만 주면 순서의 뜻이 사라진다.
type PrescribedCard struct {
	CardID     string `json:"card_id"`
	Title      string `json:"title"`
	Category   string `json:"category"`
	Difficulty string `json:"difficulty"`
	Reason     string `json:"reason"`
}

// Prescription 은 교육 처방 하나.
type Prescription struct {
	// ID 는 처방의 안정 키(화면에서 접기·완료 표시를 기억하는 데 쓴다).
	ID   string `json:"id"`
	Rank int    `json:"rank"`
	// Priority: now(이번 주) | soon(이번 달) | later(여유 있을 때)
	Priority string `json:"priority"`
	// Kind: onboarding | engagement | category | cards | retention | content
	Kind  string `json:"kind"`
	Title string `json:"title"`
	// Target 은 교육의 범위를 한 마디로("'전기' 분야 오답 6장").
	Target string `json:"target"`
	// Why 는 **왜 이 사람이** 이 교육을 받아야 하는가. 근거를 문장으로 압축한 것.
	Why string `json:"why"`
	// Action 은 관리자가 실제로 할 일. 동사로 끝난다.
	Action string `json:"action"`
	// Expect 는 이 교육으로 기대되는 변화 — 나중에 검증할 수 있는 형태로.
	Expect string `json:"expect"`
	// Minutes 는 예상 소요 시간(분).
	Minutes int `json:"minutes"`
	// Score 는 우선순위 점수(영향 × 확신). 정렬에만 쓴다.
	Score float64 `json:"score"`
	// Confidence: high | medium | low — 근거들의 세기를 종합한 값.
	Confidence string           `json:"confidence"`
	Evidence   []Evidence       `json:"evidence"`
	Cards      []PrescribedCard `json:"cards"`
}

// buildPrescriptions 는 진단 결과에서 교육 처방을 뽑는다.
//
// 입력으로 진단(d)을 받는 이유: 화면에 보이는 표와 처방이 **같은 계산**에서
// 나와야 한다. 처방만 따로 계산하면 "표에는 약점이 없다는데 처방은 있다"는
// 상태가 생기고, 그 순간 관리자는 둘 다 믿지 않게 된다.
func buildPrescriptions(d LearnerDiagnosis, in LearnerInput) []Prescription {
	out := []Prescription{}

	// 순서에 의미가 있다. 아래 규칙들은 '교육이 성립하기 위한 선행 조건'부터
	// 검사한다 — 오지 않는 사람에게 무엇을 가르칠지 정하는 것은 순서가 틀렸다.
	if p, ok := prescribeOnboarding(d, in); ok {
		out = append(out, p)
	}
	if p, ok := prescribeEngagement(d); ok {
		out = append(out, p)
	}
	cats := prescribeCategories(d)
	out = append(out, cats...)
	// 분야 처방이 이미 데려간 문제는 낱장 코칭에서 뺀다.
	// 겹치면 같은 여섯 장이 두 처방에 나란히 뜨고, 소요 시간도 두 번 더해진다.
	// 담당자는 그걸 보고 "48분짜리 일"로 읽지만 실제로는 한 가지 일이다.
	if p, ok := prescribePersonalCards(d, coveredCards(cats)); ok {
		out = append(out, p)
	}
	// 복습 주기 처방은 '내용은 아는데 남지 않는다'고 주장한다. 약한 분야가
	// 이미 잡혀 있으면 그 주장은 사실이 아니다 — 숙달률이 낮은 이유가 바로
	// 그 분야를 계속 틀려서이기 때문이다. 근거가 서지 않는 처방은 내지 않는다.
	if p, ok := prescribeRetention(d, len(cats) > 0); ok {
		out = append(out, p)
	}
	if p, ok := prescribeContentFix(d); ok {
		out = append(out, p)
	}

	// 점수 내림차순. 같으면 제목순으로 고정해 같은 입력이 같은 순서를 낸다.
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Score != out[j].Score {
			return out[i].Score > out[j].Score
		}
		return out[i].Title < out[j].Title
	})
	if len(out) > maxPrescriptions {
		out = out[:maxPrescriptions]
	}
	for i := range out {
		out[i].Rank = i + 1
		out[i].Confidence = foldConfidence(out[i].Evidence)
	}
	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. 시작하지 않은 사람 — 내용 이전에 진입이 문제다
// ─────────────────────────────────────────────────────────────────────────────

func prescribeOnboarding(d LearnerDiagnosis, in LearnerInput) (Prescription, bool) {
	if d.Summary.Cards > 0 {
		return Prescription{}, false
	}

	since := ""
	strength := EvidenceStrength("moderate")
	if !in.User.CreatedAt.IsZero() {
		days := daysAway(in.Now, in.User.CreatedAt)
		since = fmt.Sprintf("가입 후 %d일", days)
		// 가입한 지 얼마 안 됐으면 아직 '안 하는 사람'이라고 부를 수 없다.
		if days >= 7 {
			strength = "strong"
		}
	}

	ev := []Evidence{{
		Fact:     "가입 이후 학습 기록이 한 건도 없습니다",
		Observed: "푼 문제 0장 · 학습한 날 0일",
		Compared: since,
		Rule:     "학습 기록이 하나도 없으면 무엇이 부족한지 판단할 수 없습니다 — 먼저 시작하게 하는 것이 순서입니다",
		Source:   "앱 학습 기록(문제별 채점 이력)",
		Strength: strength,
	}}

	return Prescription{
		ID: "onboarding", Priority: "now", Kind: "onboarding",
		Title:  "첫 학습 진입 안내",
		Target: "앱 설치·로그인·첫 문제 1장",
		Why: "무엇이 부족한지 판단할 자료가 아직 없습니다. 잘해서가 아니라 " +
			"학습 기록이 하나도 없어서입니다. 이 상태에서 교육을 배정하면 근거 없이 배정하는 것이 됩니다.",
		Action:  "설치·로그인 상태를 확인하고, 옆에서 첫 문제 한 장을 함께 풀어 주세요.",
		Expect:  "첫 학습 기록이 남으면 다음부터 어느 분야가 부족한지 근거와 함께 알려 드릴 수 있습니다.",
		Minutes: 10,
		Score:   90,
		// 점수 90 — 미측정은 '약점 없음'이 아니다. 다른 모든 처방의 선행 조건이라 높게 둔다.
		Evidence: ev,
		Cards:    []PrescribedCard{},
	}, true
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 끊긴 사람 — 무엇을 가르치든 오지 않으면 소용없다
// ─────────────────────────────────────────────────────────────────────────────

func prescribeEngagement(d LearnerDiagnosis) (Prescription, bool) {
	away := d.Summary.DaysAway
	if d.Summary.Cards == 0 || away < churnWarnDays {
		return Prescription{}, false
	}

	priority, score := "soon", 60.0
	if away >= churnRiskDays {
		priority, score = "now", 85.0
	}

	awayTxt := fmt.Sprintf("%d일째 학습 없음", away)
	if away >= 9999 {
		awayTxt = "마지막 학습 시점 기록 없음"
	}

	ev := []Evidence{
		{
			Fact:     "마지막 학습 이후 너무 오래 지났습니다",
			Observed: awayTxt,
			Rule: fmt.Sprintf("%d일이 지나면 학습 습관이 끊기기 시작하고, %d일을 넘기면 대부분 돌아오지 않습니다",
				churnWarnDays, churnRiskDays),
			Source:   "앱 학습 기록의 마지막 접속 시각",
			Strength: "strong",
		},
		{
			Fact:     "그동안 쌓아 둔 학습량이 있어 되돌릴 값어치가 큽니다",
			Observed: fmt.Sprintf("누적 %d장 · 학습한 날 %d일", d.Summary.Cards, d.Summary.ActiveDays),
			Rule:     "이미 배운 것이 많을수록 돌아왔을 때 회복이 빠릅니다 — 새로 가르치는 것보다 손이 덜 갑니다",
			Source:   "앱 학습 기록",
			Strength: evidenceStrengthBySample(d.Summary.Cards, 10, 30),
		},
	}
	if !d.Summary.Habitual {
		ev = append(ev, Evidence{
			Fact:     "중단 이전에도 학습이 규칙적이지 않았습니다",
			Observed: fmt.Sprintf("최근 %d일 중 학습한 날이 %d일이 안 됩니다", habitWindowDays, habitActiveDays),
			Rule:     fmt.Sprintf("%d일 중 %d일 이상 학습하면 습관이 잡힌 것으로 봅니다", habitWindowDays, habitActiveDays),
			Source:   "날짜별 학습 기록",
			Strength: "moderate",
		})
	}

	return Prescription{
		ID: "engagement", Priority: priority, Kind: "engagement",
		Title:  "학습 복귀 유도",
		Target: "내용 교육 이전의 복귀 접촉",
		Why: "약점을 아무리 정확히 짚어도 학습 화면에 오지 않으면 전달되지 않습니다. " +
			"이 사람은 이미 쌓아 둔 학습량이 있어, 새로 가르치는 것보다 되돌리는 편이 비용이 낮습니다.",
		Action:  "복귀 알림을 보내고, 짧은 분량(3장)으로 재시작 목표를 낮춰 잡아 주세요.",
		Expect:  "7일 안에 학습일이 한 번이라도 생기면 이후 분야 처방을 정상 배정할 수 있습니다.",
		Minutes: 5,
		Score:   score,
		// 이 처방은 다른 처방의 전달 조건이다. 그래서 분야 처방보다 위에 온다.
		Evidence: ev,
		Cards:    []PrescribedCard{},
	}, true
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 분야 재교육 — 낱장 코칭보다 묶어 가르치는 편이 빠른 경우
// ─────────────────────────────────────────────────────────────────────────────

func prescribeCategories(d LearnerDiagnosis) []Prescription {
	out := []Prescription{}
	for _, w := range d.Weakness {
		// 이 분야가 '이 사람의 약점'이라고 판정된 것만 처방한다.
		// shared(다들 어려움)는 사람이 아니라 콘텐츠 쪽 일이다.
		if w.Verdict != "weak" {
			continue
		}
		// 표본이 모자라면 처방하지 않는다. 근거가 약한 처방은 내지 않는 편이 낫다.
		if w.Reps < prescriptionMinReps || w.Cards < prescriptionMinCards {
			continue
		}

		cards := cardsForCategory(d.Missed, w.Category)

		ev := []Evidence{
			{
				Fact:     fmt.Sprintf("'%s' 분야에서만 %s보다 뚜렷하게 더 틀립니다", w.Category, peerWord),
				Observed: fmt.Sprintf("이 사람이 %s %s", missWord, pctText(w.LapseRate)),
				Compared: fmt.Sprintf("%s은 %s", peerLongWord, pctText(w.PeerRate)),
				Sample: fmt.Sprintf("이 분야에서 이 사람이 푼 문제 %d장 · 시도 %d회",
					w.Cards, w.Reps),
				Rule: fmt.Sprintf("%s보다 %s 틀리면 이 사람의 약점으로 봅니다(지금은 %s)",
					peerWord, gapText(personalGapThreshold), gapText(w.Gap)),
				Source:   "문제별 채점 이력 + 같은 문제를 푼 전체 직원 집계",
				Strength: evidenceStrengthBySample(w.Reps, prescriptionMinReps, 20),
			},
			{
				Fact:     "이 분야에 어려운 문제만 몰려 있어서 생긴 결과는 아닙니다",
				Observed: fmt.Sprintf("같은 문제에서 %s은 %s만 틀립니다", peerWord, pctText(w.PeerRate)),
				Rule: fmt.Sprintf("%s도 %s 이상 틀리는 문제는 '모두 어려워하는 문제'로 보고 개인 교육 대상에서 뺍니다",
					peerWord, pctText(sharedDifficultyRate)),
				Source:   "같은 문제를 푼 전체 직원 집계",
				Strength: "strong",
			},
		}
		if len(cards) > 0 {
			ev = append(ev, Evidence{
				Fact:     "반복해서 틀린 문제가 이 분야에 몰려 있습니다",
				Observed: fmt.Sprintf("이 분야에서 틀린 문제 %d장", len(cards)),
				Rule:     "여기저기 흩어진 게 아니라 한 분야에 몰려 있으면 그 분야의 원리를 모르는 것으로 봅니다",
				Source:   "문제별 채점 이력",
				Strength: evidenceStrengthBySample(int64(len(cards)), 2, 5),
			})
		}

		// 영향 점수 = 격차의 크기 × 이 분야에 들인 학습량.
		// 격차가 커도 두 장짜리 분야면 교육 효과가 작다.
		score := w.Gap*100 + float64(w.Cards)

		out = append(out, Prescription{
			ID:       "category:" + w.Category,
			Priority: priorityByGap(w.Gap),
			Kind:     "category",
			Title:    fmt.Sprintf("'%s' 분야 재교육", w.Category),
			Target:   fmt.Sprintf("'%s' 분야 · 틀린 문제 %d장 포함 %d장", w.Category, len(cards), w.Cards),
			Why:      whyCategory(w),
			Action: fmt.Sprintf(
				"'%s' 분야를 문제 하나씩이 아니라 원리 중심으로 30분 교육하고, 끝난 뒤 아래 문제를 다시 풀게 하세요.",
				w.Category),
			Expect: fmt.Sprintf(
				"2주 뒤 이 화면을 다시 열어, 이 분야에서 틀리는 비율이 %s(%s 수준)에 가까워졌는지 보면 됩니다.",
				pctText(w.PeerRate), peerWord),
			Minutes:  30,
			Score:    score,
			Evidence: ev,
			Cards:    cards,
		})
	}
	return out
}

// whyCategory 는 "왜 이 사람이 이 분야 교육을 받아야 하는가"를 한 문단으로 만든다.
//
// 차이를 **두 가지 방법으로** 말한다. 17%와 75%는 '58%포인트 더'이기도 하고
// '4.4배'이기도 한데, 퍼센트포인트가 낯선 사람에게는 뒤엣것이 훨씬 빨리 와닿는다.
// 배수가 성립하지 않는 구간(기준이 0 이거나 차이가 미미하거나 지나치게 큼)에서는
// 억지로 만들지 않고 뺀다 — 잘못된 비유는 없느니만 못하다.
func whyCategory(w CategoryWeakness) string {
	scale := ""
	if times := timesText(w.LapseRate, w.PeerRate); times != "" {
		scale = fmt.Sprintf(" %s 더 틀리는 셈입니다.", times)
	}
	return fmt.Sprintf(
		"같은 문제를 푼 %s은 %s만 틀리는데 이 사람은 %s를 틀립니다.%s "+
			"문제가 어려워서가 아니라 이 분야의 내용을 잘못 알고 있을 가능성이 큽니다.",
		peerWord, pctText(w.PeerRate), pctText(w.LapseRate), scale)
}

// cardsForCategory 는 그 분야에서 **이 사람만 어려워하는** 오답을 고른다.
// shared(다들 틀리는 문제)를 섞으면 개인 코칭 시간이 콘텐츠 문제로 새어 나간다.
func cardsForCategory(missed []MissedCard, category string) []PrescribedCard {
	out := []PrescribedCard{}
	for _, m := range missed {
		if m.Category != category || m.Signal == "shared" {
			continue
		}
		out = append(out, toPrescribedCard(m))
		if len(out) >= maxCardsPerPrescription {
			break
		}
	}
	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 개별 문제 코칭 — 분야로 묶이지 않는 낱장 약점
// ─────────────────────────────────────────────────────────────────────────────

// coveredCards 는 이미 분야 처방에 실린 문제 id 를 모은다.
func coveredCards(ps []Prescription) map[string]struct{} {
	out := map[string]struct{}{}
	for _, p := range ps {
		for _, c := range p.Cards {
			out[c.CardID] = struct{}{}
		}
	}
	return out
}

func prescribePersonalCards(d LearnerDiagnosis, covered map[string]struct{}) (Prescription, bool) {
	cards := []PrescribedCard{}
	var worstGap float64
	var totalReps int64
	for _, m := range d.Missed {
		if m.Signal != "personal" {
			continue
		}
		// 분야 재교육이 이미 다루는 문제는 여기서 또 세지 않는다.
		if _, dup := covered[m.CardID]; dup {
			continue
		}
		totalReps += m.Reps
		if gap := m.LapseRate - m.PeerRate; gap > worstGap {
			worstGap = gap
		}
		if len(cards) < maxCardsPerPrescription {
			cards = append(cards, toPrescribedCard(m))
		}
	}
	if len(cards) == 0 {
		return Prescription{}, false
	}

	first := cards[0]
	ev := []Evidence{
		{
			Fact:     fmt.Sprintf("%s은 대체로 맞히는 문제를 반복해서 틀립니다", peerWord),
			Observed: fmt.Sprintf("해당 문제 %d장 · 가장 큰 차이는 %s", len(cards), gapText(worstGap)),
			Compared: fmt.Sprintf("%s이 틀린 비율", peerLongWord),
			Sample: fmt.Sprintf("한 문제당 %d명 이상과 비교 · 이 사람의 시도 %d회",
				minPeersForComparison, totalReps),
			Rule: fmt.Sprintf("%s은 %s 미만으로 틀리는 문제인데 이 사람만 %s 틀리면 개인 약점으로 봅니다",
				peerWord, pctText(sharedDifficultyRate), gapText(personalGapThreshold)),
			Source:   "문제별 채점 이력 + 같은 문제를 푼 전체 직원 집계",
			Strength: "strong",
		},
		{
			Fact:     "정답과 해설이 이미 준비돼 있어 따로 자료를 만들 필요가 없습니다",
			Observed: fmt.Sprintf("예: %s", first.Title),
			Rule:     "문제·정답·해설을 한 화면에서 볼 수 있으면 준비 시간 때문에 교육이 미뤄지지 않습니다",
			Source:   "학습 문제 내용(문제·정답·해설)",
			Strength: "moderate",
		},
	}

	return Prescription{
		ID: "cards:personal", Priority: "now", Kind: "cards",
		Title:  fmt.Sprintf("틀린 문제 %d장 개별 설명", len(cards)),
		Target: fmt.Sprintf("%s은 맞히는데 이 사람만 틀리는 문제", peerWord),
		Why: fmt.Sprintf(
			"이 문제들은 어려워서 틀린 것이 아닙니다. 같은 문제를 %s은 대체로 맞힙니다. "+
				"특정 내용이나 절차를 잘못 알고 있을 가능성이 높아, 한 번 설명하면 바로잡히는 경우가 많습니다.",
			peerWord),
		Action:  "아래 문제를 하나씩 열어 정답과 해설을 설명하고, 그 자리에서 다시 풀게 하세요.",
		Expect:  "다음에 같은 문제를 다시 틀리지 않으면 바로잡힌 것입니다. 계속 틀리면 분야 교육으로 올리세요.",
		Minutes: len(cards) * coachMinutesPerCard,
		// 개인 약점은 교육 효과가 가장 확실한 자리다 — 기본 점수를 높게 둔다.
		Score:    70 + float64(len(cards))*2,
		Evidence: ev,
		Cards:    cards,
	}, true
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. 복습 주기 — 배우긴 했는데 남지 않는 경우
// ─────────────────────────────────────────────────────────────────────────────

// prescribeRetention 은 '배우긴 했는데 남지 않는' 패턴을 처방한다.
//
// contentGapFound 가 참이면 내지 않는다. 이 처방의 근거는 "내용은 아는데
// 복습 시점을 놓쳐 되돌아간다"인데, 약한 분야가 이미 잡혔다면 숙달률이 낮은
// 이유는 복습 주기가 아니라 그 분야를 계속 틀리기 때문이다. 두 처방을 함께
// 내면 담당자는 "새 문제 배정을 줄이라"는 말을 "이 분야를 가르치라"보다
// 먼저 읽게 되고, 그건 순서가 거꾸로다.
func prescribeRetention(d LearnerDiagnosis, contentGapFound bool) (Prescription, bool) {
	s := d.Summary
	if contentGapFound {
		return Prescription{}, false
	}
	// 표본이 없으면 판단하지 않는다.
	if s.Cards < 10 || s.PeerMastery <= 0 {
		return Prescription{}, false
	}
	gap := s.PeerMastery - s.MasteryRate
	// 숙달률이 또래보다 이만큼 낮아야 '남지 않는다'고 말할 수 있다.
	// 0.15 는 분야 판정(0.25)보다 좁다 — 숙달률은 실패율보다 천천히 움직여
	// 같은 기준을 쓰면 아무것도 걸리지 않는다.
	const masteryGapThreshold = 0.15
	if gap < masteryGapThreshold {
		return Prescription{}, false
	}

	ev := []Evidence{
		{
			Fact:     "푸는 양에 비해 오래 기억에 남는 비율이 낮습니다",
			Observed: fmt.Sprintf("%s %s (푼 문제 %d장 중 %d장)", masteryWord, pctText(s.MasteryRate), s.Cards, s.Mastered),
			Compared: fmt.Sprintf("%s은 %s", peerLongWord, pctText(s.PeerMastery)),
			Sample:   fmt.Sprintf("이 사람의 시도 %d회 · 그중 틀린 것 %d회", s.Reps, s.Lapses),
			Rule: fmt.Sprintf("%s보다 %s 적게 익히면 복습 시점을 놓치는 것으로 봅니다(지금은 %s)",
				peerWord, gapText(masteryGapThreshold), gapText(-gap)),
			Source:   "문제별 복습 단계 집계",
			Strength: evidenceStrengthBySample(s.Cards, 10, 40),
		},
		{
			Fact:     "접속이 뜸해 복습해야 할 때를 놓치고 있습니다",
			Observed: fmt.Sprintf("학습한 날 %d일 · %s", s.ActiveDays, habitText(s.Habitual)),
			Rule: fmt.Sprintf("복습은 때를 놓치면 처음부터 다시 외워야 합니다 — 최근 %d일 중 %d일 이상 접속이 필요합니다",
				habitWindowDays, habitActiveDays),
			Source:   "날짜별 학습 기록",
			Strength: boolStrength(!s.Habitual, "strong", "weak"),
		},
	}

	return Prescription{
		ID: "retention", Priority: "soon", Kind: "retention",
		Title:  "복습 주기 바로잡기",
		Target: "학습 방법 · 복습 간격",
		Why: fmt.Sprintf(
			"새 문제는 계속 푸는데 기억에 남는 비율이 %s보다 %s 낮습니다. "+
				"내용을 몰라서가 아니라 복습할 때를 놓쳐 다시 잊는 것입니다. "+
				"이 상태에서 새 분야를 더 주면 쌓이지 않고 흘러갑니다.", peerWord, gapText(gap)),
		Action: "새 문제 배정을 잠시 줄이고, 복습 알림 시간을 이 사람 근무 시간에 맞춰 다시 잡아 주세요.",
		Expect: fmt.Sprintf("기억에 남는 비율이 %s 수준(%s)까지 올라오면 새 분야를 다시 배정하면 됩니다.",
			peerWord, pctText(s.PeerMastery)),
		Minutes: 15,
		Score:   40 + gap*100,
		// 복습 문제는 급하지 않지만 방치하면 다른 모든 교육의 효과를 깎는다.
		Evidence: ev,
		Cards:    []PrescribedCard{},
	}, true
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. 콘텐츠 손보기 — 이 사람 문제가 아닌 것을 개인 교육으로 처리하지 않기 위해
// ─────────────────────────────────────────────────────────────────────────────

func prescribeContentFix(d LearnerDiagnosis) (Prescription, bool) {
	cards := []PrescribedCard{}
	cats := map[string]struct{}{}
	for _, m := range d.Missed {
		if m.Signal != "shared" {
			continue
		}
		cats[m.Category] = struct{}{}
		if len(cards) < maxCardsPerPrescription {
			cards = append(cards, toPrescribedCard(m))
		}
	}
	if len(cards) == 0 {
		return Prescription{}, false
	}

	ev := []Evidence{{
		Fact:     "이 문제들은 이 사람만이 아니라 대부분의 직원이 틀립니다",
		Observed: fmt.Sprintf("해당 문제 %d장 · 관련 분야 %d개", len(cards), len(cats)),
		Compared: fmt.Sprintf("%s이 틀린 비율", peerLongWord),
		Sample:   fmt.Sprintf("한 문제당 %d명 이상과 비교", minPeersForComparison),
		Rule: fmt.Sprintf("%s도 %s 이상 틀리는 문제는 개인 약점이 아니라 문제나 자료 쪽 원인으로 봅니다",
			peerWord, pctText(sharedDifficultyRate)),
		Source:   "같은 문제를 푼 전체 직원 집계",
		Strength: "strong",
	}}

	return Prescription{
		ID: "content", Priority: "later", Kind: "content",
		Title:  fmt.Sprintf("문제·자료 손보기 %d장", len(cards)),
		Target: "학습 문제 자체(개인 교육 대상 아님)",
		Why: fmt.Sprintf(
			"이 문제들은 이 사람의 약점이라고 볼 수 없습니다. 같은 문제를 %s도 대부분 틀립니다. "+
				"여기에 개인 교육 시간을 쓰면 같은 설명을 사람 수만큼 반복하게 됩니다.", peerWord),
		Action:  "문제 문장이 헷갈리게 쓰였는지, 해설이 이유를 제대로 설명하는지 확인하고 문제를 고치세요. 난이도 표기도 함께 봅니다.",
		Expect:  "문제를 고치면 이 문제들은 다음부터 개인 교육 목록에서 빠집니다.",
		Minutes: len(cards) * 5,
		// 개인 처방보다 낮게 둔다 — 급하지만 '이 사람'의 일은 아니다.
		Score:    20 + float64(len(cards)),
		Evidence: ev,
		Cards:    cards,
	}, true
}

// ─────────────────────────────────────────────────────────────────────────────
// 도우미
// ─────────────────────────────────────────────────────────────────────────────

func toPrescribedCard(m MissedCard) PrescribedCard {
	// 왜 이 문제가 뽑혔는지 — 이 사람의 기록과 비교 대상을 한 줄에 같이 둔다.
	// '10회 중 8회 틀림'만으로는 심각한지 알 수 없다. 옆에 비교 대상이 있어야 뜻이 선다.
	reason := fmt.Sprintf("%d번 중 %d번 틀림(%s)", m.Reps, m.Lapses, pctText(m.LapseRate))
	if m.PeerCount >= minPeersForComparison {
		reason += fmt.Sprintf(" · %s %s(%d명)", peerWord, pctText(m.PeerRate), m.PeerCount)
	} else {
		reason += fmt.Sprintf(" · 비교할 %s 기록이 부족", peerWord)
	}
	return PrescribedCard{
		CardID: m.CardID, Title: firstNonEmpty(m.Title, "(제목 없음)"),
		Category: m.Category, Difficulty: m.Difficulty, Reason: reason,
	}
}

// priorityByGap 은 격차의 크기로 급한 정도를 정한다.
// 임계(0.25)를 갓 넘긴 것과 두 배로 넘긴 것을 같은 급으로 두면 순서가 사라진다.
func priorityByGap(gap float64) string {
	if gap >= personalGapThreshold*2 {
		return "now"
	}
	return "soon"
}

// evidenceStrengthBySample 은 표본 크기만으로 근거의 세기를 정한다.
// 같은 관측이라도 6회짜리와 60회짜리를 같은 무게로 두면 안 된다.
func evidenceStrengthBySample(n, moderateAt, strongAt int64) EvidenceStrength {
	switch {
	case n >= strongAt:
		return "strong"
	case n >= moderateAt:
		return "moderate"
	default:
		return "weak"
	}
}

func boolStrength(cond bool, yes, no EvidenceStrength) EvidenceStrength {
	if cond {
		return yes
	}
	return no
}

// foldConfidence 는 근거들의 세기를 처방 하나의 확신도로 접는다.
//
// 강한 근거 하나보다 강한 근거 둘이 낫다 — 서로 다른 각도의 관측이 같은 결론을
// 가리킬 때 비로소 우연이 아니라고 말할 수 있다.
func foldConfidence(ev []Evidence) string {
	strong, moderate := 0, 0
	for _, e := range ev {
		switch e.Strength {
		case "strong":
			strong++
		case "moderate":
			moderate++
		}
	}
	switch {
	case strong >= 2:
		return "high"
	case strong >= 1 || moderate >= 2:
		return "medium"
	default:
		return "low"
	}
}

func habitText(habitual bool) string {
	if habitual {
		return "습관 형성됨"
	}
	return "아직 불규칙"
}

// summarizeNeeds 는 처방 목록을 한 줄로 압축한다(목록 화면에서 쓴다).
// 상세를 열지 않고도 "이 사람에게 뭐가 필요한지"가 보여야 목록이 쓸모 있다.
func summarizeNeeds(ps []Prescription) string {
	if len(ps) == 0 {
		return "지금 배정할 교육 없음"
	}
	titles := make([]string, 0, 2)
	for _, p := range ps {
		if len(titles) == 2 {
			break
		}
		titles = append(titles, p.Title)
	}
	s := strings.Join(titles, " · ")
	if len(ps) > len(titles) {
		s += fmt.Sprintf(" 외 %d건", len(ps)-len(titles))
	}
	return s
}
