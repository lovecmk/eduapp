package service

import (
	"fmt"
	"sort"
	"time"

	"github.com/lovecmk/eduapp/backend/internal/domain"
	"github.com/lovecmk/eduapp/backend/internal/ports"
)

// 학습자 한 명을 **가르치기 위한** 진단.
//
// ── 이 파일의 존재 이유 ────────────────────────────────────────────────────
// 전체 분석(insight.go)은 "무엇이 문제인가"에 답한다. 여기는 다른 질문에 답한다:
// **"이 사람에게 무엇을 가르쳐야 하는가."**
//
// 그러려면 틀린 목록만으로는 부족하다. 가장 중요한 구분이 하나 있다 —
//
//   · 다들 틀리는 문제를 이 사람도 틀렸다  → 이 사람의 약점이 아니다.
//     문제나 교육 자료를 고쳐야 한다. 개인을 붙잡고 가르치면 시간만 버린다.
//   · 다들 맞히는데 이 사람만 틀린다        → 이 사람의 약점이 맞다.
//     여기에 코칭 시간을 써야 한다.
//
// 또래 비교 없이 오답 목록만 뽑으면 이 둘이 섞인다. 그러면 관리자는 어려운 문제
// 순서대로 코칭하게 되는데, 그건 대부분 헛수고다.

const (
	// personalGapThreshold 는 또래보다 이만큼 더 틀려야 '이 사람만의 약점'으로 본다.
	// 표본이 작을 때 우연한 차이를 약점으로 부르지 않도록 넉넉히 잡는다.
	personalGapThreshold = 0.25

	// sharedDifficultyRate 는 이 비율 이상이 틀리면 '모두가 어려워하는 문제'다.
	// 이런 문제는 개인 코칭이 아니라 콘텐츠를 손봐야 한다.
	sharedDifficultyRate = 0.5

	// minPeersForComparison 은 또래 비교에 필요한 최소 인원(본인 포함).
	// 둘이서 푼 문제로 '남들은 잘한다'를 말할 수 없다.
	minPeersForComparison = 5

	// maxMissedCards 는 한 번에 보여 줄 오답 수. 코칭 한 번에 다룰 수 있는 양을 넘기면
	// 목록이 길다는 이유로 아무것도 안 하게 된다.
	maxMissedCards = 30
)

// LearnerDiagnosis 는 학습자 한 명의 진단 결과.
type LearnerDiagnosis struct {
	UserID   string             `json:"user_id"`
	Name     string             `json:"name"`
	Org      string             `json:"org"`
	Summary  LearnerSummary     `json:"summary"`
	Verdict  []Headline         `json:"verdict"`
	Weakness []CategoryWeakness `json:"weakness"`
	Missed   []MissedCard       `json:"missed"`
	Rhythm   []ActivityPoint    `json:"rhythm"`

	// Prescriptions 는 "그래서 무엇을 가르칠 것인가" — 근거를 달고 나오는 교육 처방.
	// 진단만 있고 처방이 없으면 관리자는 표를 읽고 각자 다른 결론을 낸다.
	Prescriptions []Prescription `json:"prescriptions"`
	// Needs 는 처방을 한 줄로 압축한 것(목록 화면에서 상세를 열지 않고 보기 위해).
	Needs string `json:"needs"`
}

// LearnerSummary 는 한눈에 보는 현황.
//
// 모든 수치에 **또래 평균을 나란히** 둔다. '실패율 30%'는 그 자체로 아무 말도
// 하지 않는다 — 남들이 10% 면 심각하고, 남들도 35% 면 평범하다.
type LearnerSummary struct {
	Cards       int64   `json:"cards"`
	Mastered    int64   `json:"mastered"`
	Reps        int64   `json:"reps"`
	Lapses      int64   `json:"lapses"`
	LapseRate   float64 `json:"lapse_rate"`
	PeerLapse   float64 `json:"peer_lapse_rate"`
	MasteryRate float64 `json:"mastery_rate"`
	PeerMastery float64 `json:"peer_mastery_rate"`
	ActiveDays  int64   `json:"active_days"`
	DaysAway    int     `json:"days_away"`
	Habitual    bool    `json:"habitual"`
	LastSeen    string  `json:"last_seen,omitempty"`
}

// CategoryWeakness 는 분야 하나에 대한 본인 vs 또래.
type CategoryWeakness struct {
	Category  string  `json:"category"`
	Cards     int64   `json:"cards"`
	Reps      int64   `json:"reps"`
	LapseRate float64 `json:"lapse_rate"`
	PeerRate  float64 `json:"peer_rate"`
	// Gap 은 본인 − 또래. 양수면 이 분야를 남보다 어려워한다.
	Gap float64 `json:"gap"`
	// Verdict: weak(본인 약점) | shared(다들 어려움) | ok
	Verdict string `json:"verdict"`
}

// MissedCard 는 이 사람이 틀린 문제 하나 — **가르칠 수 있을 만큼** 담는다.
//
// 문제 제목만 주면 관리자는 그 문제를 다시 찾아 열어야 한다. 그러면 코칭 준비에
// 시간이 들고, 결국 안 하게 된다. 정답과 해설을 함께 실어 이 화면 하나로
// 설명할 수 있게 한다.
type MissedCard struct {
	CardID     string `json:"card_id"`
	Title      string `json:"title"`
	Category   string `json:"category"`
	Difficulty string `json:"difficulty"`
	Question   string `json:"question"`
	// Answer 는 정답(선택형은 정답 보기, 설명형은 결론).
	Answer string `json:"answer"`
	// Explain 은 왜 그런지(원리) — 코칭의 핵심 재료다.
	Explain string `json:"explain"`

	Reps           int64  `json:"reps"`
	Lapses         int64  `json:"lapses"`
	Box            int    `json:"box"`
	LastGrade      string `json:"last_grade"`
	LastReviewedAt string `json:"last_reviewed_at,omitempty"`

	LapseRate float64 `json:"lapse_rate"`
	PeerRate  float64 `json:"peer_rate"`
	PeerCount int64   `json:"peer_count"`
	// Signal: personal(이 사람만 어려워함) | shared(모두 어려워함) | unknown(비교 불가)
	Signal string `json:"signal"`
}

// LearnerInput 은 진단에 필요한 재료.
type LearnerInput struct {
	Now  time.Time
	User domain.User
	// States 는 이 사람의 카드별 간격반복 상태(카드 id → 상태).
	States map[string]domain.SrsState
	// Days 는 이 사람이 학습한 날짜 키 집합.
	Days map[string]struct{}
	// Cards 는 전체 문제(제목·정답·해설을 붙이기 위해).
	Cards []domain.Card
	// PeerStats 는 카드별 전체 집계 — 또래 비교의 기준.
	PeerStats map[string]ports.CardLearningStat
}

// BuildLearnerDiagnosis 는 학습자 한 명의 진단을 만든다.
func BuildLearnerDiagnosis(in LearnerInput) LearnerDiagnosis {
	cardByID := indexCards(in.Cards)

	out := LearnerDiagnosis{
		UserID:   in.User.ID,
		Name:     firstNonEmpty(in.User.Nickname, in.User.UserNm, in.User.LoginID),
		Org:      in.User.OrgNm,
		Weakness: []CategoryWeakness{},
		Missed:   []MissedCard{},
		Rhythm:   buildLearnerRhythm(in.Now, in.Days),
	}

	out.Summary = buildLearnerSummary(in)
	out.Missed = buildMissedCards(in, cardByID)
	out.Weakness = buildWeakness(in, cardByID)
	out.Verdict = buildLearnerVerdict(out)

	// 처방은 진단이 다 끝난 뒤에 만든다 — 위에서 계산한 것과 **같은 값**을 근거로
	// 인용해야 화면의 표와 처방의 근거가 어긋나지 않는다.
	out.Prescriptions = buildPrescriptions(out, in)
	out.Needs = summarizeNeeds(out.Prescriptions)
	return out
}

// ─────────────────────────────────────────────────────────────────────────────

func buildLearnerSummary(in LearnerInput) LearnerSummary {
	s := LearnerSummary{ActiveDays: int64(len(in.Days)), DaysAway: 9999}

	var lastSeen time.Time
	var peerLapseNum, peerLapseDen, peerMasterNum, peerMasterDen float64

	for cardID, st := range in.States {
		s.Cards++
		s.Reps += int64(st.Reps)
		s.Lapses += int64(st.Lapses)
		if st.Box >= masteredBoxLevel {
			s.Mastered++
		}
		if st.LastReviewedAt != nil && st.LastReviewedAt.After(lastSeen) {
			lastSeen = *st.LastReviewedAt
		}
		// 또래 기준은 **이 사람이 실제로 푼 문제들**로만 만든다.
		// 전체 평균과 비교하면 쉬운 문제만 푼 사람이 늘 우수해 보인다.
		if p, ok := in.PeerStats[cardID]; ok && p.Reps > 0 {
			peerLapseNum += float64(p.Lapses)
			peerLapseDen += float64(p.Reps)
			peerMasterNum += float64(p.Mastered)
			peerMasterDen += float64(p.Learners)
		}
	}

	if s.Reps > 0 {
		s.LapseRate = round3(float64(s.Lapses) / float64(s.Reps))
	}
	if s.Cards > 0 {
		s.MasteryRate = round3(float64(s.Mastered) / float64(s.Cards))
	}
	if peerLapseDen > 0 {
		s.PeerLapse = round3(peerLapseNum / peerLapseDen)
	}
	if peerMasterDen > 0 {
		s.PeerMastery = round3(peerMasterNum / peerMasterDen)
	}
	if !lastSeen.IsZero() {
		s.LastSeen = lastSeen.UTC().Format(time.RFC3339)
		s.DaysAway = daysAway(in.Now, lastSeen)
	}
	s.Habitual = isHabitual(in.Now, in.Days)
	return s
}

// masteredBoxLevel 은 '충분히 익혔다'고 보는 기억 상자(저장소 구현과 같은 값).
// MasteredBoxLevel 은 '충분히 익혔다'로 보는 기억 상자 기준.
//
// **앱의 `src/domain/srs.ts` 의 `MASTERED_BOX` 와 같아야 한다.** 갈리면 앱은
// '숙달'로 보여 주는 카드를 서버는 아직 후보로 여겨 오늘의 학습에 또 내보낸다.
// 검사로 못박아 뒀다(TestMasteredBoxMatchesApp).
const MasteredBoxLevel = 4

// masteredBoxLevel 은 패키지 안에서 쓰는 짧은 이름(값은 위와 같다).
const masteredBoxLevel = MasteredBoxLevel

func buildMissedCards(in LearnerInput, cardByID map[string]domain.Card) []MissedCard {
	out := []MissedCard{}
	for cardID, st := range in.States {
		// 틀린 적이 없으면 가르칠 것이 없다.
		if st.Lapses == 0 && st.LastGrade != "again" {
			continue
		}
		c, ok := cardByID[cardID]
		if !ok {
			continue // 지워진 문제 — 가르칠 대상이 아니다
		}

		m := MissedCard{
			CardID: cardID, Title: firstNonEmpty(c.TitleTxt, c.QuestionTxt),
			Category: c.CategoryCd, Difficulty: string(c.DifficultyCd),
			Question: c.QuestionTxt,
			Answer:   answerText(c),
			Explain:  firstNonEmpty(c.PrincipleTxt, c.ConclusionTxt),
			Reps:     int64(st.Reps), Lapses: int64(st.Lapses),
			Box: st.Box, LastGrade: st.LastGrade,
		}
		if st.LastReviewedAt != nil {
			m.LastReviewedAt = st.LastReviewedAt.UTC().Format(time.RFC3339)
		}
		if st.Reps > 0 {
			m.LapseRate = round3(float64(st.Lapses) / float64(st.Reps))
		}
		m.Signal, m.PeerRate, m.PeerCount = compareWithPeers(m.LapseRate, in.PeerStats[cardID])
		out = append(out, m)
	}

	// 정렬: 이 사람만의 약점을 맨 위로. 그 안에서는 많이 틀린 순.
	// '모두 어려워하는 문제'를 위에 두면 개인 코칭 시간을 콘텐츠 문제에 쓰게 된다.
	rank := map[string]int{"personal": 0, "unknown": 1, "shared": 2}
	sort.Slice(out, func(i, j int) bool {
		ri, rj := rank[out[i].Signal], rank[out[j].Signal]
		if ri != rj {
			return ri < rj
		}
		if out[i].Lapses != out[j].Lapses {
			return out[i].Lapses > out[j].Lapses
		}
		return out[i].CardID < out[j].CardID
	})
	if len(out) > maxMissedCards {
		out = out[:maxMissedCards]
	}
	return out
}

// compareWithPeers 는 이 문제에서 본인이 남들보다 유독 어려워하는지 판정한다.
func compareWithPeers(mine float64, peer ports.CardLearningStat) (string, float64, int64) {
	if peer.Learners < minPeersForComparison || peer.Reps == 0 {
		// 비교할 또래가 없으면 판단하지 않는다. '모른다'가 틀린 단정보다 낫다.
		return "unknown", 0, peer.Learners
	}
	rate := round3(float64(peer.Lapses) / float64(peer.Reps))
	switch {
	case rate >= sharedDifficultyRate:
		return "shared", rate, peer.Learners
	case mine-rate >= personalGapThreshold:
		return "personal", rate, peer.Learners
	default:
		return "unknown", rate, peer.Learners
	}
}

// answerText 는 코칭에 쓸 정답 문장을 만든다.
func answerText(c domain.Card) string {
	// 선택형: 정답 보기를 그대로.
	if c.AnswerIndex != nil && *c.AnswerIndex >= 0 && *c.AnswerIndex < len(c.Choices) {
		return c.Choices[*c.AnswerIndex]
	}
	// 설명형: 결론이 곧 답이다.
	return c.ConclusionTxt
}

func buildWeakness(in LearnerInput, cardByID map[string]domain.Card) []CategoryWeakness {
	type acc struct {
		cards, reps, lapses        int64
		peerLapseNum, peerLapseDen float64
	}
	agg := map[string]*acc{}

	for cardID, st := range in.States {
		c, ok := cardByID[cardID]
		if !ok {
			continue
		}
		cat := c.CategoryCd
		if cat == "" {
			cat = "(미분류)"
		}
		a := agg[cat]
		if a == nil {
			a = &acc{}
			agg[cat] = a
		}
		a.cards++
		a.reps += int64(st.Reps)
		a.lapses += int64(st.Lapses)
		if p, ok := in.PeerStats[cardID]; ok && p.Reps > 0 {
			a.peerLapseNum += float64(p.Lapses)
			a.peerLapseDen += float64(p.Reps)
		}
	}

	out := make([]CategoryWeakness, 0, len(agg))
	for cat, a := range agg {
		w := CategoryWeakness{Category: cat, Cards: a.cards, Reps: a.reps, Verdict: "ok"}
		if a.reps > 0 {
			w.LapseRate = round3(float64(a.lapses) / float64(a.reps))
		}
		if a.peerLapseDen > 0 {
			w.PeerRate = round3(a.peerLapseNum / a.peerLapseDen)
			w.Gap = round3(w.LapseRate - w.PeerRate)
			switch {
			case w.PeerRate >= sharedDifficultyRate:
				w.Verdict = "shared"
			case w.Gap >= personalGapThreshold:
				w.Verdict = "weak"
			}
		}
		out = append(out, w)
	}
	// 본인 약점이 큰 분야부터.
	sort.Slice(out, func(i, j int) bool {
		if out[i].Gap != out[j].Gap {
			return out[i].Gap > out[j].Gap
		}
		return out[i].Category < out[j].Category
	})
	return out
}

func buildLearnerRhythm(now time.Time, days map[string]struct{}) []ActivityPoint {
	out := make([]ActivityPoint, 0, activityTrendDay)
	for i := activityTrendDay - 1; i >= 0; i-- {
		d := now.AddDate(0, 0, -i)
		count := int64(0)
		if _, ok := days[DayKey(d)]; ok {
			count = 1
		}
		out = append(out, ActivityPoint{
			Day: d.Format("2006-01-02"), Users: count, Weekday: int(d.Weekday()),
		})
	}
	return out
}

// buildLearnerVerdict 는 "이 사람에게 무엇을 해야 하는가"를 문장으로 만든다.
//
// 표를 읽고 스스로 판단하라고 두면, 바쁜 관리자는 결국 아무것도 하지 않는다.
// 여기서 결론까지 낸다.
func buildLearnerVerdict(d LearnerDiagnosis) []Headline {
	out := []Headline{}

	if d.Summary.Cards == 0 {
		return append(out, Headline{
			Severity: "info", Title: "아직 학습을 시작하지 않았습니다",
			Detail: "가입은 했지만 푼 문제가 없습니다. 첫 학습을 안내해 주세요.",
			Metric: "0장",
		})
	}

	// 1) 개인 약점 — 코칭 시간을 여기에 쓴다.
	personal := 0
	for _, m := range d.Missed {
		if m.Signal == "personal" {
			personal++
		}
	}
	if personal > 0 {
		first := ""
		for _, m := range d.Missed {
			if m.Signal == "personal" {
				first = m.Title
				break
			}
		}
		out = append(out, Headline{
			Severity: "critical",
			Title:    fmt.Sprintf("이 사람만 어려워하는 문제 %d개", personal),
			Detail: fmt.Sprintf(
				"%s은 대체로 맞히는데 이 사람은 계속 틀립니다. 여기부터 설명해 주세요. 예: %s",
				peerWord, first),
			Metric: fmt.Sprintf("%d개", personal),
		})
	}

	// 2) 약한 분야.
	for _, w := range d.Weakness {
		if w.Verdict != "weak" {
			continue
		}
		out = append(out, Headline{
			Severity: "warn",
			Title:    fmt.Sprintf("'%s' 분야를 %s보다 어려워합니다", w.Category, peerWord),
			Detail: fmt.Sprintf("이 사람은 %s를 틀리고 %s은 %s를 틀립니다. 이 분야를 묶어서 다시 교육하는 편이 빠릅니다.",
				pctText(w.LapseRate), peerWord, pctText(w.PeerRate)),
			Metric: gapText(w.Gap),
		})
	}

	// 3) 다들 어려워하는 문제 — 개인이 아니라 콘텐츠를 손볼 일이다.
	shared := 0
	for _, m := range d.Missed {
		if m.Signal == "shared" {
			shared++
		}
	}
	if shared > 0 {
		out = append(out, Headline{
			Severity: "info",
			Title:    fmt.Sprintf("모두가 어려워하는 문제 %d개", shared),
			Detail:   "이 사람의 약점이 아닙니다. 개인 교육 대신 문제나 교육 자료를 손보세요.",
			Metric:   fmt.Sprintf("%d개", shared),
			Link:     "cards",
		})
	}

	// 4) 학습이 끊겼는가 — 무엇을 가르치든 오지 않으면 소용없다.
	if d.Summary.DaysAway >= churnWarnDays {
		sev := "warn"
		if d.Summary.DaysAway >= churnRiskDays {
			sev = "critical"
		}
		away := fmt.Sprintf("%d일", d.Summary.DaysAway)
		if d.Summary.DaysAway >= 9999 {
			away = "기록 없음"
		}
		out = append(out, Headline{
			Severity: sev, Title: "학습이 끊겼습니다",
			Detail: "무엇을 가르칠지 정하기 전에, 다시 학습하러 오게 하는 것이 먼저입니다.",
			Metric: away,
		})
	}

	if len(out) == 0 {
		out = append(out, Headline{
			Severity: "good", Title: "따로 가르칠 것이 없습니다",
			Detail: fmt.Sprintf("%s과 비교해 뒤처지는 분야가 없고 학습도 이어지고 있습니다.", peerWord),
			Metric: "양호",
		})
	}
	return out
}
